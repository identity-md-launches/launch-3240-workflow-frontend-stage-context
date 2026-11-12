import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  decodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toBytes,
  type Address,
  type Abi,
  encodeEventTopics,
  encodeAbiParameters,
} from "viem";
import {
  sqrtTick,
  tickAtSqrt,
  sqrtPrice,
  Q96,
  parseAmount,
  checkAmount,
  positionPreview,
  minimum,
  tickRange,
} from "../src/math";
import { swapCall } from "../src/swap";
import {
  switchChain,
  canonical,
  type Config,
  type Deployment,
  type Provider,
} from "../src/config";
import { explain, meanings } from "../src/errors";
import { history, type Snapshot } from "../src/chain";
import { protocol } from "../src/config";
const h = JSON.parse(
  fs.readFileSync(new URL("../handoff.json", import.meta.url), "utf8"),
);
const n = JSON.parse(
  fs.readFileSync(new URL("../network.json", import.meta.url), "utf8"),
);
const deployment = { ...h, ...n } as Deployment;
const c = { deployment } as Config;
test("pinned application ABI hashes use canonical Keccak", () => {
  for (const x of h.contracts) {
    const abi = JSON.parse(
      fs.readFileSync(
        new URL(`../public/abi/${x.name}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(keccak256(toBytes(canonical(abi))).slice(2), x.abiHash);
  }
});
test("decimal amounts reject rounding, signs, exponents and balance excess", () => {
  assert.equal(parseAmount("1.234567", 6), 1234567n);
  for (const s of ["1e4", "-1", "0", "0.0000001", "NaN"])
    assert.throws(() => parseAmount(s, 6));
  assert.match(checkAmount("1001", 18, 1000n * 10n ** 18n, "IMD"), /exceeds/);
});
test("tick math preserves pinned minimum, zero and maximum ratios", () => {
  assert.equal(sqrtTick(0), Q96);
  assert.equal(sqrtTick(-887272), 4295128739n);
  assert.equal(
    sqrtTick(887272),
    1461446703485210103287273052203988822378723970342n,
  );
  for (const t of [-887270, -500000, -120, -1, 0, 1, 60, 200000, 887270])
    assert.equal(tickAtSqrt(sqrtTick(t)), t);
});
test("price respects token order and asset decimals", () => {
  assert.equal(sqrtPrice("1", true, 18), Q96);
  assert.equal(sqrtPrice("1", false, 18), Q96);
  assert.equal(sqrtPrice("1", true, 6), Q96 / 1000000n);
  assert.equal(sqrtPrice("1", false, 6), Q96 * 1000000n);
  const range = tickRange("0.5", "2", false, 18, 60);
  assert.ok(range[0] < 0 && range[1] > 0);
  assert.ok(range[0] % 60 === 0);
});
test("position preview enforces 99.5% minimums and single-sided denomination", () => {
  const both = positionPreview(Q96, -600, 600, 10n ** 18n, true);
  assert.ok(both.amount0 > 0n && both.amount1 > 0n);
  assert.equal(both.min0, (both.amount0 * 995n) / 1000n);
  assert.equal(both.min1, (both.amount1 * 995n) / 1000n);
  const assetOnly = positionPreview(Q96, -600, -60, 10n ** 18n, true);
  assert.equal(assetOnly.assetOnly, true);
  assert.equal(assetOnly.amount0, 0n);
  assert.equal(minimum(1000n, "0.5"), 995n);
  assert.throws(() => minimum(1n, "100"));
});
test("Robinhood swap uses exact attested key and six-field extended tuple", () => {
  const input = deployment.network.pairToken.address;
  const call = swapCall(c, input, 100n, 1000n, "0.5", 100n);
  assert.equal(call.address, deployment.network.uniswapV4.universalRouter);
  assert.equal(call.value, 0n);
  assert.equal(call.args[0], "0x10");
  const inputs = call.args[1] as `0x${string}`[];
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    inputs[0],
  );
  assert.equal(actions, "0x060c0f");
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),bool,uint128,uint128,uint256,bytes)",
    ),
    params[0],
  );
  assert.equal(
    swap[0].hooks.toLowerCase(),
    deployment.poolKey.hooks.toLowerCase(),
  );
  assert.equal(swap[3], 995n);
  assert.equal(swap[4], 0n);
  assert.equal(swap[5], "0x");
  assert.deepEqual(
    decodeAbiParameters(parseAbiParameters("address,uint256"), params[1]).map(
      (x) => String(x).toLowerCase(),
    ),
    [input, 100n].map((x) => String(x).toLowerCase()),
  );
});
test("unknown chain adds exact handoff parameters then switches again", async () => {
  const requests: any[] = [];
  let switched = false;
  const p = {
    request: async (x: any) => {
      requests.push(x);
      if (x.method === "wallet_switchEthereumChain" && !switched) {
        switched = true;
        throw { code: 4902 };
      }
      if (x.method === "eth_chainId") return n.walletAddChain.chainId;
    },
  } as Provider;
  await switchChain(p, deployment);
  assert.deepEqual(
    requests.map((x) => x.method),
    [
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
      "eth_chainId",
    ],
  );
  assert.deepEqual(requests[1].params, [n.walletAddChain]);
});
test("wallet rejection never triggers chain addition", async () => {
  const requests: string[] = [];
  const p = {
    request: async (x: any) => {
      requests.push(x.method);
      throw { code: 4001 };
    },
  } as Provider;
  await assert.rejects(switchChain(p, deployment));
  assert.deepEqual(requests, ["wallet_switchEthereumChain"]);
  assert.match(explain({ code: 4001 }), /declined/);
});
test("all implementation custom errors have a plain-language translation", () => {
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
    const abi = JSON.parse(
      fs.readFileSync(
        new URL(`../public/abi/${name}.json`, import.meta.url),
        "utf8",
      ),
    ) as Abi;
    for (const item of abi)
      if (item.type === "error")
        assert.ok(meanings[item.name], `${name}.${item.name}`);
  }
});
test("weekly dead balance change uses exact transfer events without archived state", async () => {
  const stock = h.contracts.find((x: any) => x.name === "LaunchToken").address;
  const desk = h.contracts.find((x: any) => x.name === "LpDesk").address;
  const dead = "0x000000000000000000000000000000000000dEaD";
  const transfers = [
    [desk, dead, 100n],
    [dead, desk, 5n],
    [desk, desk, 30n],
  ] as const;
  const snapshot: Pick<Snapshot, "block" | "timestamp" | "dead"> = {
    block: 112566380n,
    timestamp: 2000000000n,
    dead,
  };
  const config = {
    ...c,
    abis: {},
    client: {
      getBlock: async () => ({ timestamp: snapshot.timestamp }),
      getLogs: async () =>
        transfers.map(([from, to, value]) => ({
          address: stock,
          blockNumber: snapshot.block,
          topics: encodeEventTopics({
            abi: protocol.erc20,
            eventName: "Transfer",
            args: { from, to },
          }),
          data: encodeAbiParameters(parseAbiParameters("uint256"), [value]),
        })),
      readContract: async () => {
        throw Error("Archived state must not be required");
      },
    },
  } as unknown as Config;
  const report = await history(config, snapshot, () => {});
  assert.equal(report.burnChange, 95n);
  assert.equal(report.logs, 3);
});
