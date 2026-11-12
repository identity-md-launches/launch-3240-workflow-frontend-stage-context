import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createWalletClient,
  custom,
  formatEther,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { Context, type Call } from "./context";
import {
  contract,
  loadConfiguration,
  switchChain,
  walletReadClient,
  type Config,
  type Provider,
} from "./config";
import {
  snapshot,
  verifyChain,
  history as readHistory,
  type Snapshot,
  type History,
} from "./chain";
import { explain } from "./errors";
import { WalletSheet } from "./Wallet";
import { Home } from "./Home";
import { Burn } from "./Burn";
import { Governance, Bridges } from "./Governance";
import { Operator, venueLabel } from "./Operator";
import { Setup } from "./Setup";
import { AddressLink, Section, Empty } from "./components";
export function App() {
  const [c, setC] = useState<Config>(),
    [error, setError] = useState("");
  useEffect(() => {
    loadConfiguration()
      .then(setC)
      .catch((e) => setError(explain(e)));
  }, []);
  if (!c)
    return (
      <main className="boot">
        <img src="./favicon.png" width="64" height="64" alt="Not Firm" />
        <h1>Not Firm</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Loading verified deployment…"}
        </p>
        {error && (
          <button onClick={() => location.reload()}>
            Reload configuration
          </button>
        )}
      </main>
    );
  return <Application config={c} />;
}
function Application({ config }: { config: Config }) {
  const [account, setAccount] = useState<Address>(),
    [provider, setProvider] = useState<Provider>(),
    [walletChain, setWalletChain] = useState<number>(),
    [walletOpen, setWalletOpen] = useState(false),
    [s, setS] = useState<Snapshot>(),
    [verified, setVerified] = useState(false),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [switching, setSwitching] = useState(false),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(location.hash.slice(1) || "home"),
    [history, setHistory] = useState<History>(),
    [historyStatus, setHistoryStatus] = useState(""),
    [review, setReview] = useState<{
      description: string;
      call: Call;
      gas: bigint;
      resolve: (ok: boolean) => void;
    }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(0),
    historyBusy = useRef(false),
    lastHistory = useRef(0);
  const lock = useRef(false);
  const c = useMemo(
    () =>
      provider && walletChain === config.chain.id
        ? {
            ...config,
            client: walletReadClient(
              config,
              provider,
            ) as unknown as Config["client"],
          }
        : config,
    [config, provider, walletChain],
  );
  const refresh = useCallback(async () => {
    const generation = ++alive.current;
    setReading(true);
    try {
      await verifyChain(c);
      const next = await snapshot(c, account);
      if (generation !== alive.current) return;
      setVerified(true);
      setS(next);
      setError("");
      if (!historyBusy.current && Date.now() - lastHistory.current > 60000) {
        historyBusy.current = true;
        readHistory(c, next, setHistoryStatus)
          .then((h) => {
            setHistory(h);
            setHistoryStatus("");
            lastHistory.current = Date.now();
          })
          .catch((e) =>
            setHistoryStatus(`History read needs retry: ${explain(e)}`),
          )
          .finally(() => {
            historyBusy.current = false;
          });
      }
    } catch (e) {
      if (generation === alive.current) {
        setVerified(false);
        setError(explain(e));
      }
    } finally {
      if (generation === alive.current) setReading(false);
    }
  }, [c, account]);
  useEffect(() => {
    setS(undefined);
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !lock.current)
        void refresh();
    }, 15000);
    return () => {
      clearInterval(id);
      alive.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const fn = () => {
      const p = location.hash.slice(1) || "home";
      setPage(["home", "burn", "desk"].includes(p) ? p : "home");
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("main h1")?.focus();
        window.scrollTo(0, 0);
      });
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const ac = (xs: string[]) => {
        setAccount(xs[0] ? getAddress(xs[0]) : undefined);
        setS(undefined);
      },
      ch = (id: string) => setWalletChain(Number(id)),
      dc = () => {
        setAccount(undefined);
        setWalletChain(undefined);
        setProvider(undefined);
      };
    provider.on?.("accountsChanged", ac);
    provider.on?.("chainChanged", ch);
    provider.on?.("disconnect", dc);
    return () => {
      provider.removeListener?.("accountsChanged", ac);
      provider.removeListener?.("chainChanged", ch);
      provider.removeListener?.("disconnect", dc);
    };
  }, [provider]);
  useEffect(() => {
    if (review) dialog.current?.showModal();
    else dialog.current?.close();
  }, [review]);
  async function transact(
    call: Call,
    description: string,
    onStatus: (s: string) => void,
  ): Promise<Hex> {
    if (lock.current) throw Error("Wait for the current transaction.");
    if (!provider || !account) throw Error("Connect wallet first.");
    if (!verified || !s) throw Error("Wait for verified contract state.");
    lock.current = true;
    setBusy(true);
    const signer = account;
    async function checkSigner() {
      const actual = Number(await provider!.request({ method: "eth_chainId" }));
      const accounts = await provider!.request({ method: "eth_accounts" });
      if (actual !== c.chain.id) throw Error(`Switch to ${c.chain.name}.`);
      if (accounts[0]?.toLowerCase() !== signer.toLowerCase())
        throw Error(
          "The selected wallet account changed. Reconnect and review this action.",
        );
    }
    try {
      await checkSigner();
      onStatus("Simulating…");
      await verifyChain(c);
      const code = await c.client.getCode({ address: call.address });
      if (!code || code === "0x")
        throw Error("No contract code at this action’s target.");
      const { request } = await c.client.simulateContract({
        ...call,
        account: signer,
      } as any);
      const [gas, gasPrice] = await Promise.all([
        c.client.estimateContractGas({ ...call, account: signer } as any),
        c.client.getGasPrice(),
      ]);
      onStatus("Review transaction");
      const approved = await new Promise<boolean>((resolve) =>
        setReview({ description, call, gas: gas * gasPrice, resolve }),
      );
      setReview(undefined);
      if (!approved)
        throw Error("Transaction review closed. Nothing was sent.");
      await checkSigner();
      onStatus("Confirm in wallet…");
      const wallet = createWalletClient({
        account: signer,
        chain: c.chain,
        transport: custom(provider),
      });
      const hash = await wallet.writeContract({
        ...request,
        account: signer,
        chain: c.chain,
      } as any);
      onStatus("Waiting for confirmation…");
      const receipt = await c.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
        pollingInterval: 2500,
      });
      if (receipt.status !== "success")
        throw Error(
          "The transaction reverted on chain. No contract changes were applied.",
        );
      onStatus("Refreshing balances…");
      lastHistory.current = 0;
      await refresh();
      onStatus("Confirmed");
      return hash;
    } finally {
      setReview(undefined);
      lock.current = false;
      setBusy(false);
    }
  }
  async function switchWallet() {
    if (!provider) return;
    setSwitching(true);
    setError("");
    try {
      await switchChain(provider, c.deployment);
      setWalletChain(c.chain.id);
    } catch (e) {
      setError(explain(e));
    } finally {
      setSwitching(false);
    }
  }
  return (
    <Context.Provider
      value={{
        c,
        s,
        history,
        historyStatus,
        account,
        provider,
        walletChain,
        verified,
        refresh,
        connect: () => setWalletOpen(true),
        transact,
        busy,
      }}
    >
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="header">
        <a className="wordmark" href="#home">
          <img src="./favicon.png" width="38" height="38" alt="" />
          <span>Not Firm</span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["home", "Home"],
            ["burn", "Burn"],
            ["desk", "LP Desk"],
          ].map(([id, label]) => (
            <a
              href={`#${id}`}
              key={id}
              aria-current={page === id ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="wallet-control">
          {account && walletChain !== c.chain.id ? (
            <button onClick={switchWallet} disabled={switching}>
              {switching ? "Switching…" : `Switch to ${c.chain.name}`}
            </button>
          ) : account ? (
            <button
              onClick={() => {
                setAccount(undefined);
                setProvider(undefined);
                setWalletChain(undefined);
              }}
              title={account}
            >
              {account.slice(0, 6)}…{account.slice(-4)} · Disconnect
            </button>
          ) : (
            <button onClick={() => setWalletOpen(true)}>Connect wallet</button>
          )}
        </div>
      </header>
      <div className="network-line" role="region" aria-label="Network status">
        <span>
          <i
            className={verified ? "live-dot" : "loading-dot"}
            aria-hidden="true"
          />
          {c.chain.name} ·{" "}
          {s ? `Block ${s.block.toLocaleString()}` : "Reading block…"}
        </span>
        <button
          className="text-button"
          disabled={reading}
          onClick={() => void refresh()}
        >
          {reading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error} <button onClick={() => void refresh()}>Retry reads</button>
        </div>
      )}
      {account && walletChain !== c.chain.id && (
        <div className="notice">
          Wrong network. Switch to {c.chain.name} to send transactions.
        </div>
      )}
      <main id="main" aria-busy={busy}>
        {page === "home" ? (
          <Home />
        ) : page === "burn" ? (
          <Burn />
        ) : (
          <>
            <div className="page-title">
              <h1 tabIndex={-1}>LP Desk</h1>
              <p>Stake, vote and manage the firm’s liquidity.</p>
            </div>
            <Governance />
            <Operator />
            <Bridges />
            <Section title="Listed venues">
              {!s?.modules[1] ? (
                <Empty>After setup</Empty>
              ) : (
                s.venues.map((v, i) => (
                  <div className="data-row" key={v.positionManager}>
                    <span>
                      {venueLabel(v, i)} · {["V4", "V3", "CL"][v.kind]}
                    </span>
                    <AddressLink address={v.positionManager} />
                  </div>
                ))
              )}
            </Section>
            <Setup />
          </>
        )}
      </main>
      <footer>
        <div className="footer-top">
          <strong>Not Firm</strong>
          <span>One billion NOTSTOCK. No mint, fee, pause or upgrade.</span>
        </div>
        <details>
          <summary>Verified deployment & contracts</summary>
          <p>
            Chain {c.chain.id} · Source{" "}
            <a
              href={`https://github.com/identity-md-launches/launch-3232-workflow-contract-stage-context/tree/${c.deployment.sourceCommit}`}
              target="_blank"
              rel="noreferrer"
            >
              {c.deployment.sourceCommit.slice(0, 12)} ↗
            </a>
          </p>
          {c.deployment.contracts.map((x) => (
            <div className="data-row" key={x.name}>
              <span>{x.name}</span>
              <AddressLink address={x.address} />
            </div>
          ))}
          {s &&
            [
              ["Burner", s.burner],
              ["LpGovernor", s.governor],
              ["PriceGuard", s.guard],
              ["VenueV3", s.venueV3],
              ["VenueV4", s.venueV4],
            ].map(([name, address]) => (
              <div className="data-row" key={name}>
                <span>{name}</span>
                <AddressLink address={address as Address} />
              </div>
            ))}
          <a href="./imd-deployment.json" target="_blank" rel="noreferrer">
            View deployment manifest ↗
          </a>
        </details>
        <p className="hint">
          Public RPC reads. Transactions signed by your wallet. This site holds
          no keys and has no transaction relay.
        </p>
      </footer>
      <WalletSheet
        c={c}
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onConnect={(p, a, ch) => {
          setProvider(p);
          setAccount(a);
          setWalletChain(ch);
        }}
      />
      <dialog
        ref={dialog}
        className="review-dialog"
        aria-labelledby="review-title"
        onCancel={() => review?.resolve(false)}
        onClick={(e) => {
          if (e.target === dialog.current) review?.resolve(false);
        }}
      >
        <h2 id="review-title">Review transaction</h2>
        {review && (
          <>
            <p>{review.description}</p>
            <dl>
              <div>
                <dt>Network</dt>
                <dd>{c.chain.name}</dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>
                  <AddressLink address={review.call.address} />
                </dd>
              </div>
              <div>
                <dt>Action</dt>
                <dd>{review.call.functionName}</dd>
              </div>
              <div>
                <dt>
                  {review.call.functionName === "execute" &&
                  review.call.abi === c.abis.LpGovernor
                    ? "LayerZero fee"
                    : "ETH sent"}
                </dt>
                <dd>{formatEther(review.call.value ?? 0n)} ETH</dd>
              </div>
              <div>
                <dt>Estimated network fee</dt>
                <dd>{formatEther(review.gas)} ETH</dd>
              </div>
            </dl>
            <p className="hint">
              Simulation passed. Your wallet shows the final fee before you
              sign.
            </p>
            <div className="actions">
              <button onClick={() => review.resolve(false)}>Back</button>
              <button className="primary" onClick={() => review.resolve(true)}>
                Confirm in wallet
              </button>
            </div>
          </>
        )}
      </dialog>
    </Context.Provider>
  );
}
