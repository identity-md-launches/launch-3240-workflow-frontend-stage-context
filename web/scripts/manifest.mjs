import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { keccak256, toBytes } from "viem";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const canonical = (x) => JSON.stringify(sort(x));
function sort(x) {
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
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const input = fs.existsSync(path.join(root, ".imd/reads/deployment.json"))
  ? read(".imd/reads/deployment.json")
  : read("web/handoff.json");
const net = fs.existsSync(path.join(root, ".imd/reads/network.json"))
  ? read(".imd/reads/network.json")
  : read("web/network.json");
const base = {
  version: 1,
  launchId: input.launchId,
  chainId: input.chainId,
  sourceCommit: input.sourceCommit,
  attestationHash: input.attestationHash,
  contracts: input.contracts.map((c) => ({
    name: c.name,
    address: c.address,
    abiHash: c.abiHash,
    abiPath: `abi/${c.name}.json`,
  })),
};
if (input.poolKey) base.poolKey = input.poolKey;
base.network = net.network;
if (net.walletAddChain) base.walletAddChain = net.walletAddChain;
for (const c of base.contracts) {
  const abi = read("dist/" + c.abiPath);
  if (!Array.isArray(abi)) throw Error("ABI is not an array");
  const hash = keccak256(toBytes(canonical(abi))).slice(2);
  if (hash !== c.abiHash) throw Error(`ABI mismatch: ${c.name}: ${hash}`);
}
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
const exported = files(path.join(root, "dist"))
  .filter((p) => path.basename(p) !== "imd-deployment.json")
  .sort();
if (exported.length > 128) throw Error("More than 128 assets");
base.assets = exported.map((p) => {
  if (fs.statSync(p).size > 8388608) throw Error("Asset too large");
  return {
    path: path.relative(path.join(root, "dist"), p).split(path.sep).join("/"),
    sha256: createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
  };
});
if (process.argv.includes("--check")) {
  if (canonical(read("dist/imd-deployment.json")) !== canonical(base))
    throw Error("Manifest differs from handoff or final bytes");
} else
  fs.writeFileSync(
    path.join(root, "dist/imd-deployment.json"),
    JSON.stringify(base, null, 2) + "\n",
  );
console.log(
  JSON.stringify({
    verified: true,
    contracts: base.contracts.length,
    assets: base.assets.length,
    bytes: exported.reduce((n, p) => n + fs.statSync(p).size, 0),
  }),
);
