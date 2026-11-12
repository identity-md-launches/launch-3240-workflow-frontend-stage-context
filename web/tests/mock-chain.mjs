import fs from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  toHex,
  keccak256,
  parseAbi,
  getAddress,
} from "viem";
import { protocol } from "../src/config.ts";
export const handoff = JSON.parse(
  fs.readFileSync(new URL("../handoff.json", import.meta.url)),
);
export const network = JSON.parse(
  fs.readFileSync(new URL("../network.json", import.meta.url)),
);
const launch = JSON.parse(
  fs.readFileSync(
    new URL("../../docs/validation/launch.json", import.meta.url),
  ),
);
const contract = (name) =>
  handoff.contracts.find((c) => c.name === name).address;
const abis = Object.fromEntries(
  [
    "LaunchToken",
    "LpDesk",
    "FirmVault",
    "GenesisSplitter",
    "LpGovernor",
    "PriceGuard",
    "VenueV3",
    "VenueV4",
    "Burner",
  ].map((n) => [
    n,
    JSON.parse(
      fs.readFileSync(new URL(`../public/abi/${n}.json`, import.meta.url)),
    ),
  ]),
);
const stock = contract("LaunchToken"),
  desk = contract("LpDesk"),
  vault = contract("FirmVault"),
  splitter = contract("GenesisSplitter"),
  imd = network.network.pairToken.address;
const modules = launch.modules.map((m) => m.address);
const burner = launch.burner;
const registry = launch.registry,
  factory = launch.factory,
  dead = "0x000000000000000000000000000000000000dEaD";
const addresses = {
  LaunchToken: stock,
  LpDesk: desk,
  FirmVault: vault,
  GenesisSplitter: splitter,
  LpGovernor: modules[0],
  PriceGuard: modules[1],
  VenueV3: modules[2],
  VenueV4: modules[3],
  Burner: burner,
  erc20: imd,
  factory,
  registry,
  state: network.network.uniswapV4.stateView,
  quoter: network.network.uniswapV4.quoter,
  router: network.network.uniswapV4.universalRouter,
  permit2: network.network.uniswapV4.permit2,
  bridge: factory,
};
const u = (n) => BigInt(n) * 10n ** 18n;
const eq = (a, b) => a?.toLowerCase() === b?.toLowerCase();
export function mockChain(options = {}) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const state = {
    account: launch.projectWallet,
    operator: launch.operator,
    chainId: 4663,
    unknownChain: false,
    reject: false,
    revert: null,
    afterBootstrap: false,
    modules: [true, true, true, true],
    registered: true,
    feeReady: true,
    splitDone: true,
    splitBalance: 0n,
    stockBalance: u(1000),
    imdBalance: u(1000),
    burnBalance: u(50),
    deadBalance: u(100),
    stake: u(100),
    totalStaked: u(10000),
    stakeAllowance: 0n,
    tokenAllowance: 0n,
    permitAllowance: 0n,
    extraVenue: false,
    requests: [],
    sent: [],
    block: 112575100n,
    nonce: 0,
    proposalState: [0, 6, 4],
    ...options,
  };
  const position = {
    positionManager: network.network.uniswapV4.positionManager,
    kind: 0,
    asset: imd,
    notStockIs0: false,
    fee: 3000,
    tickSpacing: 60,
    tickLower: -600,
    tickUpper: 600,
    tokenId: 1n,
    open: true,
  };
  function match(to, data) {
    for (const [name, address] of Object.entries(addresses)) {
      if (eq(to, address)) {
        const abi = abis[name] ?? protocol[name];
        try {
          return { ...decodeFunctionData({ abi, data }), abi, name };
        } catch {}
      }
    }
    throw Error(`Unknown target/call ${to} ${data}`);
  }
  const venues = () => [
    {
      positionManager: network.network.uniswapV4.positionManager,
      kind: 0,
      factory: network.network.uniswapV4.poolManager,
    },
    {
      positionManager: "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3",
      kind: 1,
      factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
    },
    {
      positionManager: "0x4857DB576eE0e45F10525eC59527BfD10beeC60b",
      kind: 2,
      factory: "0xc63d7338c178e805c544B8f897066bD3BBcBE136",
    },
    ...(state.extraVenue
      ? [{ positionManager: factory, kind: 1, factory: registry }]
      : []),
  ];
  function value(name, fn, a = []) {
    const id = Number(a[0]);
    if (fn === "lpDesk") return desk;
    if (["LaunchToken", "erc20"].includes(name)) {
      if (fn === "symbol") return name === "LaunchToken" ? "NOTSTOCK" : "IMD";
      if (fn === "name")
        return name === "LaunchToken" ? "Not Firm" : "Identity.md";
      if (fn === "decimals") return 18;
      if (fn === "balanceOf") {
        if (eq(a[0], state.account))
          return name === "LaunchToken" ? state.stockBalance : state.imdBalance;
        if (eq(a[0], burner)) return state.burnBalance;
        if (eq(a[0], dead)) return state.deadBalance;
        if (eq(a[0], splitter)) return state.splitBalance;
        if (eq(a[0], vault)) return name === "LaunchToken" ? u(12) : u(10000);
        if (eq(a[0], desk))
          return name === "LaunchToken" ? u(500000000) : u(5000);
        return 0n;
      }
      if (fn === "allowance")
        return eq(a[1], modules[0])
          ? state.stakeAllowance
          : state.tokenAllowance;
      if (fn === "approve" || fn === "transfer") return true;
    }
    if (name === "LpDesk") {
      const map = {
        operator: state.operator,
        projectWallet: launch.projectWallet,
        launchFactory: factory,
        burner,
        governor: modules[0],
        priceGuard: modules[1],
        venueV3: modules[2],
        venueV4: modules[3],
        DEAD: dead,
        registered: state.registered,
        bootstrapEnd: state.registered
          ? state.afterBootstrap
            ? now - 1n
            : now + 604800n
          : 0n,
        positions: state.modules.every(Boolean) ? [position] : [],
        positionCount: state.modules.every(Boolean) ? 1n : 0n,
        positionLiquidity: u(100),
        notStock: stock,
        IMD: imd,
        firmVault: vault,
        poolKey: handoff.poolKey,
      };
      if (fn in map) return map[fn];
      if (fn === "moduleDeployed") return state.modules[id];
      if (fn === "moduleAddress" || fn === "deployModule") return modules[id];
      if (fn === "freeBalance") return eq(a[0], stock) ? u(500000000) : u(5000);
      if (fn === "topUpBasket" || fn === "buybackBasket")
        return eq(a[0], stock) ? 0n : u(1000);
      if (fn === "codeHashOf") {
        const code = JSON.parse(
          fs.readFileSync(
            new URL(
              `../public/modules/${["LpGovernor", "PriceGuard", "VenueV3", "VenueV4"][id]}.json`,
              import.meta.url,
            ),
          ),
        );
        return keccak256(code.creationCode);
      }
      if (fn === "buyback") return u(90);
      if (fn === "open") return 1n;
    }
    if (name === "FirmVault") {
      if (fn === "buybackBucket") return u(1000);
      if (fn === "buyback") return u(90);
    }
    if (name === "GenesisSplitter" && fn === "done") return state.splitDone;
    if (name === "factory") {
      if (fn === "registry") return registry;
      if (fn === "positionOf")
        return {
          key: handoff.poolKey,
          tickLower: -887220,
          tickUpper: 887220,
          requester: state.feeReady ? vault : launch.projectWallet,
        };
    }
    if (name === "registry" && fn === "artifactsOf")
      return handoff.contracts.map((x) => ({
        kind: toHex("contract", { size: 32 }),
        name: toHex(x.name, { size: 32 }),
        addr: x.address,
      }));
    if (name === "PriceGuard") {
      if (fn === "venues") return venues();
      if (fn === "assets") return [imd];
      if (fn === "registered") return state.registered;
    }
    if (name === "state") return [2n ** 96n, 0, 0, 12500];
    if (name === "quoter") return [u(95), 120000n];
    if (name === "permit2" && fn === "allowance")
      return [state.permitAllowance, Number(now + 3600n), 0];
    if (name === "VenueV3" || name === "VenueV4") {
      if (fn === "poolPrice") return [true, state.poolSqrt ?? 2n ** 96n, 0];
      if (fn === "tickSpacingOf") return 60;
    }
    if (name === "LpGovernor") {
      if (fn === "staked") return state.stake;
      if (fn === "totalStaked") return state.totalStaked;
      if (fn === "proposalCount") return BigInt(state.proposalState.length);
      if (fn === "state") return state.proposalState[id];
      if (fn === "deadlines")
        return [
          now + 3600n,
          now + 3600n + 172800n,
          now + 3600n + 172800n + 259200n,
        ];
      if (fn === "hasVoted") return false;
      if (fn === "stakeAt") return state.stake;
      if (fn === "bridges")
        return state.bridgeMode
          ? [{ adapter: factory, dstEid: 30101, dstLpDesk: desk }]
          : [];
      if (fn === "getProposal")
        return {
          kind: state.bridgeMode && id === 2 ? 4 : 2,
          author: state.account,
          byOperator: false,
          executed: false,
          vetoed: false,
          createdAt: now - 3600n,
          snapshotBlock: 112575000n,
          quorumBase: u(10000),
          forWeight: u(500),
          againstWeight: u(10),
          open: {
            asset: imd,
            venue: network.network.uniswapV4.positionManager,
            feeTier: 3000,
            tickSpacing: 60,
            tickLower: -600,
            tickUpper: 600,
            sqrtPriceX96: 2n ** 96n,
            amount: u(100),
            amount0Min: u(99),
            amount1Min: u(99),
          },
          target: factory,
          venueKind: 1,
          dstEid: 0,
          dstLpDesk: desk,
          bridgeId: 0n,
          amount: state.bridgeMode ? u(10) : 0n,
        };
      if (fn.startsWith("propose")) return 3n;
    }
    if (name === "bridge" && fn === "quoteSend")
      return { nativeFee: 1000000000000000n, lzTokenFee: 0n };
    const abi = abis[name] ?? protocol[name];
    const fnAbi = abi.find((x) => x.type === "function" && x.name === fn);
    if (fnAbi?.outputs?.length === 0) return undefined;
    throw Error(`Unmocked ${name}.${fn}`);
  }
  function apply(call) {
    const { functionName: fn, args: a = [], name } = call;
    if (fn === "approve" && name === "LaunchToken" && eq(a[0], modules[0]))
      state.stakeAllowance = a[1];
    else if (fn === "approve" && name === "permit2")
      state.permitAllowance = a[2];
    else if (fn === "approve") state.tokenAllowance = a[1];
    if (fn === "stake") {
      state.stake += a[0];
      state.stockBalance -= a[0];
    }
    if (fn === "unstake") {
      state.stake -= a[0];
      state.stockBalance += a[0];
    }
    if (fn === "burn" && name === "Burner") {
      state.deadBalance += state.burnBalance;
      state.burnBalance = 0n;
    }
    if (fn === "transfer" && eq(a[0], burner)) {
      state.stockBalance -= a[1];
      state.burnBalance += a[1];
    }
    if (fn === "execute" && name === "LpGovernor") {
      state.extraVenue = true;
      state.proposalState[Number(a[0])] = 5;
    }
    if (fn === "deployModule") state.modules[Number(a[0])] = true;
    if (fn === "transfer" && eq(a[0], splitter)) {
      state.splitBalance += a[1];
      state.stockBalance -= a[1];
    }
    if (fn === "setRequester") state.feeReady = true;
    if (fn === "registerNotStock") state.registered = true;
    if (fn === "split") {
      state.splitDone = true;
      state.splitBalance = 0n;
    }
  }
  const hash = () => `0x${state.nonce.toString(16).padStart(64, "0")}`;
  async function rpc({ method, params = [], id }) {
    state.requests.push(method);
    let result;
    if (method === "eth_chainId")
      result = toHex(state.rpcChainId ?? handoff.chainId);
    else if (method === "eth_blockNumber") result = toHex(state.block);
    else if (method === "eth_getCode") result = "0x60006000";
    else if (method === "eth_getBalance") result = toHex(u(100));
    else if (method === "eth_getTransactionCount") result = "0x0";
    else if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas")
      result = "0x1312d00";
    else if (method === "eth_estimateGas") result = "0x30d40";
    else if (method === "eth_getLogs") result = [];
    else if (method === "eth_getBlockByNumber") {
      const number = params[0] === "latest" ? state.block : BigInt(params[0]);
      result = {
        number: toHex(number),
        timestamp: toHex(number < state.block ? now - 3600n : now),
        hash: "0x" + "22".repeat(32),
        parentHash: "0x" + "33".repeat(32),
        nonce: "0x0000000000000000",
        sha3Uncles: "0x" + "44".repeat(32),
        logsBloom: "0x" + "00".repeat(256),
        transactionsRoot: "0x" + "55".repeat(32),
        stateRoot: "0x" + "66".repeat(32),
        receiptsRoot: "0x" + "77".repeat(32),
        miner: state.operator,
        difficulty: "0x0",
        totalDifficulty: "0x0",
        extraData: "0x",
        size: "0x200",
        gasLimit: "0x1c9c380",
        gasUsed: "0x100",
        baseFeePerGas: "0x1312d00",
        transactions: [],
        uncles: [],
      };
    } else if (method === "eth_call") {
      const call = match(params[0].to, params[0].data);
      if (state.revert && call.functionName === state.revert.fn)
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: 3,
            message: "execution reverted",
            data: encodeErrorResult({
              abi: call.abi,
              errorName: state.revert.error,
            }),
          },
        };
      try {
        result = encodeFunctionResult({
          abi: call.abi,
          functionName: call.functionName,
          result: value(call.name, call.functionName, call.args),
        });
      } catch (e) {
        console.error(call.name, call.functionName, e);
        throw e;
      }
    } else if (method === "eth_getTransactionReceipt")
      result = {
        transactionHash: params[0],
        transactionIndex: "0x0",
        blockHash: "0x" + "22".repeat(32),
        blockNumber: toHex(state.block),
        from: state.account,
        to: desk,
        cumulativeGasUsed: "0x30d40",
        gasUsed: "0x30d40",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: "0x1",
        effectiveGasPrice: "0x1312d00",
        type: "0x2",
      };
    else throw Error("Unmocked RPC " + method);
    return { jsonrpc: "2.0", id, result };
  }
  async function wallet({ method, params = [] }) {
    state.requests.push(method);
    if (method === "eth_requestAccounts") {
      if (state.reject) throw { code: 4001, message: "User rejected" };
      return [state.account];
    }
    if (method === "eth_accounts") return [state.account];
    if (method === "eth_chainId") return toHex(state.chainId);
    if (method === "wallet_switchEthereumChain") {
      if (state.unknownChain) {
        state.unknownChain = false;
        throw { code: 4902, message: "Unknown chain" };
      }
      if (state.reject || state.switchReject)
        throw { code: 4001, message: "User rejected" };
      state.chainId = Number(params[0].chainId);
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      state.addedChain = params[0];
      return null;
    }
    if (method === "eth_sendTransaction") {
      if (state.reject) throw { code: 4001, message: "User rejected" };
      const call = match(params[0].to, params[0].data);
      state.sent.push({
        name: call.name,
        fn: call.functionName,
        args: call.args,
        tx: params[0],
      });
      apply(call);
      state.nonce++;
      state.block++;
      return hash();
    }
    return (await rpc({ method, params, id: 1 })).result;
  }
  async function install(page) {
    await page.route("https://**", async (route) => {
      if (
        network.network.rpcUrls.some((url) =>
          route.request().url().startsWith(url),
        )
      ) {
        const body = route.request().postDataJSON();
        try {
          const answer = Array.isArray(body)
            ? await Promise.all(body.map(rpc))
            : await rpc(body);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(answer),
          });
        } catch (e) {
          await route.fulfill({ status: 500, body: String(e) });
        }
      } else await route.abort();
    });
    await page.exposeFunction("__walletRequest", async (args) => {
      try {
        return { result: await wallet(args) };
      } catch (e) {
        return {
          error: { code: e.code ?? -1, message: e.message ?? String(e) },
        };
      }
    });
    await page.addInitScript((noWallet) => {
      if (noWallet) return;
      const listeners = {};
      const provider = {
        request: async (args) => {
          const x = await window.__walletRequest(args);
          if (x.error) throw x.error;
          return x.result;
        },
        on: (name, fn) => (listeners[name] ??= []).push(fn),
        removeListener: (name, fn) => {
          listeners[name] = (listeners[name] ?? []).filter((x) => x !== fn);
        },
      };
      window.ethereum = provider;
      window.mockWallet = {
        emit: (name, value) =>
          (listeners[name] ?? []).forEach((fn) => fn(value)),
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "not-firm-test-wallet",
                name: "Test browser wallet",
                rdns: "test.notfirm",
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="green"/></svg>',
              },
              provider,
            },
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    }, !!state.noWallet);
  }
  return { state, install, addresses, abis, rpc };
}
