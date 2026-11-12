import { useId, useState, type ReactNode } from "react";
import { getAddress, formatUnits, type Address, type Hex } from "viem";
import { useApp, type Call } from "./context";
import { explain } from "./errors";
export function AddressLink({
  address,
  label,
}: {
  address: Address;
  label?: string;
}) {
  const { c } = useApp();
  const [copied, setCopied] = useState(false);
  return (
    <span className="address">
      <a
        href={`${c.deployment.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title={getAddress(address)}
      >
        {label ?? `${getAddress(address).slice(0, 6)}…${address.slice(-4)}`} ↗
      </a>
      <button
        className="copy"
        aria-label={`Copy ${label ?? "address"}`}
        onClick={() =>
          navigator.clipboard
            .writeText(getAddress(address))
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
export function Tx({
  label,
  description,
  call,
  reason = "",
  className = "",
}: {
  label: string;
  description: string;
  call: Call | (() => Promise<Call>);
  reason?: string;
  className?: string;
}) {
  const a = useApp();
  const [status, setStatus] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [hash, setHash] = useState<Hex>();
  const id = useId();
  const block =
    reason ||
    (!a.account
      ? "Connect wallet"
      : a.walletChain !== a.c.chain.id
        ? `Switch to ${a.c.chain.name}`
        : !a.verified
          ? "Verifying deployed contracts"
          : !a.s
            ? "Wait for current contract state"
            : "");
  async function run() {
    if (pending || block) return;
    setPending(true);
    setError("");
    setHash(undefined);
    try {
      setStatus("Preparing preview…");
      const tx = typeof call === "function" ? await call() : call;
      setHash(await a.transact(tx, description, setStatus));
    } catch (e) {
      setStatus("");
      setError(explain(e, Object.values(a.c.abis)));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={`tx ${className}`}>
      <button
        type="button"
        disabled={!!block || pending || a.busy}
        aria-describedby={id}
        onClick={run}
      >
        {pending ? `${label} · ${status}` : label}
      </button>
      <span
        id={id}
        className={error ? "error" : "hint"}
        role={error ? "alert" : "status"}
      >
        {error ||
          (pending
            ? status
            : hash
              ? `Confirmed${block ? `. ${block}` : ""}`
              : block)}
      </span>
      {hash && (
        <a
          className="tx-link"
          href={`${a.c.deployment.network.explorer}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
    </div>
  );
}
export function Amount({
  label,
  value,
  onChange,
  balance,
  decimals = 18,
  unit,
  error,
  maxLabel = "Max",
  balanceLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  balance?: bigint;
  decimals?: number;
  unit: string;
  error?: string;
  maxLabel?: string;
  balanceLabel?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="amount-input">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error && !!value}
          aria-describedby={`${id}-hint`}
        />
        <span>{unit}</span>
        {balance !== undefined && (
          <button
            className="max"
            type="button"
            onClick={() => onChange(formatUnits(balance, decimals))}
          >
            {maxLabel}
          </button>
        )}
      </div>
      <span className={error && value ? "error" : "hint"} id={`${id}-hint`}>
        {error && value
          ? error
          : balance === undefined
            ? (balanceLabel ?? "Connect wallet")
            : `Balance: ${formatUnits(balance, decimals)} ${unit}`}
      </span>
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-describedby={hint ? id + "-hint" : undefined}
      />
      {hint && (
        <span className="hint" id={id + "-hint"}>
          {hint}
        </span>
      )}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}
export function Stat({
  label,
  children,
  detail,
}: {
  label: string;
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong>{children}</strong>
      {detail && <span className="hint">{detail}</span>}
    </div>
  );
}
export function Section({
  title,
  children,
  aside,
  id,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function date(t: bigint | undefined) {
  return t
    ? new Date(Number(t) * 1000).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "After setup";
}
export function remaining(t: bigint, now: bigint) {
  const n = Number(t - now);
  if (n <= 0) return "Expired";
  return `${Math.floor(n / 86400)}d ${Math.floor((n % 86400) / 3600)}h ${Math.floor((n % 3600) / 60)}m left`;
}
