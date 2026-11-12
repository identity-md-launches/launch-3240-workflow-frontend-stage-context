import { useApp } from "./context";
import {
  contract,
  moduleCode,
  moduleNames,
  protocol,
  LAUNCH_NUMBER,
} from "./config";
import { Section, Tx, AddressLink } from "./components";
import { same, amountText } from "./chain";
export function Setup() {
  const { c, s, account } = useApp();
  const desk = contract(c, "LpDesk"),
    token = contract(c, "LaunchToken"),
    vault = contract(c, "FirmVault"),
    splitter = contract(c, "GenesisSplitter");
  if (!s)
    return (
      <Section title="Setup">
        <p>Reading launch setup…</p>
      </Section>
    );
  const all = s.modules.every(Boolean),
    funded = s.splitBalance >= 600000000n * 10n ** 18n,
    feeReady = same(s.feeRecipient, vault.address);
  return (
    <Section
      title="Launch setup"
      aside={<span className="hint">Launch {LAUNCH_NUMBER.toString()}</span>}
    >
      <p>
        Deploy the modules, fund genesis, route the pool fee, then register and
        split.
      </p>
      <div className="setup-list">
        {moduleNames.map((name, kind) => (
          <div className="setup-row" key={name}>
            <div>
              <h3>{name}</h3>
              <span className="hint">
                {s.modules[kind] ? "Deployed" : "After setup"}
              </span>
            </div>
            {s.modules[kind] ? (
              <AddressLink
                address={[s.governor, s.guard, s.venueV3, s.venueV4][kind]}
              />
            ) : (
              <Tx
                label={`Deploy ${name}`}
                description={`Deploy ${name} at the address predicted by LP Desk, using the creation code verified against its on-chain hash.`}
                call={async () => ({
                  ...desk,
                  functionName: "deployModule",
                  args: [kind, await moduleCode(c, kind)],
                })}
              />
            )}
          </div>
        ))}
      </div>
      {!s.splitDone && !funded && (
        <div className="setup-row">
          <div>
            <h3>Fund GenesisSplitter</h3>
            <p className="hint">
              Current balance: {amountText(s.splitBalance)} NOTSTOCK
            </p>
          </div>
          <Tx
            label="Fund GenesisSplitter"
            description="Transfer exactly 600,000,000 NOTSTOCK from the project wallet to GenesisSplitter."
            reason={
              !all
                ? "Deploy all modules first"
                : !same(account, s.projectWallet)
                  ? "Connect the project wallet"
                  : (s.walletStock ?? 0n) < 600000000n * 10n ** 18n
                    ? "The project wallet needs 600,000,000 NOTSTOCK"
                    : ""
            }
            call={{
              ...token,
              functionName: "transfer",
              args: [splitter.address, 600000000n * 10n ** 18n],
            }}
          />
        </div>
      )}
      {!feeReady && (
        <div className="setup-row">
          <div>
            <h3>Route the 1% pool fee</h3>
            <p className="hint">
              Current recipient: <AddressLink address={s.feeRecipient} />
            </p>
          </div>
          <Tx
            label="Set FirmVault recipient"
            description={`Set FirmVault as the requester fee recipient for launch ${LAUNCH_NUMBER}.`}
            reason={
              !all
                ? "Deploy all modules first"
                : !same(account, s.feeRecipient)
                  ? "Connect the current fee recipient wallet"
                  : ""
            }
            call={{
              address: s.factory,
              abi: protocol.factory,
              functionName: "setRequester",
              args: [LAUNCH_NUMBER, vault.address],
            }}
          />
        </div>
      )}
      {!s.registered && (
        <div className="setup-row">
          <div>
            <h3>Register the launch</h3>
            <p className="hint">Starts the seven-day bootstrap.</p>
          </div>
          <Tx
            label="Register"
            description={`Register launch ${LAUNCH_NUMBER} in PriceGuard. This starts the seven-day operator bootstrap.`}
            reason={
              !s.modules[1]
                ? "Deploy PriceGuard first"
                : !all
                  ? "Deploy all modules first"
                  : !funded
                    ? "Fund GenesisSplitter first"
                    : !feeReady
                      ? "Set FirmVault as the fee recipient first"
                      : ""
            }
            call={{
              address: s.guard,
              abi: c.abis.PriceGuard,
              functionName: "registerNotStock",
              args: [LAUNCH_NUMBER],
            }}
          />
        </div>
      )}
      {!s.splitDone && (
        <div className="setup-row">
          <div>
            <h3>Split genesis</h3>
            <p className="hint">
              500,000,000 to LP Desk; 100,000,000 to the dev wallet for an exact
              600,000,000 deposit.
            </p>
          </div>
          <Tx
            label="Split"
            description="Split GenesisSplitter’s full balance: 10/60 to the dev wallet and the rest to LP Desk. This can happen only once."
            reason={
              !s.registered
                ? "Register first"
                : s.splitBalance === 0n
                  ? "Fund GenesisSplitter first"
                  : ""
            }
            call={{ ...splitter, functionName: "split" }}
          />
        </div>
      )}
      {s.splitDone && s.registered && (
        <p className="success">Genesis setup complete.</p>
      )}
    </Section>
  );
}
