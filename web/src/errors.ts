import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Abi,
  type Hex,
} from "viem";
export const meanings: Record<string, string> = {
  NotOperator: "Only the current LP Desk operator can do this.",
  NotRequester:
    "Only the pool’s current fee recipient can set FirmVault as the recipient.",
  NotLpDesk: "This action must be called through LP Desk.",
  NotGovernor: "This action requires an executed governance proposal.",
  NotFirmVault: "Only FirmVault can credit this balance.",
  NotPoolManager: "Only the pool manager may make this callback.",
  AlreadyRegistered: "This launch is already registered.",
  NotRegistered: "Register the launch in Setup first.",
  ModuleMissing: "Deploy all required modules in Setup first.",
  ModuleExists: "This module is already deployed.",
  WrongModuleCode: "The module creation code does not match this launch.",
  WrongLaunchRecord: "The factory’s launch record does not match this desk.",
  WrongPool:
    "The launch pool does not match the required currencies, fee and hook.",
  WrongToken:
    "The token does not match Not Firm’s fixed name, symbol and supply.",
  SplitterUnderfunded: "Fund GenesisSplitter with 600,000,000 NOTSTOCK first.",
  WrongFeeRecipient: "Set FirmVault as the pool fee recipient first.",
  AlreadySplit: "Genesis has already been split.",
  NothingToSplit: "GenesisSplitter has no NOTSTOCK to split.",
  NothingToBurn: "Burner has no NOTSTOCK to burn.",
  ZeroAmount: "Enter an amount greater than zero.",
  ZeroAddress: "Enter a valid, nonzero address.",
  AlreadyListed: "This asset or venue is already listed.",
  NoCode: "There is no deployed contract at this address.",
  NotAVenue: "This contract does not implement the required venue interface.",
  NotStockIsNotAnAsset: "Choose a paired asset other than NOTSTOCK.",
  AboveBasket: "This amount exceeds the available basket. Lower the amount.",
  AboveBucket: "This amount exceeds FirmVault’s buyback bucket.",
  AboveFreeBalance: "This amount exceeds LP Desk’s free balance.",
  BelowMinOut:
    "The output is below your minimum. Refresh the quote or revise slippage.",
  BelowMinimum: "Use a minimum of at least 99.5% of the preview.",
  BootstrapOver:
    "Bootstrap has ended. Propose this position through governance.",
  BridgeMismatch: "The bridge did not lock the exact amount in its adapter.",
  BuybackMismatch:
    "The buyback moved an unexpected amount. No change was made.",
  ImdNotBuyable: "Use FirmVault for IMD buybacks.",
  NeedsNotStock:
    "This range needs NOTSTOCK. Top-ups can spend only the paired asset.",
  NotAnAssetOfThisPosition: "Choose one of this position’s two assets.",
  PairMismatch: "Choose positions with the same token pair.",
  PositionNotOpen: "This position is closed.",
  PriceMoved: "The pool price moved more than 0.5%. Refresh the preview.",
  UnlistedAsset: "Choose an asset from PriceGuard’s list.",
  UnlistedVenue: "Choose a venue from PriceGuard’s list.",
  TickOutOfRange: "Choose a range within the pool’s tick limits.",
  MulDivOverflow:
    "This amount or range exceeds the contract’s arithmetic limits.",
  InsufficientStake: "Your staked balance is below this amount.",
  BelowThreshold: "Stake at least 0.1% of total staked NOTSTOCK to propose.",
  KindAlreadyOpen:
    "A proposal of this kind is already open for your author group.",
  WrongState: "This proposal is no longer in the required state. Refresh it.",
  AlreadyVoted: "This wallet has already voted on this proposal.",
  NoWeight: "This wallet had no staked voting weight at the snapshot block.",
  BadBridge:
    "The adapter or destination does not match the required bridge interface.",
  UnknownBridge: "Choose a registered bridge.",
  NoValueExpected: "This action does not accept ETH.",
  UnsupportedToken: "FirmVault distributes only IMD and NOTSTOCK.",
  FeeTierDisabled: "This venue does not support that fee tier.",
  NoPool: "This pair has no initialized pool on the selected venue.",
  WrongCallback: "The pool callback could not be verified.",
  InsufficientBalance: "Your token balance is below this amount.",
  InsufficientAllowance: "Approve the required token amount first.",
  TransactionDeadlinePassed: "The quote expired. Request a new quote.",
  UnknownLaunch: "The factory has no record for this launch.",
};
export function explain(error: unknown, abis: Abi[] = []): string {
  const e = error as any;
  if (
    e?.code === 4001 ||
    e?.cause?.code === 4001 ||
    /user rejected|user denied/i.test(e?.message ?? "")
  )
    return "Request declined in your wallet. You can try again.";
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (reverted?.data?.errorName)
      return (
        meanings[reverted.data.errorName] ??
        `The contract refused ${reverted.data.errorName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}. Review the inputs and refresh.`
      );
  }
  const visited = new Set();
  function walk(x: any): string | undefined {
    if (!x || typeof x !== "object" || visited.has(x)) return;
    visited.add(x);
    if (typeof x.data === "string" && x.data.startsWith("0x"))
      for (const abi of abis) {
        try {
          const result = decodeErrorResult({ abi, data: x.data as Hex });
          if (meanings[result.errorName]) return meanings[result.errorName];
        } catch {}
      }
    return walk(x.cause) || walk(x.error) || walk(x.data);
  }
  const decoded = walk(e);
  if (decoded) return decoded;
  if (/insufficient funds/i.test(e?.message ?? ""))
    return "Your wallet needs more ETH for the transaction and network fee.";
  if (/revert/i.test(e?.message ?? ""))
    return "The contract refused this action. Refresh its state and check the amount, permissions and deadline.";
  if (/fetch|timeout|HTTP|network|socket/i.test(e?.message ?? ""))
    return "The public RPC did not respond. Retry the read or reconnect your wallet.";
  return (
    e?.shortMessage ||
    e?.message ||
    "This action could not finish. Refresh and try again."
  );
}
