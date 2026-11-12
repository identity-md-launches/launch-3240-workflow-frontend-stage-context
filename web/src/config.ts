import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  custom,
  keccak256,
  toBytes,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
export type Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<any>;
  on?: (event: string, fn: (value: any) => void) => void;
  removeListener?: (event: string, fn: (value: any) => void) => void;
};
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  poolKey: PoolKey;
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken: { address: Address; symbol: string; decimals: number };
  };
  walletAddChain: object;
};
export const moduleNames = [
  "LpGovernor",
  "PriceGuard",
  "VenueV3",
  "VenueV4",
] as const;
export const LAUNCH_NUMBER = 3232n; // Verified against launch receipt + factory positionOf/artifactsOf. See docs/validation/launch.json.
export const canonical = (x: any): string => JSON.stringify(sort(x));
function sort(x: any): any {
  return Array.isArray(x)
    ? x.map(sort)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, sort(x[k])]),
        )
      : x;
}
export const poolTuple =
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export const protocol = {
  erc20: parseAbi([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function transfer(address,uint256) returns (bool)",
    "event Transfer(address indexed from,address indexed to,uint256 value)",
  ]),
  factory: parseAbi([
    `function positionOf(uint64) view returns ((${poolTuple} key,int24 tickLower,int24 tickUpper,address requester))`,
    "function registry() view returns (address)",
    "function setRequester(uint64,address)",
    "error NotRequester()",
    "error UnknownLaunch()",
    "error ZeroAddress()",
  ]),
  registry: parseAbi([
    "function artifactsOf(uint64) view returns ((bytes32 kind,bytes32 name,address addr)[])",
  ]),
  state: parseAbi([
    "function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  ]),
  quoter: parseAbi([
    `function quoteExactInputSingle((${poolTuple} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
  ]),
  router: parseAbi([
    "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
    "error ExecutionFailed(uint256 commandIndex,bytes message)",
    "error TransactionDeadlinePassed()",
  ]),
  permit2: parseAbi([
    "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
    "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  ]),
  bridge: parseAbi([
    "function quoteSend((uint32 dstEid,bytes32 to,uint256 amountLD,uint256 minAmountLD,bytes extraOptions,bytes composeMsg,bytes oftCmd),bool payInLzToken) view returns ((uint256 nativeFee,uint256 lzTokenFee))",
  ]),
};
export async function jsonAsset<T>(path: string): Promise<T> {
  if (path.startsWith("/") || path.includes("..") || path.includes(":"))
    throw Error("Invalid asset path");
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok) throw Error(`Cannot load ${path}. Reload this page.`);
  return res.json();
}
export async function loadConfiguration() {
  const deployment = await jsonAsset<Deployment>("imd-deployment.json");
  if (
    deployment.version !== 1 ||
    deployment.chainId !== deployment.network.chainId ||
    deployment.contracts.length !== 4
  )
    throw Error("Deployment configuration does not match this application.");
  const abis: Record<string, Abi> = {};
  await Promise.all(
    deployment.contracts.map(async (contract) => {
      const abi = await jsonAsset<Abi>(contract.abiPath);
      if (keccak256(toBytes(canonical(abi))).slice(2) !== contract.abiHash)
        throw Error(`${contract.name} ABI integrity check failed.`);
      abis[contract.name] = abi;
    }),
  );
  await Promise.all(
    [...moduleNames, "Burner"].map(async (name) => {
      const path = `abi/${name}.json`;
      const res = await fetch(new URL(path, document.baseURI));
      const bytes = await res.arrayBuffer();
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (
        !res.ok ||
        deployment.assets.find((a) => a.path === path)?.sha256 !== digest
      )
        throw Error(`${name} ABI integrity check failed.`);
      abis[name] = JSON.parse(new TextDecoder().decode(bytes));
    }),
  );
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: deployment.network.explorer },
    },
    testnet: deployment.network.testnet,
  });
  const client = createPublicClient({
    chain,
    transport: fallback(
      deployment.network.rpcUrls.map((url) =>
        http(url, {
          timeout: 12000,
          retryCount: 1,
          batch: { batchSize: 30, wait: 40 },
        }),
      ),
      { rank: false },
    ),
    batch: { multicall: false },
  });
  return { deployment, abis, chain, client };
}
export type Config = Awaited<ReturnType<typeof loadConfiguration>>;
export function contract(c: Config, name: string) {
  const entry = c.deployment.contracts.find((c) => c.name === name);
  if (!entry) throw Error(`Missing ${name}`);
  return { ...entry, abi: c.abis[name] };
}
export function walletReadClient(c: Config, provider: Provider) {
  return createPublicClient({
    chain: c.chain,
    transport: fallback(
      [
        ...c.deployment.network.rpcUrls.map((url) =>
          http(url, { timeout: 10000, retryCount: 0 }),
        ),
        custom(provider),
      ],
      { rank: false },
    ),
  });
}
export async function switchChain(provider: Provider, deployment: Deployment) {
  const chainId = `0x${deployment.chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (e: any) {
    if (
      e.code === 4902 ||
      e?.data?.originalError?.code === 4902 ||
      /unknown chain|unrecognized chain|not added/i.test(e.message ?? "")
    ) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [deployment.walletAddChain],
      });
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } else throw e;
  }
  if (
    Number(await provider.request({ method: "eth_chainId" })) !==
    deployment.chainId
  )
    throw Error(`Switch to ${deployment.network.name} in your wallet.`);
}
export async function moduleCode(c: Config, kind: number): Promise<Hex> {
  const data = await jsonAsset<{ creationCode: Hex }>(
    `modules/${moduleNames[kind]}.json`,
  );
  const desk = contract(c, "LpDesk");
  const expected = await c.client.readContract({
    ...desk,
    functionName: "codeHashOf",
    args: [kind],
  });
  if (keccak256(data.creationCode) !== expected)
    throw Error("Module code does not match the deployed desk.");
  return data.creationCode;
}
