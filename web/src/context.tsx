import { createContext, useContext, type ReactNode } from "react";
import type { Address, Abi, Hex } from "viem";
import type { Config, Provider } from "./config";
import type { Snapshot, History } from "./chain";
export type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
export type AppContext = {
  c: Config;
  s?: Snapshot;
  history?: History;
  historyStatus: string;
  account?: Address;
  provider?: Provider;
  walletChain?: number;
  verified: boolean;
  refresh: () => Promise<void>;
  connect: () => void;
  transact: (
    call: Call,
    description: string,
    onStatus: (s: string) => void,
  ) => Promise<Hex>;
  busy: boolean;
};
export const Context = createContext<AppContext | null>(null);
export function useApp() {
  const v = useContext(Context);
  if (!v) throw Error("Application not loaded");
  return v;
}
