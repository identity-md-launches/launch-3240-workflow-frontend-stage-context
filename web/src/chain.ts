import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  formatUnits,
  type Address,
  type Abi,
  type Hex,
} from "viem";
import {
  contract,
  protocol,
  LAUNCH_NUMBER,
  moduleNames,
  type Config,
} from "./config";
export type Token = {
  address: Address;
  symbol: string;
  decimals: number;
  free: bigint;
  topUp: bigint;
  buyback: bigint;
};
export type Venue = {
  positionManager: Address;
  kind: number;
  factory: Address;
};
export type Position = {
  id: number;
  positionManager: Address;
  kind: number;
  asset: Address;
  notStockIs0: boolean;
  fee: number;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  tokenId: bigint;
  open: boolean;
  liquidity: bigint;
  price: bigint;
  error?: string;
};
export type Proposal = {
  id: number;
  kind: number;
  author: Address;
  byOperator: boolean;
  executed: boolean;
  vetoed: boolean;
  createdAt: bigint;
  snapshotBlock: bigint;
  quorumBase: bigint;
  forWeight: bigint;
  againstWeight: bigint;
  open: any;
  target: Address;
  venueKind: number;
  dstEid: number;
  dstLpDesk: Address;
  bridgeId: bigint;
  amount: bigint;
  state: number;
  deadlines: readonly bigint[];
  voted: boolean;
  weight: bigint;
};
export type Snapshot = {
  block: bigint;
  timestamp: bigint;
  operator: Address;
  projectWallet: Address;
  factory: Address;
  burner: Address;
  governor: Address;
  guard: Address;
  venueV3: Address;
  venueV4: Address;
  dead: Address;
  modules: boolean[];
  registered: boolean;
  bootstrapEnd: bigint;
  splitDone: boolean;
  splitBalance: bigint;
  feeRecipient: Address;
  launchVerified: boolean;
  price: bigint;
  bucket: bigint;
  undistributed: bigint;
  vaultStock: bigint;
  burnerBalance: bigint;
  burned: bigint;
  walletStock?: bigint;
  walletImd?: bigint;
  stake?: bigint;
  totalStaked?: bigint;
  allowance?: bigint;
  venues: Venue[];
  tokens: Token[];
  positions: Position[];
  proposals: Proposal[];
  bridges: any[];
  errors: string[];
};
export async function read(
  c: Config,
  name: string,
  address: Address,
  fn: string,
  args: unknown[] = [],
  blockNumber?: bigint,
): Promise<any> {
  return c.client.readContract({
    address,
    abi: c.abis[name] ?? protocol[name as keyof typeof protocol],
    functionName: fn,
    args,
    blockNumber,
  } as any);
}
export function posRef(
  p: Pick<
    Position,
    | "positionManager"
    | "kind"
    | "asset"
    | "fee"
    | "tickSpacing"
    | "tickLower"
    | "tickUpper"
    | "tokenId"
  >,
  stock: Address,
) {
  const is0 = stock.toLowerCase() < p.asset.toLowerCase();
  return {
    positionManager: p.positionManager,
    kind: p.kind,
    token0: is0 ? stock : p.asset,
    token1: is0 ? p.asset : stock,
    fee: p.fee,
    tickSpacing: p.tickSpacing,
    tickLower: p.tickLower,
    tickUpper: p.tickUpper,
    tokenId: p.tokenId,
  };
}
export function poolId(key: any) {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
      ),
      [key],
    ),
  );
}
export async function verifyChain(c: Config) {
  if ((await c.client.getChainId()) !== c.deployment.chainId)
    throw Error("The RPC returned the wrong chain. Transactions are disabled.");
  for (const e of c.deployment.contracts) {
    const code = await c.client.getCode({ address: e.address });
    if (!code || code === "0x")
      throw Error(`${e.name} has no deployed code. Transactions are disabled.`);
  }
}
export async function snapshot(
  c: Config,
  account?: Address,
): Promise<Snapshot> {
  const desk = contract(c, "LpDesk").address,
    stock = contract(c, "LaunchToken").address,
    vault = contract(c, "FirmVault").address,
    splitter = contract(c, "GenesisSplitter").address,
    imd = c.deployment.network.pairToken.address;
  const block = await c.client.getBlock();
  const r = (
    name: string,
    address: Address,
    fn: string,
    args: unknown[] = [],
  ) => read(c, name, address, fn, args, block.number);
  const d = (fn: string, args: unknown[] = []) => r("LpDesk", desk, fn, args);
  const bal = (token: Address, owner: Address) =>
    r("erc20", token, "balanceOf", [owner]);
  const [
    operator,
    projectWallet,
    factory,
    burner,
    governor,
    guard,
    venueV3,
    venueV4,
    dead,
    registered,
    bootstrapEnd,
    positions,
    modules,
    bucket,
    splitDone,
    splitBalance,
    vaultImd,
    vaultStock,
    price,
  ] = await Promise.all([
    ...[
      "operator",
      "projectWallet",
      "launchFactory",
      "burner",
      "governor",
      "priceGuard",
      "venueV3",
      "venueV4",
      "DEAD",
      "registered",
      "bootstrapEnd",
      "positions",
    ].map((fn) => d(fn)),
    Promise.all(moduleNames.map((_, i) => d("moduleDeployed", [i]))),
    r("FirmVault", vault, "buybackBucket"),
    r("GenesisSplitter", splitter, "done"),
    bal(stock, splitter),
    bal(imd, vault),
    bal(stock, vault),
    r("state", c.deployment.network.uniswapV4.stateView, "getSlot0", [
      poolId(c.deployment.poolKey),
    ]),
  ]);
  const record = await r("factory", factory, "positionOf", [LAUNCH_NUMBER]);
  const registry = await r("factory", factory, "registry");
  const artifacts = await r("registry", registry, "artifactsOf", [
    LAUNCH_NUMBER,
  ]);
  const launchVerified =
    Object.keys(c.deployment.poolKey).every(
      (k) =>
        String(record.key[k]).toLowerCase() ===
        String(
          c.deployment.poolKey[k as keyof typeof c.deployment.poolKey],
        ).toLowerCase(),
    ) &&
    c.deployment.contracts.every((x) =>
      artifacts.some(
        (a: any) => a.addr.toLowerCase() === x.address.toLowerCase(),
      ),
    );
  if (!launchVerified)
    throw Error("Launch 3232 does not match the handoff. Setup is disabled.");
  const bindings = await Promise.all([
    r("Burner", burner, "lpDesk"),
    modules[0] ? r("LpGovernor", governor, "lpDesk") : desk,
    modules[1] ? r("PriceGuard", guard, "lpDesk") : desk,
  ]);
  if (bindings.some((x) => !same(x, desk)))
    throw Error(
      "A module is bound to another LP Desk. Transactions are disabled.",
    );
  const [
    burnerBalance,
    burned,
    venues,
    assets,
    totalStaked,
    walletStock,
    walletImd,
    stake,
    allowance,
  ] = await Promise.all([
    bal(stock, burner),
    bal(stock, dead),
    modules[1] ? r("PriceGuard", guard, "venues") : [],
    modules[1] ? r("PriceGuard", guard, "assets") : [imd],
    modules[0] ? r("LpGovernor", governor, "totalStaked") : undefined,
    account ? bal(stock, account) : undefined,
    account ? bal(imd, account) : undefined,
    account && modules[0]
      ? r("LpGovernor", governor, "staked", [account])
      : undefined,
    account && modules[0]
      ? r("erc20", stock, "allowance", [account, governor])
      : undefined,
  ]);
  const errors: string[] = [];
  const tokens = await Promise.all(
    [...new Set<Address>([stock, ...assets])].map(async (address) => {
      const [symbol, decimals, free, topUp, buyback] = await Promise.all([
        r("erc20", address, "symbol"),
        r("erc20", address, "decimals"),
        d("freeBalance", [address]),
        d("topUpBasket", [address]),
        d("buybackBasket", [address]),
      ]);
      return { address, symbol, decimals, free, topUp, buyback };
    }),
  );
  const fullPositions = await Promise.all(
    positions.map(async (p: any, id: number) => {
      try {
        const name = p.kind === 0 ? "VenueV4" : "VenueV3";
        const [liquidity, price] = await Promise.all([
          p.open ? d("positionLiquidity", [BigInt(id)]) : 0n,
          p.open
            ? r(name, p.kind === 0 ? venueV4 : venueV3, "poolPrice", [
                posRef(p, stock),
              ])
            : [false, 0n, 0],
        ]);
        return { ...p, id, liquidity, price: price[1] };
      } catch {
        errors.push(`Refresh position ${id} to read its current value.`);
        return {
          ...p,
          id,
          liquidity: 0n,
          price: 0n,
          error: "Could not read this position’s current value.",
        };
      }
    }),
  );
  const count = modules[0]
    ? Number(await r("LpGovernor", governor, "proposalCount"))
    : 0;
  const proposals: Proposal[] = [];
  for (let start = 0; start < count; start += 20) {
    proposals.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(20, count - start) }, async (_, i) => {
          const id = start + i;
          const [p, state, deadlines, voted] = await Promise.all([
            r("LpGovernor", governor, "getProposal", [BigInt(id)]),
            r("LpGovernor", governor, "state", [BigInt(id)]),
            r("LpGovernor", governor, "deadlines", [BigInt(id)]),
            account
              ? r("LpGovernor", governor, "hasVoted", [BigInt(id), account])
              : false,
          ]);
          const weight = account
            ? await r("LpGovernor", governor, "stakeAt", [
                account,
                p.snapshotBlock,
              ])
            : 0n;
          return { ...p, id, state, deadlines, voted, weight };
        }),
      )),
    );
  }
  const bridges = modules[0] ? await r("LpGovernor", governor, "bridges") : [];
  return {
    block: block.number,
    timestamp: block.timestamp,
    operator,
    projectWallet,
    factory,
    burner,
    governor,
    guard,
    venueV3,
    venueV4,
    dead,
    registered,
    bootstrapEnd,
    modules,
    splitDone,
    splitBalance,
    feeRecipient: record.requester,
    launchVerified,
    price: price[0],
    bucket,
    undistributed: BigInt(vaultImd) - BigInt(bucket),
    vaultStock,
    burnerBalance,
    burned,
    walletStock,
    walletImd,
    stake,
    totalStaked,
    allowance,
    venues,
    tokens,
    positions: fullPositions,
    proposals,
    bridges,
    errors,
  };
}
export const amountText = (value: bigint | undefined, decimals = 18) =>
  value === undefined
    ? "Connect wallet"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(
        Number(formatUnits(value, decimals)),
      );
export const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function priceInAsset(
  sqrt: bigint,
  stockIs0: boolean,
  assetDecimals: number,
) {
  const ratio = (Number(sqrt) / 2 ** 96) ** 2;
  return (stockIs0 ? ratio : 1 / ratio) * 10 ** (18 - assetDecimals);
}
export type History = {
  from: bigint;
  to: bigint;
  startTime: bigint;
  fees: Record<string, bigint>;
  received: Record<string, bigint>;
  buybacks: any[];
  bridges: any[];
  burnChange: bigint;
  logs: number;
};
export async function history(
  c: Config,
  s: Pick<Snapshot, "block" | "timestamp" | "dead">,
  progress: (text: string) => void,
): Promise<History> {
  const first = 112566380n,
    desk = contract(c, "LpDesk").address,
    vault = contract(c, "FirmVault").address,
    stock = contract(c, "LaunchToken").address,
    imd = c.deployment.network.pairToken.address;
  const target = s.timestamp - 604800n;
  let lo = first,
    hi = s.block;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const b = await c.client.getBlock({ blockNumber: mid });
    if (b.timestamp < target) lo = mid + 1n;
    else hi = mid;
  }
  const week = lo,
    fees: Record<string, bigint> = {},
    received: Record<string, bigint> = {},
    buybacks: any[] = [],
    bridges: any[] = [];
  let logs = 0,
    burnChange = 0n;
  const addresses = [desk, vault, stock, imd];
  let size = 50000n;
  for (let from = first; from <= s.block;) {
    const to = from + size - 1n < s.block ? from + size - 1n : s.block;
    progress(
      `Reading chain history: block ${from.toString()} of ${s.block.toString()}`,
    );
    let batch;
    try {
      batch = await c.client.getLogs({
        address: addresses,
        fromBlock: from,
        toBlock: to,
      });
    } catch (e) {
      if (size > 100n) {
        size /= 2n;
        continue;
      }
      throw e;
    }
    const { decodeEventLog } = await import("viem");
    for (const log of batch) {
      try {
        const name = same(log.address, desk)
          ? "LpDesk"
          : same(log.address, vault)
            ? "FirmVault"
            : "erc20";
        const decoded = decodeEventLog({
          abi: c.abis[name] ?? protocol.erc20,
          data: log.data,
          topics: log.topics,
        }) as any;
        const a = decoded.args;
        if (a.token) a.token = a.token.toLowerCase();
        logs++;
        if (
          log.blockNumber! >= week &&
          decoded.eventName === "Transfer" &&
          same(log.address, stock)
        ) {
          if (same(a.to, s.dead)) burnChange += a.value;
          if (same(a.from, s.dead)) burnChange -= a.value;
        }
        if (decoded.eventName === "Distributed" && !same(a.token, stock)) {
          received[a.token] = (received[a.token] ?? 0n) + a.amount / 4n;
        }
        if (decoded.eventName === "FeesSplit" && !same(a.token, stock)) {
          received[a.token] = (received[a.token] ?? 0n) + a.amount / 4n;
        }
        if (log.blockNumber! >= week && decoded.eventName === "FeesSplit")
          fees[a.token] = (fees[a.token] ?? 0n) + a.amount;
        if (
          log.blockNumber! >= week &&
          decoded.eventName === "Transfer" &&
          same(a.to, vault) &&
          !same(a.from, desk)
        )
          fees[log.address.toLowerCase()] =
            (fees[log.address.toLowerCase()] ?? 0n) + a.value;
        if (
          log.blockNumber! >= week &&
          ["Buyback", "BuybackExecuted"].includes(decoded.eventName)
        )
          buybacks.push({
            ...a,
            hash: log.transactionHash,
            block: log.blockNumber,
            source: name,
          });
        if (decoded.eventName === "BridgedOut")
          bridges.push({
            ...a,
            hash: log.transactionHash,
            block: log.blockNumber,
          });
      } catch {}
    }
    from = to + 1n;
  }
  const startTime = (await c.client.getBlock({ blockNumber: week })).timestamp;
  return {
    from: week,
    to: s.block,
    startTime,
    fees,
    received,
    buybacks,
    bridges,
    burnChange,
    logs,
  };
}
