import { useState } from "react";
import { useApp } from "./context";
import { contract } from "./config";
import { Amount, Section, Stat, Tx, AddressLink } from "./components";
import { amountText } from "./chain";
import { checkAmount, parseAmount } from "./math";
export function Burn() {
  const { c, s } = useApp();
  const [amount, setAmount] = useState("");
  const stock = contract(c, "LaunchToken");
  const reason = checkAmount(amount, 18, s?.walletStock, "NOTSTOCK");
  return (
    <>
      <div className="page-title">
        <h1 tabIndex={-1}>Burn NOTSTOCK</h1>
        <p>Send tokens to the dead address, permanently.</p>
      </div>
      <div className="stats">
        <Stat label="Ready in Burner">
          {s ? `${amountText(s.burnerBalance)} NOTSTOCK` : "Reading chain…"}
        </Stat>
        <Stat label="Total burned">
          {s ? `${amountText(s.burned)} NOTSTOCK` : "Reading chain…"}
        </Stat>
      </div>
      <div className="two-col">
        <Section title="Burn the balance">
          <p>Anyone can burn the tokens held by Burner.</p>
          <Tx
            label="Burn"
            description={`Permanently send ${amountText(s?.burnerBalance)} NOTSTOCK from Burner to the dead address. This cannot be reversed.`}
            reason={
              !s
                ? "Reading chain…"
                : s.burnerBalance === 0n
                  ? "Burner has no NOTSTOCK to burn"
                  : ""
            }
            call={async () => ({
              address: s!.burner,
              abi: c.abis.Burner,
              functionName: "burn",
            })}
          />
          {s && <AddressLink address={s.burner} label="Burner" />}
        </Section>
        <Section title="Deposit to Burner">
          <Amount
            label="NOTSTOCK amount"
            value={amount}
            onChange={setAmount}
            balance={s?.walletStock}
            unit="NOTSTOCK"
            error={reason}
          />
          <Tx
            label="Deposit NOTSTOCK"
            description={`Transfer ${amount} NOTSTOCK to Burner. Anyone can then permanently burn these tokens.`}
            reason={reason}
            call={async () => ({
              ...stock,
              functionName: "transfer",
              args: [s!.burner, parseAmount(amount, 18)],
            })}
          />
          <p className="hint">A plain token transfer. No approval is needed.</p>
        </Section>
      </div>
      {s && (
        <p className="hint">
          Burn destination: <AddressLink address={s.dead} />
        </p>
      )}
    </>
  );
}
