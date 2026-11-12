import { useEffect, useRef, useState } from "react";
import { getAddress, type Address } from "viem";
import { switchChain, type Config, type Provider } from "./config";
import { explain } from "./errors";
type Wallet = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Provider;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export function WalletSheet({
  c,
  open,
  onClose,
  onConnect,
}: {
  c: Config;
  open: boolean;
  onClose: () => void;
  onConnect: (p: Provider, a: Address, chain: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [wallets, setWallets] = useState<Wallet[]>([]),
    [pending, setPending] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const announced = (e: Event) => {
      const w = (e as CustomEvent<Wallet>).detail;
      if (w?.provider && w?.info?.uuid)
        setWallets((old) =>
          old.some((x) => x.info.uuid === w.info.uuid) ? old : [...old, w],
        );
    };
    window.addEventListener("eip6963:announceProvider", announced);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () =>
      window.removeEventListener("eip6963:announceProvider", announced);
  }, []);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    } else dialog.current?.close();
  }, [open]);
  async function connect(
    name: string,
    getProvider: () => Promise<Provider> | Provider,
  ) {
    setPending(name);
    setError("");
    try {
      const p = await getProvider();
      const accounts = await p.request({ method: "eth_requestAccounts" });
      if (!accounts.length) throw Error("Choose an account in your wallet.");
      let chain = Number(await p.request({ method: "eth_chainId" }));
      onConnect(p, getAddress(accounts[0]), chain);
      try {
        await switchChain(p, c.deployment);
        chain = c.chain.id;
        onConnect(p, getAddress(accounts[0]), chain);
      } catch (e) {
        setError(explain(e));
      }
      onClose();
    } catch (e) {
      setError(explain(e));
    } finally {
      setPending("");
    }
  }
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !window.ethereum &&
    wallets.length === 0;
  const url = location.href;
  const links = [
    {
      name: "MetaMask",
      icon: "metamask",
      href: `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
    },
    {
      name: "Coinbase Wallet",
      icon: "coinbase",
      href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
    },
    {
      name: "Rabby",
      icon: "rabby",
      href: `https://go.rabby.io/mobile/?url=${encodeURIComponent(url)}`,
    },
    {
      name: "Phantom",
      icon: "phantom",
      href: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}`,
    },
  ];
  return (
    <dialog
      ref={dialog}
      className="wallet-sheet"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      aria-labelledby="wallet-title"
    >
      <div className="sheet-head">
        <h2 id="wallet-title">Connect a wallet</h2>
        <button onClick={onClose} aria-label="Close wallet picker">
          ×
        </button>
      </div>
      <p>
        Connect to {c.chain.name}. You sign every transaction in your wallet.
      </p>
      {wallets.map((w) => (
        <button
          className="wallet-row"
          key={w.info.uuid}
          disabled={!!pending}
          onClick={() => connect(w.info.name, () => w.provider)}
        >
          {w.info.icon.startsWith("data:") && (
            <img src={w.info.icon} width="28" height="28" alt="" />
          )}
          {w.info.name}
          {pending === w.info.name ? " · Opening…" : ""}
        </button>
      ))}
      {wallets.length === 0 && window.ethereum && (
        <button
          className="wallet-row"
          disabled={!!pending}
          onClick={() => connect("Browser wallet", () => window.ethereum!)}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="6"
              width="22"
              height="18"
              rx="3"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path d="M18 12h7v7h-7z" stroke="currentColor" strokeWidth="2" />
          </svg>
          Browser wallet{pending === "Browser wallet" ? " · Opening…" : ""}
        </button>
      )}
      {mobile &&
        links.map((w) => (
          <a className="wallet-row" href={w.href} key={w.name}>
            <img
              src={`./wallets/${w.icon}.svg`}
              width="28"
              height="28"
              alt=""
            />
            Open in {w.name}
          </a>
        ))}
      {!mobile && !wallets.length && !window.ethereum && (
        <p className="notice">
          No browser wallet found. Use a wallet’s mobile browser or connect with
          a passkey below.
        </p>
      )}
      <button
        className="wallet-row"
        disabled={!!pending}
        onClick={() =>
          connect("Coinbase", async () => {
            const { createCoinbaseWalletSDK } =
              await import("@coinbase/wallet-sdk");
            return createCoinbaseWalletSDK({
              appName: "Not Firm",
              appLogoUrl: new URL("./favicon.png", document.baseURI).href,
              appChainIds: [c.chain.id],
              preference: { options: "smartWalletOnly" },
            }).getProvider() as Provider;
          })
        }
      >
        <img src="./wallets/coinbase.svg" width="28" height="28" alt="" />
        Coinbase Smart Wallet{pending === "Coinbase" ? " · Opening…" : ""}
      </button>
      <p className="error" role="alert">
        {error}
      </p>
    </dialog>
  );
}
