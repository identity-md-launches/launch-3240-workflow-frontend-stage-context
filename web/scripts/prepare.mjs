import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { keccak256, toBytes, createPublicClient, http, parseAbi } from "viem";
const handoff = JSON.parse(fs.readFileSync("web/handoff.json"));
const net = JSON.parse(fs.readFileSync("web/network.json")).network;
const sort = (x) =>
  Array.isArray(x)
    ? x.map(sort)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, sort(x[k])]),
        )
      : x;
const records = [];
for (const name of [
  "LaunchToken",
  "LpDesk",
  "FirmVault",
  "GenesisSplitter",
  "Burner",
  "LpGovernor",
  "PriceGuard",
  "VenueV3",
  "VenueV4",
]) {
  const pinned = execFileSync("git", [
    "show",
    `${handoff.sourceCommit}:docs/abi/${name}.json`,
  ]);
  const abi = JSON.parse(pinned);
  const hash = keccak256(toBytes(JSON.stringify(sort(abi)))).slice(2);
  const h = handoff.contracts.find((c) => c.name === name);
  if (h && h.abiHash !== hash) throw Error("ABI mismatch " + name);
  const build = JSON.parse(
    fs.readFileSync(`test/scratch/forge-out/${name}.sol/${name}.json`),
  );
  if (JSON.stringify(sort(abi)) !== JSON.stringify(sort(build.abi)))
    throw Error("Built ABI differs " + name);
  fs.writeFileSync(`web/public/abi/${name}.json`, JSON.stringify(abi) + "\n");
  records.push({
    name,
    canonicalKeccak: hash,
    pinnedSourceVerified: true,
    compiledAbiMatches: true,
  });
}
const client = createPublicClient({ transport: http(net.rpcUrls[0]) });
if ((await client.getChainId()) !== handoff.chainId) throw Error("wrong chain");
const desk = handoff.contracts.find((c) => c.name === "LpDesk");
const modules = [];
for (const [kind, name] of [
  "LpGovernor",
  "PriceGuard",
  "VenueV3",
  "VenueV4",
].entries()) {
  const build = JSON.parse(
    fs.readFileSync(`test/scratch/forge-out/${name}.sol/${name}.json`),
  );
  const creationCode = build.bytecode.object;
  const hash = keccak256(creationCode);
  const expected = await client.readContract({
    address: desk.address,
    abi: parseAbi(["function codeHashOf(uint8) view returns (bytes32)"]),
    functionName: "codeHashOf",
    args: [kind],
  });
  if (hash !== expected) throw Error("Creation code mismatch " + name);
  fs.writeFileSync(
    `web/public/modules/${name}.json`,
    JSON.stringify({ creationCode }) + "\n",
  );
  modules.push({
    kind,
    name,
    creationCodeHash: hash,
    bytes: (creationCode.length - 2) / 2,
    matchesOnChain: true,
  });
}
fs.writeFileSync(
  "docs/validation/abi-and-modules.json",
  JSON.stringify(
    { sourceCommit: handoff.sourceCommit, abi: records, modules },
    null,
    2,
  ) + "\n",
);
console.log({ abis: records.length, modules: modules.length });
