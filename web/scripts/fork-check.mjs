// Local Anvil only: impersonated signers and all writes are isolated from the public network.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeDeployData,
  toHex,
  parseEther,
} from "viem";
import { chromium, expect } from "@playwright/test";
import { server } from "./serve.mjs";
const root = path.resolve(new URL("../..", import.meta.url).pathname);
process.chdir(root);
const h = JSON.parse(fs.readFileSync("web/handoff.json")),
  n = JSON.parse(fs.readFileSync("web/network.json")).network,
  launch = JSON.parse(fs.readFileSync("docs/validation/launch.json"));
const out = "test/scratch/fork";
fs.mkdirSync(out, { recursive: true });
const contracts = Object.fromEntries(h.contracts.map((c) => [c.name, c]));
const abi = (name) =>
  JSON.parse(fs.readFileSync(`web/public/abi/${name}.json`));
const forkUrl = n.rpcUrls[1];
const headResponse = await fetch(forkUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_blockNumber",
    params: [],
  }),
});
const forkBlock = BigInt((await headResponse.json()).result).toString();
const upstream = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const x of req) body += x;
    const json = JSON.parse(body);
    fs.appendFileSync(
      out + "/rpc-progress.log",
      JSON.stringify(
        Array.isArray(json) ? json.map((x) => x.method) : json.method,
      ) + "\n",
    );
    for (const q of Array.isArray(json) ? json : [json])
      if (
        !/^(eth_(get|call|chainId|blockNumber|feeHistory)|net_version|web3_clientVersion|anvil_nodeInfo)/.test(
          q.method,
        )
      )
        throw Error("Fork relay allows reads only");
    const reply = await fetch(forkUrl, {
      signal: AbortSignal.timeout(20000),
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    res.writeHead(reply.status, { "Content-Type": "application/json" });
    res.end(await reply.text());
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});
await new Promise((r) => upstream.listen(8546, "127.0.0.1", r));
const anvil = spawn(
  "anvil",
  [
    "--fork-url",
    "http://127.0.0.1:8546",
    "--fork-block-number",
    forkBlock,
    "--host",
    "127.0.0.1",
    "--fork-state-by-number",
    "--chain-id",
    String(h.chainId),
    "--port",
    "8545",
    "--accounts",
    "0",
    "--no-storage-caching",
    "--silent",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
anvil.stdout.on("data", (d) => {
  logs = (logs + d).slice(-3000);
});
anvil.stderr.on("data", (d) => {
  logs = (logs + d).slice(-3000);
});
const rpc = async (method, params = []) => {
  const r = await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw Object.assign(Error(j.error.message), j.error);
  return j.result;
};
let browser;
const results = [];
const report = (name, data = {}) => {
  results.push({ name, passed: true, ...data });
  console.log("PASS " + name);
};
let selected = launch.projectWallet;
try {
  anvil.on("error", (e) => {
    logs += String(e);
  });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    try {
      await rpc("eth_chainId");
      ready = true;
      break;
    } catch {
      if (anvil.exitCode !== null) throw Error(logs);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw Error("Local Anvil did not start: " + logs);
  console.log("Local fork listening");
  for (const a of [launch.projectWallet, launch.operator]) {
    await rpc("anvil_impersonateAccount", [a]);
    await rpc("anvil_setBalance", [a, toHex(parseEther("100"))]);
  }
  const client = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });
  const write = async (
    address,
    abi,
    functionName,
    args = [],
    account = selected,
  ) => {
    const wallet = createWalletClient({
      account,
      transport: http("http://127.0.0.1:8545"),
    });
    const hash = await wallet.writeContract({
      address,
      abi,
      functionName,
      args,
      chain: null,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw Error("Local transaction reverted: " + functionName);
    return receipt;
  };
  // Bootstrap the fork from the actual attested code, using only application-authorized local signers.
  for (const [kind, name] of [
    "LpGovernor",
    "PriceGuard",
    "VenueV3",
    "VenueV4",
  ].entries()) {
    if (
      !(await client.readContract({
        address: contracts.LpDesk.address,
        abi: abi("LpDesk"),
        functionName: "moduleDeployed",
        args: [kind],
      }))
    ) {
      const code = JSON.parse(
        fs.readFileSync(`web/public/modules/${name}.json`),
      ).creationCode;
      await write(contracts.LpDesk.address, abi("LpDesk"), "deployModule", [
        kind,
        code,
      ]);
    }
  }
  report("All four exact module bytecodes deployed on the live-chain fork");
  const desk = contracts.LpDesk.address,
    token = contracts.LaunchToken.address,
    vault = contracts.FirmVault.address,
    splitter = contracts.GenesisSplitter.address,
    guard = launch.modules[1].address,
    governor = launch.modules[0].address;
  if (
    !(await client.readContract({
      address: desk,
      abi: abi("LpDesk"),
      functionName: "registered",
    }))
  ) {
    await write(token, abi("LaunchToken"), "transfer", [
      splitter,
      parseEther("600000000"),
    ]);
    await write(
      launch.factory,
      parseAbi(["function setRequester(uint64,address)"]),
      "setRequester",
      [3232n, vault],
    );
    await write(guard, abi("PriceGuard"), "registerNotStock", [3232n]);
    await write(splitter, abi("GenesisSplitter"), "split");
  }
  report(
    "Actual factory setRequester, registerNotStock and exact genesis split work on the fork",
  );
  const actualBalance = await client.readContract({
    address: token,
    abi: abi("LaunchToken"),
    functionName: "balanceOf",
    args: [desk],
  });
  expect(actualBalance).toBe(parseEther("500000000"));
  const beforeVenues = await client.readContract({
    address: guard,
    abi: abi("PriceGuard"),
    functionName: "venues",
  });
  const weth = await client.readContract({
    address: guard,
    abi: abi("PriceGuard"),
    functionName: "WETH",
  });
  browser = await chromium.launch({
    executablePath: process.env.IMD_CHROMIUM,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://**", async (route) => {
    if (n.rpcUrls.some((u) => route.request().url().startsWith(u))) {
      const body = route.request().postDataJSON();
      const requests = Array.isArray(body) ? body : [body];
      const responses = await Promise.all(
        requests.map(async (q) => {
          try {
            return {
              jsonrpc: "2.0",
              id: q.id,
              result: await rpc(q.method, q.params),
            };
          } catch (e) {
            return {
              jsonrpc: "2.0",
              id: q.id,
              error: {
                code: e.code ?? -32000,
                message: e.message,
                data: e.data,
              },
            };
          }
        }),
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(body) ? responses : responses[0]),
      });
    } else await route.abort();
  });
  await page.exposeFunction("__localWallet", async (q) => {
    if (q.method === "eth_accounts" || q.method === "eth_requestAccounts")
      return [selected];
    if (q.method === "wallet_switchEthereumChain") return null;
    return rpc(q.method, q.params);
  });
  await page.addInitScript(() => {
    const listeners = {};
    const provider = {
      request: (q) => window.__localWallet(q),
      on: (name, fn) => (listeners[name] ??= []).push(fn),
      removeListener: (name, fn) =>
        (listeners[name] = (listeners[name] ?? []).filter((f) => f !== fn)),
    };
    window.ethereum = provider;
    window.forkWallet = {
      emit: (name, data) => (listeners[name] ?? []).forEach((f) => f(data)),
    };
  });
  await page.goto("http://127.0.0.1:4173/preview/#desk");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await expect(page.locator(".network-line")).toContainText("Block", {
    timeout: 60000,
  });
  await expect(
    page.getByRole("button", { name: "Open position", exact: true }),
  ).toHaveCount(0);
  report("Fork browser: non-operator cannot see operator actions");
  selected = launch.operator;
  await page.evaluate(
    (a) => window.forkWallet.emit("accountsChanged", [a]),
    selected,
  );
  await expect(
    page.getByRole("button", { name: "Open position", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const options = await page
    .getByLabel("Venue", { exact: true })
    .locator("option")
    .allTextContents();
  expect(options.length).toBe(beforeVenues.length);
  report("Venue picker exactly matches live PriceGuard.venues()", {
    venues: options.length,
  });
  await page
    .getByLabel("Price (IMD per NOTSTOCK)", { exact: true })
    .fill("0.0000025");
  await page
    .getByLabel("Range from (IMD per NOTSTOCK)", { exact: true })
    .fill("0.000003");
  await page
    .getByLabel("Range to (IMD per NOTSTOCK)", { exact: true })
    .fill("0.000006");
  await page
    .getByLabel("NOTSTOCK amount from LP Desk", { exact: true })
    .fill("10000");
  await expect(
    page.getByRole("button", { name: "Open position", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Open position", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review transaction" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 60000,
  });
  const count = await client.readContract({
    address: desk,
    abi: abi("LpDesk"),
    functionName: "positionCount",
  });
  expect(count).toBe(1n);
  await page.getByText("Manage position #0", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close position", exact: true }),
  ).toBeEnabled();
  report(
    "Fork browser: operator opens a real single-sided v4 position during bootstrap; Close active",
  );
  // A local fixture is only used as the additional governance venue, never in the delivered config.
  const fake = JSON.parse(
    fs.readFileSync("test/scratch/forge-out/Mocks.sol/FakeVenue.json"),
  );
  const wallet = createWalletClient({
    account: selected,
    transport: http("http://127.0.0.1:8545"),
  });
  const tx = await wallet.deployContract({
    abi: fake.abi,
    bytecode: fake.bytecode.object,
    args: [beforeVenues[1].factory, weth],
    chain: null,
  });
  const fixture = (await client.waitForTransactionReceipt({ hash: tx }))
    .contractAddress;
  await write(
    token,
    abi("LaunchToken"),
    "approve",
    [governor, parseEther("1000000")],
    selected,
  );
  await write(
    governor,
    abi("LpGovernor"),
    "stake",
    [parseEther("1000000")],
    selected,
  );
  await rpc("evm_mine");
  const id = await client.readContract({
    address: governor,
    abi: abi("LpGovernor"),
    functionName: "proposalCount",
  });
  await write(
    governor,
    abi("LpGovernor"),
    "proposeAddVenue",
    [fixture, 1],
    selected,
  );
  await write(governor, abi("LpGovernor"), "vote", [id, true], selected);
  await rpc("evm_increaseTime", [5 * 86400 + 1]);
  await rpc("evm_mine");
  await write(governor, abi("LpGovernor"), "execute", [id], selected);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByLabel("Venue", { exact: true }).locator("option"),
  ).toHaveCount(beforeVenues.length + 1, { timeout: 60000 });
  report(
    "Executed AddVenue on the fork appears in the picker without a site change",
    { addedVenue: fixture },
  );
  await rpc("evm_increaseTime", [3 * 86400]);
  await rpc("evm_mine");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open position", exact: true }),
  ).toBeDisabled({ timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Close position", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Close position", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review transaction" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 60000,
  });
  expect(
    (
      await client.readContract({
        address: desk,
        abi: abi("LpDesk"),
        functionName: "getPosition",
        args: [0n],
      })
    ).open,
  ).toBe(false);
  report(
    "Fork browser: bootstrap expiry disables Open; Close succeeds after expiry",
  );
  await page.screenshot({
    path: path.join(out, "completed.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  report("No JavaScript errors in fork browser");
} catch (e) {
  console.error(e);
  results.push({
    name: "Fork validation failure",
    passed: false,
    error: String(e),
    anvil: logs,
  });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "docs/validation/fork.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        sourceBlock: forkBlock,
        liveTransactionsBroadcast: false,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  if (browser) await browser.close();
  anvil.kill("SIGTERM");
  upstream.closeAllConnections();
  upstream.close();
  server.close();
}
