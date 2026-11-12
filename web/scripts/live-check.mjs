import fs from "node:fs";
import {
  createPublicClient,
  http,
  parseAbi,
  decodeEventLog,
  keccak256,
  toBytes,
} from "viem";
const h = JSON.parse(fs.readFileSync("web/handoff.json")),
  n = JSON.parse(fs.readFileSync("web/network.json")).network;
const c = createPublicClient({
  transport: http(n.rpcUrls[0], { timeout: 20000 }),
});
const contract = (name) => h.contracts.find((c) => c.name === name);
const abi = (name) =>
  JSON.parse(fs.readFileSync(`web/public/abi/${name}.json`));
const desk = contract("LpDesk");
const r = (fn) =>
  c.readContract({
    address: desk.address,
    abi: abi("LpDesk"),
    functionName: fn,
  });
const receipt = await c.getTransactionReceipt({ hash: h.contracts[0].txHash });
const factory = await r("launchFactory");
if (factory.toLowerCase() !== receipt.to.toLowerCase())
  throw Error("factory mismatch");
const registry = await c.readContract({
  address: factory,
  abi: parseAbi(["function registry() view returns (address)"]),
  functionName: "registry",
});
const event = receipt.logs.find(
  (l) =>
    l.address.toLowerCase() === registry.toLowerCase() &&
    l.data.includes(h.attestationHash) &&
    l.data.includes(h.sourceCommit),
);
if (!event) throw Error("No attested registry log");
const launch = BigInt(event.topics[1]);
if (launch !== 3232n) throw Error("launch mismatch");
const pool = await c.readContract({
  address: factory,
  abi: parseAbi([
    "function positionOf(uint64) view returns (((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,int24 tickLower,int24 tickUpper,address requester))",
  ]),
  functionName: "positionOf",
  args: [launch],
});
for (const k of Object.keys(h.poolKey))
  if (String(h.poolKey[k]).toLowerCase() !== String(pool.key[k]).toLowerCase())
    throw Error("pool mismatch");
const artifacts = await c.readContract({
  address: registry,
  abi: parseAbi([
    "function artifactsOf(uint64) view returns ((bytes32 kind,bytes32 name,address addr)[])",
  ]),
  functionName: "artifactsOf",
  args: [launch],
});
for (const x of h.contracts)
  if (!artifacts.some((a) => a.addr.toLowerCase() === x.address.toLowerCase()))
    throw Error("artifact mismatch");
const code = await Promise.all(
  h.contracts.map(async (x) => ({
    name: x.name,
    address: x.address,
    codeBytes: ((await c.getCode({ address: x.address })).length - 2) / 2,
  })),
);
const modules = await Promise.all(
  [0, 1, 2, 3].map(async (kind) => ({
    kind,
    address: await c.readContract({
      address: desk.address,
      abi: abi("LpDesk"),
      functionName: "moduleAddress",
      args: [kind],
    }),
    deployed: await c.readContract({
      address: desk.address,
      abi: abi("LpDesk"),
      functionName: "moduleDeployed",
      args: [kind],
    }),
  })),
);
const doc = {
  checkedAt: new Date().toISOString(),
  chainId: await c.getChainId(),
  block: (await c.getBlockNumber()).toString(),
  launchNumber: launch.toString(),
  receiptHash: receipt.transactionHash,
  gasUsed: receipt.gasUsed.toString(),
  factory,
  registry,
  poolKey: pool.key,
  feeRecipient: pool.requester,
  code,
  modules,
  burner: await r("burner"),
  operator: await r("operator"),
  projectWallet: await r("projectWallet"),
  registered: await r("registered"),
  bootstrapEnd: (await r("bootstrapEnd")).toString(),
  transactionsBroadcast: false,
};
fs.writeFileSync(
  "docs/validation/launch.json",
  JSON.stringify(doc, null, 2) + "\n",
);
console.log(doc);
