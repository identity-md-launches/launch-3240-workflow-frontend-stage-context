import { useState } from "react";
import { isAddress, pad, type Address } from "viem";
import { useApp } from "./context";
import { contract, protocol } from "./config";
import { amountText, same, type Proposal } from "./chain";
import {
  Section,
  Stat,
  Amount,
  Field,
  Select,
  Tx,
  Empty,
  AddressLink,
  date,
  remaining,
} from "./components";
import { checkAmount, parseAmount } from "./math";
import { OpenForm } from "./Operator";
export const kinds = [
  "OpenPosition",
  "AddAsset",
  "AddVenue",
  "AddBridge",
  "BridgeOut",
];
const statuses = [
  "Voting",
  "Failed",
  "Passed",
  "Vetoed",
  "Executable",
  "Executed",
  "Expired",
];
export const validAddress = (a: string) =>
  isAddress(a.trim()) && BigInt(a.trim()) !== 0n;
export function Governance() {
  const { c, s, account } = useApp();
  const [amount, setAmount] = useState(""),
    [unstake, setUnstake] = useState(false);
  const stock = contract(c, "LaunchToken");
  const governor = s?.governor;
  const [kind, setKind] = useState("AddAsset"),
    [target, setTarget] = useState(""),
    [venueKind, setVenueKind] = useState("1"),
    [dst, setDst] = useState(""),
    [eid, setEid] = useState(""),
    [bridgeId, setBridgeId] = useState("0"),
    [bridgeAmount, setBridgeAmount] = useState("");
  const govReady = s?.modules[0];
  const balance = unstake ? s?.stake : s?.walletStock;
  const amountReason = checkAmount(amount, 18, balance, "NOTSTOCK");
  let parsed = 0n;
  try {
    parsed = parseAmount(amount, 18);
  } catch {}
  const operator = same(account, s?.operator),
    eligible =
      !!s &&
      (operator ||
        ((s.stake ?? 0n) > 0n &&
          (s.stake ?? 0n) * 10000n >= (s.totalStaked ?? 0n) * 10n));
  const gating = !govReady
    ? "Deploy LpGovernor first"
    : !eligible
      ? "Stake at least 0.1% of total staked NOTSTOCK to propose"
      : "";
  let proposeReason = gating;
  if (!proposeReason) {
    if (kind === "BridgeOut") {
      proposeReason = !s?.bridges.length
        ? "Add a bridge through governance first"
        : checkAmount(
            bridgeAmount,
            18,
            s.tokens.find((t) => same(t.address, stock.address))?.free,
            "free NOTSTOCK",
          );
    } else if (kind !== "OpenPosition" && !validAddress(target))
      proposeReason = "Enter a valid nonzero contract address.";
    if (
      kind === "AddBridge" &&
      (!validAddress(dst) ||
        !/^\d+$/.test(eid) ||
        Number(eid) <= 0 ||
        Number(eid) > 4294967295)
    )
      proposeReason =
        "Enter a valid destination desk and LayerZero destination ID.";
  }
  return (
    <>
      <Section title="Stake & govern">
        <div className="stats">
          <Stat label="Your staked balance">
            {!account
              ? "Connect wallet"
              : !govReady
                ? "After setup"
                : `${amountText(s?.stake)} NOTSTOCK`}
          </Stat>
          <Stat label="Total staked">
            {govReady
              ? `${amountText(s?.totalStaked)} NOTSTOCK`
              : "After setup"}
          </Stat>
          <Stat label="Proposal threshold">
            0.1% <span className="hint">of all staked NOTSTOCK</span>
          </Stat>
        </div>
        <div className="compact-form">
          <div className="segmented">
            <button
              aria-pressed={!unstake}
              onClick={() => {
                setUnstake(false);
                setAmount("");
              }}
            >
              Stake
            </button>
            <button
              aria-pressed={unstake}
              onClick={() => {
                setUnstake(true);
                setAmount("");
              }}
            >
              Unstake
            </button>
          </div>
          <Amount
            label={unstake ? "Amount to unstake" : "Amount to stake"}
            value={amount}
            onChange={setAmount}
            balance={balance}
            balanceLabel={
              account && unstake && !govReady ? "After setup" : undefined
            }
            unit="NOTSTOCK"
            error={amountReason}
          />
          {!unstake && parsed > 0n && (s?.allowance ?? 0n) < parsed ? (
            <Tx
              key="approve-staking"
              label="Approve staking"
              description={`Allow LpGovernor to transfer exactly ${amount} NOTSTOCK for staking.`}
              reason={!govReady ? "Deploy LpGovernor first" : amountReason}
              call={{
                ...stock,
                functionName: "approve",
                args: [governor, parsed],
              }}
            />
          ) : (
            <Tx
              key={unstake ? "unstake" : "stake"}
              label={unstake ? "Unstake NOTSTOCK" : "Stake NOTSTOCK"}
              description={
                unstake
                  ? `Return ${amount} NOTSTOCK to your wallet.`
                  : `Stake ${amount} NOTSTOCK in LpGovernor for future voting snapshots.`
              }
              reason={!govReady ? "Deploy LpGovernor first" : amountReason}
              call={async () => ({
                address: governor!,
                abi: c.abis.LpGovernor,
                functionName: unstake ? "unstake" : "stake",
                args: [parseAmount(amount, 18)],
              })}
            />
          )}
        </div>
        <p className="hint">
          Three-day vote · 3% quorum · Two-day operator veto · Three-day
          execution window. Voting uses the stake snapshot from the block before
          proposal creation.
        </p>
      </Section>
      <Section title="Propose a change">
        <Select label="Proposal kind" value={kind} onChange={setKind}>
          {kinds.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
        {kind === "OpenPosition" ? (
          <OpenForm propose reason={gating} />
        ) : (
          <div className="compact-form">
            {kind !== "BridgeOut" && (
              <Field
                label={
                  kind === "AddAsset"
                    ? "Asset contract address"
                    : kind === "AddVenue"
                      ? "Position manager address"
                      : "Bridge adapter address"
                }
                value={target}
                onChange={setTarget}
              />
            )}{" "}
            {kind === "AddVenue" && (
              <Select
                label="Venue kind"
                value={venueKind}
                onChange={setVenueKind}
              >
                <option value="1">V3</option>
                <option value="2">CL</option>
                <option value="0">V4</option>
              </Select>
            )}
            {kind === "AddBridge" && (
              <>
                <Field
                  label="LayerZero destination ID"
                  value={eid}
                  onChange={setEid}
                  hint="Use the destination’s LayerZero endpoint ID, not its EVM chain ID."
                />
                <Field
                  label="Destination LP Desk address"
                  value={dst}
                  onChange={setDst}
                />
              </>
            )}
            {kind === "BridgeOut" && (
              <>
                <Select
                  label="Registered bridge"
                  value={bridgeId}
                  onChange={setBridgeId}
                >
                  {s?.bridges.map((b, i) => (
                    <option key={i} value={i}>
                      Bridge {i} · Destination {b.dstEid}
                    </option>
                  ))}
                </Select>
                <Amount
                  label="NOTSTOCK to bridge"
                  unit="NOTSTOCK"
                  value={bridgeAmount}
                  onChange={setBridgeAmount}
                  balance={
                    s?.tokens.find((t) => same(t.address, stock.address))?.free
                  }
                />
              </>
            )}
            <Tx
              label={`Propose ${kind}`}
              description={`Submit ${kind} to a three-day vote, followed by the two-day operator veto. ${kind === "BridgeOut" ? `${bridgeAmount} NOTSTOCK to bridge ${bridgeId}.` : target}`}
              reason={proposeReason}
              call={async () => ({
                address: governor!,
                abi: c.abis.LpGovernor,
                functionName: `propose${kind}`,
                args:
                  kind === "AddAsset"
                    ? [target.trim()]
                    : kind === "AddVenue"
                      ? [target.trim(), Number(venueKind)]
                      : kind === "AddBridge"
                        ? [target.trim(), Number(eid), dst.trim()]
                        : [BigInt(bridgeId), parseAmount(bridgeAmount, 18)],
              })}
            />
          </div>
        )}
      </Section>
      <Section
        title="Proposals"
        aside={<span className="hint">Open and past</span>}
      >
        {!govReady ? (
          <Empty>After setup</Empty>
        ) : !s?.proposals.length ? (
          <Empty>No proposals yet. Stake NOTSTOCK to propose a change.</Empty>
        ) : (
          s.proposals
            .slice()
            .reverse()
            .map((p) => <ProposalRow key={p.id} p={p} />)
        )}
      </Section>
    </>
  );
}
function ProposalRow({ p }: { p: Proposal }) {
  const { c, s, account } = useApp();
  const gov = { address: s!.governor, abi: c.abis.LpGovernor };
  const quorum = (p.quorumBase * 300n) / 10000n;
  const cast = p.forWeight + p.againstWeight;
  const percent =
    quorum > 0n ? Math.min(100, Number((cast * 10000n) / quorum) / 100) : 0;
  return (
    <article className="proposal">
      <div className="section-head">
        <h3>
          #{p.id} · {kinds[p.kind]}
        </h3>
        <span className="status">{statuses[p.state]}</span>
      </div>
      <dl className="details">
        <div>
          <dt>For</dt>
          <dd>{amountText(p.forWeight)} NOTSTOCK</dd>
        </div>
        <div>
          <dt>Against</dt>
          <dd>{amountText(p.againstWeight)} NOTSTOCK</dd>
        </div>
        <div>
          <dt>Quorum progress</dt>
          <dd>
            {percent.toFixed(2)}% of {amountText(quorum)} NOTSTOCK
          </dd>
        </div>
        <div>
          <dt>Vote closes</dt>
          <dd>{date(p.deadlines[0])}</dd>
        </div>
        <div>
          <dt>Veto ends</dt>
          <dd>{date(p.deadlines[1])}</dd>
        </div>
        <div>
          <dt>Execution expires</dt>
          <dd>{date(p.deadlines[2])}</dd>
        </div>
      </dl>
      <progress max="100" value={percent} aria-label="Quorum progress" />
      {[2, 4].includes(p.state) && (
        <p>
          {remaining(p.deadlines[2], s!.timestamp)} until execution expires.
        </p>
      )}
      <details>
        <summary>Proposal details</summary>
        <dl>
          <div>
            <dt>Author</dt>
            <dd>
              <AddressLink address={p.author} />
            </dd>
          </div>
          <div>
            <dt>Snapshot block</dt>
            <dd>{p.snapshotBlock.toString()}</dd>
          </div>
          {p.kind === 0 ? (
            <>
              <div>
                <dt>Asset</dt>
                <dd>
                  <AddressLink address={p.open.asset} />
                </dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>
                  <AddressLink address={p.open.venue} />
                </dd>
              </div>
              <div>
                <dt>Ticks</dt>
                <dd>
                  {p.open.tickLower} to {p.open.tickUpper}
                </dd>
              </div>
            </>
          ) : p.kind === 4 ? (
            <>
              <div>
                <dt>Bridge</dt>
                <dd>{p.bridgeId.toString()}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{amountText(p.amount)} NOTSTOCK</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Target</dt>
              <dd>
                <AddressLink address={p.target} />
              </dd>
            </div>
          )}
          {p.kind === 3 && (
            <>
              <div>
                <dt>Destination endpoint</dt>
                <dd>{p.dstEid}</dd>
              </div>
              <div>
                <dt>Destination desk</dt>
                <dd>
                  <AddressLink address={p.dstLpDesk} />
                </dd>
              </div>
            </>
          )}
        </dl>
      </details>
      <div className="actions">
        {p.state === 0 &&
          [true, false].map((support) => (
            <Tx
              key={String(support)}
              label={support ? "Vote for" : "Vote against"}
              description={`Vote ${support ? "for" : "against"} proposal #${p.id} with ${amountText(p.weight)} NOTSTOCK of snapshot weight.`}
              reason={
                p.voted
                  ? "You have already voted"
                  : p.weight === 0n
                    ? "No stake at this proposal’s snapshot"
                    : ""
              }
              call={{
                ...gov,
                functionName: "vote",
                args: [BigInt(p.id), support],
              }}
            />
          ))}
        {p.state === 2 && same(account, s!.operator) && (
          <Tx
            label="Veto"
            description={`Permanently veto proposal #${p.id}.`}
            call={{ ...gov, functionName: "veto", args: [BigInt(p.id)] }}
          />
        )}
        {p.state === 4 && (
          <Tx
            label="Execute proposal"
            description={`Execute proposal #${p.id}: ${kinds[p.kind]}.${p.kind === 4 ? " The LayerZero fee is shown in the transaction preview and paid by your wallet." : ""}`}
            call={async () => {
              let value = 0n;
              if (p.kind === 4) {
                const b = s!.bridges[Number(p.bridgeId)];
                const fee = await c.client.readContract({
                  address: b.adapter,
                  abi: protocol.bridge,
                  functionName: "quoteSend",
                  args: [
                    {
                      dstEid: b.dstEid,
                      to: pad(b.dstLpDesk as Address, { size: 32 }),
                      amountLD: p.amount,
                      minAmountLD: p.amount,
                      extraOptions: "0x",
                      composeMsg: "0x",
                      oftCmd: "0x",
                    },
                    false,
                  ],
                });
                value = fee.nativeFee;
              }
              return {
                ...gov,
                functionName: "execute",
                args: [BigInt(p.id)],
                value,
              };
            }}
          />
        )}
      </div>
    </article>
  );
}
export function Bridges() {
  const { s, history: h, historyStatus, c } = useApp();
  return (
    <Section title="Bridges">
      {!s?.modules[0] ? (
        <Empty>After setup</Empty>
      ) : !s.bridges.length ? (
        <Empty>
          No registered bridges. AddBridge proposals require the same vote and
          veto.
        </Empty>
      ) : (
        s.bridges.map((b, i) => (
          <div className="bridge-row" key={i}>
            <h3>Bridge {i}</h3>
            <dl>
              <div>
                <dt>Adapter</dt>
                <dd>
                  <AddressLink address={b.adapter} />
                </dd>
              </div>
              <div>
                <dt>Destination LayerZero ID</dt>
                <dd>{b.dstEid}</dd>
              </div>
              <div>
                <dt>Destination LP Desk</dt>
                <dd>
                  <AddressLink address={b.dstLpDesk} />
                </dd>
              </div>
            </dl>
          </div>
        ))
      )}
      <h3>BridgeOut history</h3>
      {!h ? (
        <p className="hint">{historyStatus || "Reading chain history…"}</p>
      ) : h.bridges.length ? (
        h.bridges.map((b, i) => (
          <div className="data-row" key={i}>
            <a
              href={`${c.deployment.network.explorer}/tx/${b.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {amountText(b.amount)} NOTSTOCK ↗
            </a>
            <span>
              Destination {b.dstEid} · <AddressLink address={b.dstLpDesk} />
            </span>
          </div>
        ))
      ) : (
        <p>No BridgeOut executions since launch.</p>
      )}
    </Section>
  );
}
