import { useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useApp } from "./context";
import { contract, protocol } from "./config";
import { amountText, priceInAsset, read, same } from "./chain";
import {
  Amount,
  Field,
  Section,
  Stat,
  Tx,
  Empty,
  AddressLink,
  date,
} from "./components";
import {
  checkAmount,
  parseAmount,
  minimum,
  amountsFor,
  sqrtTick,
} from "./math";
import { swapCall } from "./swap";
import { explain } from "./errors";
export function BuyLink({ className = "" }: { className?: string }) {
  const { c } = useApp();
  return (
    <a
      className={`buy-link ${className}`}
      target="_blank"
      rel="noreferrer"
      href={`https://app.uniswap.org/swap?chain=robinhood&inputCurrency=ETH&outputCurrency=${contract(c, "LaunchToken").address}`}
    >
      Buy NOTSTOCK with ETH <span aria-hidden="true">↗</span>
    </a>
  );
}
export function Swap() {
  const a = useApp(),
    { c, s, account } = a;
  const [amount, setAmount] = useState(""),
    [slippage, setSlippage] = useState("0.5"),
    [sell, setSell] = useState(false),
    [quote, setQuote] = useState<{
      out: bigint;
      at: number;
      input: Address;
      amount: bigint;
    }>(),
    [error, setError] = useState(""),
    [quoting, setQuoting] = useState(false),
    [allowance, setAllowance] = useState<bigint>(),
    [permit, setPermit] = useState<readonly [bigint, number, number]>();
  const stock = contract(c, "LaunchToken"),
    pair = c.deployment.network.pairToken;
  const input = sell ? stock.address : pair.address,
    unit = sell ? "NOTSTOCK" : pair.symbol,
    outputUnit = sell ? pair.symbol : "NOTSTOCK",
    decimals =
      s?.tokens.find((t) => same(t.address, input))?.decimals ?? pair.decimals,
    balance = sell ? s?.walletStock : s?.walletImd;
  const errorAmount = checkAmount(amount, decimals, balance, unit);
  let min = 0n,
    slipError = "";
  try {
    if (quote) min = minimum(quote.out, slippage);
  } catch (e) {
    slipError = (e as Error).message;
  }
  useEffect(() => {
    setQuote(undefined);
    setError("");
  }, [amount, sell, account]);
  useEffect(() => {
    setAllowance(undefined);
    setPermit(undefined);
    if (!account || !s) return;
    let stop = false;
    Promise.all([
      read(c, "erc20", input, "allowance", [
        account,
        c.deployment.network.uniswapV4.permit2,
      ]),
      read(c, "permit2", c.deployment.network.uniswapV4.permit2, "allowance", [
        account,
        input,
        c.deployment.network.uniswapV4.universalRouter,
      ]),
    ])
      .then(([x, y]) => {
        if (!stop) {
          setAllowance(x);
          setPermit(y);
        }
      })
      .catch((e) => {
        if (!stop) setError(explain(e));
      });
    return () => {
      stop = true;
    };
  }, [c, account, input, s?.block]);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expired = quote && clock - quote.at > 60000;
  async function getQuote() {
    setQuoting(true);
    setError("");
    try {
      const value = parseAmount(amount, decimals);
      if (value >= 2n ** 128n) throw Error("Use a smaller swap amount.");
      const { result } = await c.client.simulateContract({
        address: c.deployment.network.uniswapV4.quoter,
        abi: protocol.quoter,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: c.deployment.poolKey,
            zeroForOne: same(input, c.deployment.poolKey.currency0),
            exactAmount: value,
            hookData: "0x",
          },
        ],
        account,
      });
      setQuote({ out: result[0], input, amount: value, at: Date.now() });
    } catch (e) {
      setError(explain(e));
      setQuote(undefined);
    } finally {
      setQuoting(false);
    }
  }
  const needsToken =
    quote && allowance !== undefined && allowance < quote.amount;
  const needsPermit =
    quote &&
    permit &&
    (permit[0] < quote.amount ||
      BigInt(permit[1]) < (s?.timestamp ?? 0n) + 1200n);
  return (
    <section className="swap-panel" aria-labelledby="swap-title">
      <div className="section-head">
        <h2 id="swap-title">Trade NOTSTOCK</h2>
        <button className="text-button" onClick={() => setSell(!sell)}>
          {sell ? "Buy instead" : "Sell instead"}
        </button>
      </div>
      <Amount
        label={`You pay ${unit}`}
        value={amount}
        onChange={setAmount}
        balance={balance}
        unit={unit}
        decimals={decimals}
        error={errorAmount}
      />
      {!sell && <BuyLink />}
      <Field label="Slippage (%)" value={slippage} onChange={setSlippage} />
      <button
        disabled={
          !!errorAmount ||
          !a.verified ||
          quoting ||
          !account ||
          a.walletChain !== c.chain.id
        }
        onClick={getQuote}
      >
        {quoting ? "Requesting quote…" : "Get quote"}
      </button>
      {!account && <p className="hint">Connect wallet to quote this pool.</p>}
      {quote && (
        <div className="quote">
          <dl>
            <div>
              <dt>You receive, estimated</dt>
              <dd>
                {amountText(quote.out, sell ? pair.decimals : 18)} {outputUnit}
              </dd>
            </div>
            <div>
              <dt>Minimum received</dt>
              <dd>
                {amountText(min, sell ? pair.decimals : 18)} {outputUnit}
              </dd>
            </div>
            <div>
              <dt>Quote valid for</dt>
              <dd>
                {expired
                  ? "Expired"
                  : `${Math.max(0, 60 - Math.floor((clock - quote.at) / 1000))} seconds`}
              </dd>
            </div>
          </dl>
          {needsToken ? (
            <Tx
              key="token-approval"
              label={`1. Approve ${unit}`}
              description={`Allow Permit2 to spend exactly ${amount} ${unit}. No tokens are swapped in this step.`}
              reason={
                errorAmount ||
                slipError ||
                (expired ? "Request a fresh quote" : "")
              }
              call={{
                address: input,
                abi: sell ? stock.abi : protocol.erc20,
                functionName: "approve",
                args: [c.deployment.network.uniswapV4.permit2, quote.amount],
              }}
            />
          ) : needsPermit ? (
            <Tx
              key="router-approval"
              label="2. Approve router"
              description={`Allow the configured Uniswap router to use ${amount} ${unit} through Permit2 for 30 minutes.`}
              reason={
                errorAmount ||
                slipError ||
                (expired ? "Request a fresh quote" : "")
              }
              call={{
                address: c.deployment.network.uniswapV4.permit2,
                abi: protocol.permit2,
                functionName: "approve",
                args: [
                  input,
                  c.deployment.network.uniswapV4.universalRouter,
                  quote.amount,
                  Number((s?.timestamp ?? 0n) + 1800n),
                ],
              }}
            />
          ) : (
            <Tx
              key="swap"
              label="Swap tokens"
              description={`Spend ${amount} ${unit} for at least ${formatUnits(min, sell ? pair.decimals : 18)} ${outputUnit}. Slippage ${slippage}%.`}
              reason={
                errorAmount ||
                slipError ||
                (expired
                  ? "Request a fresh quote"
                  : allowance === undefined || !permit
                    ? "Checking approvals"
                    : "")
              }
              call={async () => {
                if (Date.now() - quote.at > 60000)
                  throw Error("Request a fresh quote.");
                const block = await c.client.getBlock();
                return swapCall(
                  c,
                  input,
                  quote.amount,
                  quote.out,
                  slippage,
                  block.timestamp,
                );
              }}
            />
          )}
        </div>
      )}
      <p className="error" role="alert">
        {error || slipError}
      </p>
      <p className="hint">
        Pool fee 1.25%. Quotes include the pool fee; network fees are paid in
        ETH. USD pricing is not provided by this launch.
      </p>
    </section>
  );
}
export function Home() {
  const { c, s, history: h, historyStatus } = useApp();
  const stock = contract(c, "LaunchToken").address,
    vault = contract(c, "FirmVault");
  const price = s?.price
    ? priceInAsset(
        s.price,
        same(stock, c.deployment.poolKey.currency0),
        c.deployment.network.pairToken.decimals,
      )
    : undefined;
  return (
    <>
      <div className="home-top">
        <div className="intro">
          <div className="identity">
            <img
              src="./logo.png"
              width="112"
              height="112"
              alt="Not Firm frog in a suit"
            />
            <h1 tabIndex={-1}>Not Firm</h1>
          </div>
          <p className="slogan">
            Don't work for the firm. Let the firm work for you.
          </p>
          <BuyLink className="primary" />
          <p className="intro-caption">
            The NOTSTOCK treasury on Robinhood Chain.
          </p>
          <div className="price-line">
            <span>1 NOTSTOCK</span>
            <strong>
              {price !== undefined
                ? `${new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(price)} IMD`
                : "Reading price…"}
            </strong>
            <span className="hint">
              Live pool price · USD pricing not provided
            </span>
          </div>
        </div>
        <Swap />
      </div>
      <Section
        title="The firm, on chain"
        aside={<a href="#desk">Open LP Desk ↗</a>}
      >
        <div className="stats">
          <Stat label="Buyback bucket" detail="IMD held by FirmVault">
            {s ? `${amountText(s.bucket)} IMD` : "Reading chain…"}
          </Stat>
          <Stat label="Total burned" detail="NOTSTOCK at the dead address">
            {s ? amountText(s.burned) : "Reading chain…"}
          </Stat>
          <Stat label="Open positions" detail="LP Desk’s active positions">
            {s ? s.positions.filter((p) => p.open).length : "Reading chain…"}
          </Stat>
        </div>
      </Section>
      <Section title="Put fees to work">
        <div className="split-flow">
          {[
            ["25%", "Buyback & burn"],
            ["25%", "Project wallet"],
            ["25%", "LP top-up basket"],
            ["25%", "LP free balance"],
          ].map(([share, name]) => (
            <div key={name}>
              <strong>{share}</strong>
              <span>{name}</span>
            </div>
          ))}
        </div>
        <p className="hint">
          Every non-NOTSTOCK fee follows this split. All NOTSTOCK fees go to
          Burner.
        </p>
        {!s?.registered && (
          <p className="hint">
            Register the launch in LP Desk Setup before distributing fees.
          </p>
        )}
        <div className="two-col">
          <div className="distribution">
            <h3>Undistributed IMD</h3>
            <p className="number">
              {s ? amountText(s.undistributed) : "Reading chain…"}{" "}
              <span>IMD</span>
            </p>
            <Tx
              label="Distribute IMD"
              description="Split undistributed IMD equally between the buyback bucket, project wallet, top-up basket and free balance."
              reason={
                !s?.registered
                  ? "Register first"
                  : s.undistributed < 4n
                    ? "No IMD ready to distribute"
                    : ""
              }
              call={{
                ...vault,
                functionName: "distribute",
                args: [c.deployment.network.pairToken.address],
              }}
            />
          </div>
          <div className="distribution">
            <h3>Undistributed NOTSTOCK</h3>
            <p className="number">
              {s ? amountText(s.vaultStock) : "Reading chain…"}{" "}
              <span>NOTSTOCK</span>
            </p>
            <Tx
              label="Distribute NOTSTOCK"
              description="Send all undistributed NOTSTOCK held by FirmVault to Burner."
              reason={
                !s?.registered
                  ? "Register first"
                  : s.vaultStock === 0n
                    ? "No NOTSTOCK ready to distribute"
                    : ""
              }
              call={{ ...vault, functionName: "distribute", args: [stock] }}
            />
          </div>
        </div>
      </Section>
      <Section title="LP Desk balances">
        <BasketTable />
        {s &&
          s.positions
            .filter((p) => p.open)
            .map((p) => {
              const token = s.tokens.find((t) => same(t.address, p.asset));
              const [a0, a1] = p.price
                ? amountsFor(
                    p.price,
                    sqrtTick(p.tickLower),
                    sqrtTick(p.tickUpper),
                    p.liquidity,
                    false,
                  )
                : [0n, 0n];
              const ns = p.notStockIs0 ? a0 : a1,
                asset = p.notStockIs0 ? a1 : a0;
              return (
                <div className="data-row" key={p.id}>
                  <span>
                    Position #{p.id} · {token?.symbol ?? "Asset"}
                  </span>
                  <span>
                    {p.error ??
                      `${amountText(ns)} NOTSTOCK + ${amountText(asset, token?.decimals)} ${token?.symbol ?? ""} · Value ≈ ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(Number(formatUnits(ns, 18)) * priceInAsset(p.price, p.notStockIs0, token?.decimals ?? 18) + Number(formatUnits(asset, token?.decimals ?? 18)))} ${token?.symbol ?? ""}`}
                  </span>
                </div>
              );
            })}
        {s && !s.positions.some((p) => p.open) && (
          <Empty>
            No positions yet. Complete setup to begin the seven-day bootstrap.
          </Empty>
        )}
      </Section>
      <Section
        title="Weekly report"
        aside={
          h ? (
            <span className="hint">
              {date(h.startTime)} to {s && date(s.timestamp)}
            </span>
          ) : undefined
        }
      >
        {!h ? (
          <Empty>
            {historyStatus ||
              "Reading fee receipts, buybacks and burns from chain…"}
          </Empty>
        ) : (
          <>
            <div className="stats">
              <Stat label="Buyback executions">{h.buybacks.length}</Stat>
              <Stat label="Dead-address balance change">
                {amountText(h.burnChange)} NOTSTOCK
              </Stat>
              <Stat label="Source blocks">
                {h.from.toString()} to {h.to.toString()}
              </Stat>
            </div>
            <h3>Fee receipts</h3>
            {Object.entries(h.fees).length ? (
              Object.entries(h.fees).map(([addr, n]) => {
                const t = s?.tokens.find((t) => same(t.address, addr));
                return (
                  <div className="data-row" key={addr}>
                    <AddressLink address={addr as Address} label={t?.symbol} />
                    <span>{amountText(n, t?.decimals)}</span>
                  </div>
                );
              })
            ) : (
              <Empty>
                No vault token receipts or position fee collections in this
                period.
              </Empty>
            )}
            {h.buybacks.map((b, i) => (
              <div className="data-row" key={i}>
                <a
                  href={`${c.deployment.network.explorer}/tx/${b.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {b.source} buyback ↗
                </a>
                <span>{amountText(b.notStockOut)} NOTSTOCK burned</span>
              </div>
            ))}
          </>
        )}
        <h3>Project wallet received, since launch</h3>
        {!h ? (
          <p className="hint">{historyStatus || "Reading chain history…"}</p>
        ) : Object.keys(h.received).length ? (
          Object.entries(h.received).map(([addr, value]) => {
            const t = s?.tokens.find((t) => same(t.address, addr));
            return (
              <div className="data-row" key={addr}>
                <AddressLink address={addr as Address} label={t?.symbol} />
                <span>
                  {amountText(value, t?.decimals)} {t?.symbol}
                </span>
              </div>
            );
          })
        ) : (
          <p>No project fee shares received yet.</p>
        )}
        <p className="hint">
          Fee receipts count transfers into FirmVault and LP Desk fee
          collections. Project shares use distribution and fee-split events.
          Internal LP Desk buyback credits are not counted twice.
        </p>
      </Section>
    </>
  );
}
export function BasketTable() {
  const { s } = useApp();
  if (!s) return <Empty>Reading chain balances…</Empty>;
  return (
    <div className="balance-list">
      {s.tokens.map((t) => (
        <div className="balance-row" key={t.address}>
          <AddressLink address={t.address} label={t.symbol} />
          <dl>
            <div>
              <dt>Free</dt>
              <dd>{amountText(t.free, t.decimals)}</dd>
            </div>
            <div>
              <dt>Top-up</dt>
              <dd>{amountText(t.topUp, t.decimals)}</dd>
            </div>
            <div>
              <dt>Buyback</dt>
              <dd>{amountText(t.buyback, t.decimals)}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
