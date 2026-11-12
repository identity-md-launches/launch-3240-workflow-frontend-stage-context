import { useEffect, useRef, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useApp } from "./context";
import { contract } from "./config";
import {
  read,
  same,
  posRef,
  amountText,
  priceInAsset,
  type Position,
  type Venue,
} from "./chain";
import {
  Section,
  Amount,
  Field,
  Select,
  Tx,
  Empty,
  AddressLink,
  date,
} from "./components";
import {
  parseAmount,
  checkAmount,
  positionPreview,
  sqrtPrice,
  tickRange,
  amountsFor,
  sqrtTick,
  liquidityFrom,
  minimum,
} from "./math";
import { explain } from "./errors";
import { validAddress } from "./Governance";
export const venueLabel = (v: Venue, index: number) =>
  index === 0
    ? "Uniswap v4"
    : index === 1
      ? "Uniswap v3"
      : index === 2
        ? "Aero Slipstream"
        : `${["V4", "V3", "CL"][v.kind]} · ${v.positionManager}`;
export function OpenForm({
  propose = false,
  reason = "",
}: {
  propose?: boolean;
  reason?: string;
}) {
  const { c, s } = useApp();
  const stock = contract(c, "LaunchToken").address;
  const assets = s?.tokens.filter((t) => !same(t.address, stock)) ?? [],
    venues = s?.venues ?? [];
  const [asset, setAsset] = useState(""),
    [venue, setVenue] = useState(""),
    [fee, setFee] = useState("3000"),
    [spacing, setSpacing] = useState("60"),
    [price, setPrice] = useState(""),
    [low, setLow] = useState(""),
    [high, setHigh] = useState(""),
    [amount, setAmount] = useState(""),
    [current, setCurrent] = useState<bigint>(),
    [poolError, setPoolError] = useState(""),
    [loading, setLoading] = useState(false);
  const token = assets.find((t) => same(t.address, asset)),
    v = venues.find((v) => same(v.positionManager, venue));
  const stockIs0 = stock.toLowerCase() < asset.toLowerCase();
  const poolSelection = useRef("");
  useEffect(() => {
    if (!asset && assets[0]) setAsset(assets[0].address);
    if (!venue && venues[0]) setVenue(venues[0].positionManager);
  }, [s?.venues.length, s?.tokens.length]);
  useEffect(() => {
    if (!v || !token || !s?.modules.every(Boolean)) return;
    let stop = false;
    const selection = `${asset}:${venue}:${fee}:${v.kind === 1 ? "v3" : spacing}`;
    const changed = selection !== poolSelection.current;
    setLoading(true);
    if (changed) {
      setCurrent(undefined);
      setPrice("");
    }
    setPoolError("");
    const r = posRef(
      {
        positionManager: v.positionManager,
        kind: v.kind,
        asset: token.address,
        fee: Number(fee),
        tickSpacing: Number(spacing),
        tickLower: 0,
        tickUpper: 0,
        tokenId: 0n,
      },
      stock,
    );
    const name = v.kind === 0 ? "VenueV4" : "VenueV3",
      address = v.kind === 0 ? s.venueV4 : s.venueV3;
    Promise.all([
      read(c, name, address, "poolPrice", [r]),
      v.kind === 1
        ? read(c, name, address, "tickSpacingOf", [r])
        : Number(spacing),
    ])
      .then(([result, tickSpacing]) => {
        if (stop) return;
        poolSelection.current = selection;
        if (v.kind === 1) setSpacing(String(tickSpacing));
        setCurrent(result[1]);
        if (result[0] && changed) {
          const p = priceInAsset(result[1], stockIs0, token.decimals);
          setPrice(p.toFixed(18).replace(/0+$/, "").replace(/\.$/, ""));
          setLow((p * 0.5).toFixed(18));
          setHigh((p * 2).toFixed(18));
        }
      })
      .catch((e) => {
        if (!stop) setPoolError(explain(e));
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [
    asset,
    venue,
    fee,
    v?.kind === 1 ? "v3" : spacing,
    s?.modules.join(","),
    s?.block,
  ]);
  let preview: ReturnType<typeof positionPreview> | undefined,
    params: any,
    validation = reason,
    unit = "NOTSTOCK",
    decimals = 18,
    balance = s?.tokens.find((t) => same(t.address, stock))?.free;
  try {
    if (!token || !v)
      throw Error("Deploy PriceGuard to load the asset and venue lists.");
    if (!/^\d+$/.test(fee) || Number(fee) >= 1000000)
      throw Error("Enter a fee tier below 1,000,000.");
    const sp = sqrtPrice(price, stockIs0, token.decimals),
      [lower, upper] = tickRange(
        low,
        high,
        stockIs0,
        token.decimals,
        Number(spacing),
      );
    const probe = positionPreview(sp, lower, upper, 10n ** 18n, stockIs0);
    if (probe.assetOnly) {
      unit = token.symbol;
      decimals = token.decimals;
      balance = token.free;
    }
    const n = parseAmount(amount, decimals);
    preview = positionPreview(sp, lower, upper, n, stockIs0);
    const ns = stockIs0 ? preview.amount0 : preview.amount1,
      as = stockIs0 ? preview.amount1 : preview.amount0;
    if (
      ns > (s?.tokens.find((t) => same(t.address, stock))?.free ?? 0n) ||
      as > token.free
    )
      throw Error(
        "This position needs more than LP Desk’s free balance. Lower the amount.",
      );
    params = {
      asset: token.address,
      venue: v.positionManager,
      feeTier: Number(fee),
      tickSpacing: Number(spacing),
      tickLower: lower,
      tickUpper: upper,
      sqrtPriceX96: sp,
      amount: n,
      amount0Min: preview.min0,
      amount1Min: preview.min1,
    };
  } catch (e) {
    validation ||= (e as Error).message;
  }
  if (!validation && !s?.registered) validation = "Register the launch first";
  if (!validation && propose && s && s.timestamp < s.bootstrapEnd)
    validation = "OpenPosition proposals are available after bootstrap ends";
  if (!validation && !propose && s && s.timestamp >= s.bootstrapEnd)
    validation = "Bootstrap ended. Propose a new position through governance.";
  if (loading) validation = "Reading pool price…";
  if (poolError) validation = poolError;
  function preset(n: number) {
    const p = Number(price);
    if (p > 0) {
      setLow((p * (n === 2 ? 0.5 : 1 - n)).toFixed(18));
      setHigh((p * (n === 2 ? 2 : 1 + n)).toFixed(18));
    }
  }
  return (
    <div className="open-form">
      <div className="form-grid">
        <Select label="Pair asset" value={asset} onChange={setAsset}>
          {assets.map((t) => (
            <option value={t.address} key={t.address}>
              {t.symbol}
            </option>
          ))}
        </Select>
        <Select label="Venue" value={venue} onChange={setVenue}>
          {venues.map((v, i) => (
            <option key={v.positionManager} value={v.positionManager}>
              {venueLabel(v, i)}
            </option>
          ))}
        </Select>
        {v?.kind !== 2 && (
          <Field label="Fee tier (millionths)" value={fee} onChange={setFee} />
        )}{" "}
        {v?.kind !== 1 && (
          <Field label="Tick spacing" value={spacing} onChange={setSpacing} />
        )}
        <Field
          label={`Price (${token?.symbol ?? "asset"} per NOTSTOCK)`}
          value={price}
          onChange={setPrice}
          hint="Open fails if the pool price differs from this price by more than 0.5%"
        />
        <div className="field">
          <span>Current pool price</span>
          <strong>
            {loading
              ? "Reading pool…"
              : current === undefined
                ? "Choose asset and venue"
                : current === 0n
                  ? "No pool yet; enter a price"
                  : `${priceInAsset(current, stockIs0, token?.decimals ?? 18).toPrecision(7)} ${token?.symbol} per NOTSTOCK`}
          </strong>
        </div>
        <Field
          label={`Range from (${token?.symbol ?? "asset"} per NOTSTOCK)`}
          value={low}
          onChange={setLow}
        />
        <Field
          label={`Range to (${token?.symbol ?? "asset"} per NOTSTOCK)`}
          value={high}
          onChange={setHigh}
        />
      </div>
      <div className="actions">
        <button onClick={() => preset(0.2)}>Narrow ±20%</button>
        <button onClick={() => preset(0.5)}>Medium ±50%</button>
        <button onClick={() => preset(2)}>Wide 2×</button>
      </div>
      <Amount
        label={`${unit} amount from LP Desk`}
        value={amount}
        onChange={setAmount}
        unit={unit}
        balance={balance}
        decimals={decimals}
      />
      {preview && params && (
        <div className="preview">
          <h3>Position preview</h3>
          <dl>
            <div>
              <dt>Lower / upper ticks</dt>
              <dd>
                {params.tickLower} / {params.tickUpper}
              </dd>
            </div>
            <div>
              <dt>NOTSTOCK in / minimum</dt>
              <dd>
                {amountText(stockIs0 ? preview.amount0 : preview.amount1)} /{" "}
                {amountText(stockIs0 ? preview.min0 : preview.min1)}
              </dd>
            </div>
            <div>
              <dt>{token?.symbol} in / minimum</dt>
              <dd>
                {amountText(
                  stockIs0 ? preview.amount1 : preview.amount0,
                  token?.decimals,
                )}{" "}
                /{" "}
                {amountText(
                  stockIs0 ? preview.min1 : preview.min0,
                  token?.decimals,
                )}
              </dd>
            </div>
            <div>
              <dt>NOTSTOCK left in LP Desk</dt>
              <dd>
                {amountText(
                  (s?.tokens.find((t) => same(t.address, stock))?.free ?? 0n) -
                    (stockIs0 ? preview.amount0 : preview.amount1),
                )}
              </dd>
            </div>
            <div>
              <dt>{token?.symbol} left in LP Desk</dt>
              <dd>
                {amountText(
                  (token?.free ?? 0n) -
                    (stockIs0 ? preview.amount1 : preview.amount0),
                  token?.decimals,
                )}
              </dd>
            </div>
          </dl>
          <p className="hint">
            Minimums are 99.5% of the preview. Unused tokens remain in LP Desk.
          </p>
        </div>
      )}
      <Tx
        label={propose ? "Propose OpenPosition" : "Open position"}
        description={`${propose ? "Propose" : "Open"} the displayed ${unit} position, ticks ${params?.tickLower} to ${params?.tickUpper}, with the displayed 99.5% minimums.`}
        reason={validation}
        call={async () =>
          propose
            ? {
                address: s!.governor,
                abi: c.abis.LpGovernor,
                functionName: "proposeOpenPosition",
                args: [params],
              }
            : { ...contract(c, "LpDesk"), functionName: "open", args: [params] }
        }
      />
    </div>
  );
}
export function Operator() {
  const { c, s, account } = useApp();
  const [burn, setBurn] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState("");
  const isOperator = same(account, s?.operator),
    desk = contract(c, "LpDesk"),
    stock = contract(c, "LaunchToken").address,
    free = s?.tokens.find((t) => same(t.address, stock))?.free;
  return (
    <Section
      title="Operator"
      aside={
        s ? (
          <AddressLink address={s.operator} label="Current operator" />
        ) : undefined
      }
    >
      <p>
        {isOperator
          ? "Connected as the current operator."
          : "Operator controls are available only to the current operator wallet."}
      </p>
      <p className="hint">
        Bootstrap ends: {date(s?.bootstrapEnd)}. Positions can be collected,
        shifted or closed at any time by the operator.
      </p>
      {isOperator && (
        <details open>
          <summary>Open a position</summary>
          <OpenForm />
        </details>
      )}
      <h3>Positions</h3>
      {!s?.positions.length ? (
        <Empty>No open positions yet.</Empty>
      ) : (
        s.positions.map((p) => (
          <PositionCard key={p.id} p={p} operator={isOperator} />
        ))
      )}
      {isOperator && (
        <>
          <details>
            <summary>FirmVault buyback</summary>
            <BuybackForm />
          </details>
          <details>
            <summary>Burn free NOTSTOCK</summary>
            <Amount
              label="NOTSTOCK to burn from LP Desk"
              value={burn}
              onChange={setBurn}
              unit="NOTSTOCK"
              balance={free}
              error={checkAmount(burn, 18, free, "free NOTSTOCK")}
            />
            <Tx
              label="Burn LP Desk tokens"
              description={`Permanently send ${burn} NOTSTOCK from LP Desk’s free balance to the dead address.`}
              reason={checkAmount(burn, 18, free, "free NOTSTOCK")}
              call={async () => ({
                ...desk,
                functionName: "burn",
                args: [parseAmount(burn, 18)],
              })}
            />
          </details>
          <details>
            <summary>Hand over operator role</summary>
            <p>
              This takes effect immediately. Verify that the recipient controls
              a working signer on Robinhood Chain; the role cannot otherwise be
              recovered.
            </p>
            <Field
              label="New operator address"
              value={next}
              onChange={setNext}
            />
            <Field
              label="Repeat new operator address"
              value={confirm}
              onChange={setConfirm}
            />
            <Tx
              label="Transfer operator role"
              description={`Immediately hand over all operator powers to ${next}. This cannot be undone by the current operator.`}
              reason={
                !validAddress(next) || !same(next, confirm)
                  ? "Enter and repeat the new operator address"
                  : ""
              }
              call={{
                ...desk,
                functionName: "setOperator",
                args: [next.trim()],
              }}
            />
          </details>
        </>
      )}
    </Section>
  );
}
function PositionCard({ p, operator }: { p: Position; operator: boolean }) {
  const { c, s } = useApp();
  const token = s!.tokens.find((t) => same(t.address, p.asset)),
    stock = contract(c, "LaunchToken").address;
  const [slip, setSlip] = useState("0.5"),
    [low, setLow] = useState(""),
    [high, setHigh] = useState(""),
    [top, setTop] = useState(""),
    [to, setTo] = useState(""),
    [move, setMove] = useState("");
  const d = contract(c, "LpDesk"),
    venue = s!.venues.find((v) => same(v.positionManager, p.positionManager));
  const [out0, out1] = p.price
    ? amountsFor(
        p.price,
        sqrtTick(p.tickLower),
        sqrtTick(p.tickUpper),
        p.liquidity,
        false,
      )
    : [0n, 0n];
  let min0 = 0n,
    min1 = 0n,
    slipError = "";
  try {
    min0 = minimum(out0, slip);
    min1 = minimum(out1, slip);
  } catch (e) {
    slipError = (e as Error).message;
  }
  let range: readonly [number, number] | undefined,
    rangeError = "";
  try {
    range = tickRange(
      low,
      high,
      p.notStockIs0,
      token?.decimals ?? 18,
      p.tickSpacing,
    );
  } catch (e) {
    rangeError = (e as Error).message;
  }
  let topL = 0n,
    topReason = checkAmount(
      top,
      token?.decimals ?? 18,
      token?.topUp,
      token?.symbol ?? "asset",
    );
  try {
    if (!topReason) {
      topL = liquidityFrom(
        p.price,
        sqrtTick(p.tickLower),
        sqrtTick(p.tickUpper),
        parseAmount(top, token!.decimals),
        !p.notStockIs0,
      );
      const [n0, n1] = amountsFor(
        p.price,
        sqrtTick(p.tickLower),
        sqrtTick(p.tickUpper),
        topL,
      );
      if (topL === 0n || (p.notStockIs0 ? n0 : n1) > 0n)
        topReason =
          "This range requires NOTSTOCK; top-ups can spend only the paired asset.";
    }
  } catch (e) {
    topReason = (e as Error).message;
  }
  const positionValue = p.price
    ? Number(formatUnits(p.notStockIs0 ? out0 : out1, 18)) *
        priceInAsset(p.price, p.notStockIs0, token?.decimals ?? 18) +
      Number(formatUnits(p.notStockIs0 ? out1 : out0, token?.decimals ?? 18))
    : undefined;
  return (
    <article className="position">
      <div className="section-head">
        <h3>
          #{p.id} · NOTSTOCK / {token?.symbol ?? "Asset"}
        </h3>
        <span className="status">{p.open ? "Open" : "Closed"}</span>
      </div>
      <p className="hint">
        {venue
          ? venueLabel(venue, s!.venues.indexOf(venue))
          : p.positionManager}{" "}
        · Ticks {p.tickLower} to {p.tickUpper}
      </p>
      <dl className="details">
        <div>
          <dt>Principal value</dt>
          <dd>
            {p.error ??
              (positionValue === undefined
                ? "No live price"
                : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(positionValue)} ${token?.symbol}`)}
          </dd>
        </div>
        <div>
          <dt>NOTSTOCK / {token?.symbol}</dt>
          <dd>
            {amountText(p.notStockIs0 ? out0 : out1)} /{" "}
            {amountText(p.notStockIs0 ? out1 : out0, token?.decimals)}
          </dd>
        </div>
        <div>
          <dt>Current price</dt>
          <dd>
            {p.price
              ? `${priceInAsset(p.price, p.notStockIs0, token?.decimals ?? 18).toPrecision(7)} ${token?.symbol} per NOTSTOCK`
              : "No live price"}
          </dd>
        </div>
        <div>
          <dt>Liquidity</dt>
          <dd>{p.liquidity.toString()}</dd>
        </div>
      </dl>
      {operator && p.open && (
        <>
          <div className="actions">
            <Tx
              label="Collect fees"
              description={`Collect position #${p.id} fees and apply the fixed fee split.`}
              call={{ ...d, functionName: "collect", args: [BigInt(p.id)] }}
            />
          </div>
          <details>
            <summary>Manage position #{p.id}</summary>
            <Field
              label="Withdrawal slippage (%)"
              value={slip}
              onChange={setSlip}
            />
            <p className="hint">
              Expected outs: {amountText(p.notStockIs0 ? out0 : out1)} NOTSTOCK
              and {amountText(p.notStockIs0 ? out1 : out0, token?.decimals)}{" "}
              {token?.symbol}. Minimum outs:{" "}
              {amountText(p.notStockIs0 ? min0 : min1)} NOTSTOCK and{" "}
              {amountText(p.notStockIs0 ? min1 : min0, token?.decimals)}{" "}
              {token?.symbol}.
            </p>
            <Tx
              label="Close position"
              description={`Close position #${p.id}. Fees are split first; remaining principal returns to LP Desk’s free balances. Minimum token0/token1 outs: ${min0}/${min1} base units.`}
              reason={p.error || slipError}
              call={{
                ...d,
                functionName: "close",
                args: [BigInt(p.id), min0, min1],
              }}
            />
            <div className="form-grid">
              <Field
                label={`New range from (${token?.symbol} per NOTSTOCK)`}
                value={low}
                onChange={setLow}
              />
              <Field
                label={`New range to (${token?.symbol} per NOTSTOCK)`}
                value={high}
                onChange={setHigh}
              />
            </div>
            <p className="hint">
              New ticks:{" "}
              {range ? `${range[0]} to ${range[1]}` : "Enter a price range"}
            </p>
            <Tx
              label="Shift range"
              description={`Collect fees, withdraw position #${p.id} at the displayed minimums and reopen at ticks ${range?.join(" to ")}.`}
              reason={p.error || slipError || rangeError}
              call={async () => ({
                ...d,
                functionName: "shiftRange",
                args: [BigInt(p.id), range![0], range![1], min0, min1],
              })}
            />
            <h3>Top up from basket</h3>
            <Amount
              label={`${token?.symbol} top-up amount`}
              unit={token?.symbol ?? "Asset"}
              value={top}
              onChange={setTop}
              balance={token?.topUp}
              decimals={token?.decimals}
              error={topReason}
            />
            <p className="hint">
              Minimum liquidity (99.5%): {((topL * 995n) / 1000n).toString()}.
              Uses the current pool price shown above.
            </p>
            <Tx
              label="Top up position"
              description={`Add up to ${top} ${token?.symbol} from the top-up basket. No NOTSTOCK is taken. Minimum liquidity ${(topL * 995n) / 1000n}.`}
              reason={p.error || topReason}
              call={async () => ({
                ...d,
                functionName: "increaseLiquidity",
                args: [
                  BigInt(p.id),
                  parseAmount(top, token!.decimals),
                  p.price,
                  (topL * 995n) / 1000n,
                ],
              })}
            />
            {!same(p.asset, c.deployment.network.pairToken.address) && (
              <>
                <h3>Buy back NOTSTOCK</h3>
                <BuybackForm position={p} />
              </>
            )}
            <h3>Move liquidity</h3>
            <Select
              label="Destination position with the same pair"
              value={to}
              onChange={setTo}
            >
              <option value="">Choose position</option>
              {s!.positions
                .filter(
                  (x) => x.open && x.id !== p.id && same(x.asset, p.asset),
                )
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    Position #{x.id}
                  </option>
                ))}
            </Select>
            <Field
              label="Liquidity units to move"
              value={move}
              onChange={setMove}
              hint={`Available: ${p.liquidity}`}
            />
            <Tx
              label="Move liquidity"
              description={`Move ${move} liquidity from #${p.id} into #${to}. Fees are collected and split before moving.`}
              reason={
                p.error ||
                slipError ||
                (!to ||
                !/^\d+$/.test(move) ||
                BigInt(move || 0) <= 0n ||
                BigInt(move || 0) > p.liquidity
                  ? "Choose a destination and valid liquidity amount"
                  : "")
              }
              call={async () => {
                const l = BigInt(move),
                  [a, b] = amountsFor(
                    p.price,
                    sqrtTick(p.tickLower),
                    sqrtTick(p.tickUpper),
                    l,
                    false,
                  );
                return {
                  ...d,
                  functionName: "moveLiquidity",
                  args: [
                    BigInt(p.id),
                    BigInt(to),
                    l,
                    minimum(a, slip),
                    minimum(b, slip),
                  ],
                };
              }}
            />
          </details>
        </>
      )}
    </article>
  );
}
function BuybackForm({ position }: { position?: Position }) {
  const { c, s, account } = useApp();
  const token = position
    ? s!.tokens.find((t) => same(t.address, position.asset))
    : s!.tokens.find((t) =>
        same(t.address, c.deployment.network.pairToken.address),
      );
  const balance = position ? token?.buyback : s?.bucket;
  const [amount, setAmount] = useState(""),
    [slip, setSlip] = useState("0.5"),
    [out, setOut] = useState<bigint>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reason = checkAmount(
    amount,
    token?.decimals ?? 18,
    balance,
    token?.symbol ?? "asset",
  );
  let min = 0n,
    slipError = "";
  try {
    if (out !== undefined) min = minimum(out, slip);
  } catch (e) {
    slipError = (e as Error).message;
  }
  const target = contract(c, position ? "LpDesk" : "FirmVault");
  useEffect(() => {
    setOut(undefined);
    setError("");
  }, [amount, position?.id]);
  return (
    <div className="compact-form">
      <Amount
        label={`${token?.symbol} buyback amount`}
        value={amount}
        onChange={setAmount}
        unit={token?.symbol ?? "Asset"}
        balance={balance}
        decimals={token?.decimals}
        error={reason}
      />
      <Field label="Buyback slippage (%)" value={slip} onChange={setSlip} />
      <button
        disabled={!!reason || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const value = parseAmount(amount, token!.decimals);
            const { result } = await c.client.simulateContract({
              ...target,
              functionName: "buyback",
              args: position ? [BigInt(position.id), value, 0n] : [value, 0n],
              account,
            } as any);
            setOut(result as bigint);
          } catch (e) {
            setError(explain(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Quoting buyback…" : "Preview buyback"}
      </button>
      {out !== undefined && (
        <p>
          Expected output: {amountText(out)} NOTSTOCK. Minimum output:{" "}
          {amountText(min)} NOTSTOCK.
        </p>
      )}
      <Tx
        label="Buy back & burn"
        description={`Swap ${amount} ${token?.symbol} from the buyback ${position ? "basket" : "bucket"} for at least ${amountText(min)} NOTSTOCK, sent directly to the dead address.`}
        reason={
          reason ||
          slipError ||
          (out === undefined ? "Preview the buyback first" : "")
        }
        call={async () => ({
          ...target,
          functionName: "buyback",
          args: position
            ? [BigInt(position.id), parseAmount(amount, token!.decimals), min]
            : [parseAmount(amount, token!.decimals), min],
        })}
      />
      <p className="error" role="alert">
        {error}
      </p>
    </div>
  );
}
