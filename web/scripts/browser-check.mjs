import { server } from "./serve.mjs";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { mockChain, network } from "../tests/mock-chain.mjs";
const root = path.resolve(new URL("../..", import.meta.url).pathname),
  out = path.join(root, "test/scratch/browser-check");
fs.mkdirSync(out, { recursive: true });
const executable = process.env.IMD_CHROMIUM;
const browser = await chromium.launch({
  executablePath: executable,
  headless: true,
});
const results = [],
  errors = [];
let page, context, mock;
const record = (name, detail = {}) => {
  results.push({ name, passed: true, ...detail });
  console.log("PASS " + name);
};
async function start(options = {}, viewport = { width: 1440, height: 1000 }) {
  if (context) await context.close();
  mock = mockChain(options);
  context = await browser.newContext({
    viewport,
    ...(options.mobile
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
        }
      : {}),
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await mock.install(page);
  await page.goto("http://127.0.0.1:4173/preview/");
  await expect(
    page.getByRole("heading", { name: "Not Firm", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".network-line")).toContainText("Block", {
    timeout: 15000,
  });
  await expect(page.getByText("Source blocks", { exact: true })).toBeVisible({
    timeout: 15000,
  });
}
async function connect() {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test browser wallet", exact: true })
    .click();
  await expect(page.locator(".wallet-control")).toContainText(
    /Disconnect|Switch to/,
    {
      timeout: 10000,
    },
  );
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".network-line")).toContainText("Block");
}
async function send(label) {
  const before = mock.state.sent.length;
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review transaction" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(() => mock.state.sent.length).toBe(before + 1);
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 15000,
  });
}
async function overflow(label) {
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
  record(label, width);
}
try {
  await start();
  await expect(
    page.getByRole("button", { name: "Get quote", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Distribute IMD", exact: true }),
  ).toBeDisabled();
  const requests = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((x) => ({ name: x.name, type: x.initiatorType })),
  );
  expect(
    requests.filter(
      (r) =>
        /script|css|iframe/.test(r.type) &&
        !r.name.startsWith("http://127.0.0.1"),
    ),
  ).toEqual([]);
  record("Disconnected reads and no external script/font/frame before Connect");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await overflow(`Home no horizontal overflow at ${width}`);
    await page.screenshot({
      path: path.join(out, `home-${width}.png`),
      fullPage: true,
    });
    if (width === 390) {
      const buy = await page.locator(".intro .buy-link").boundingBox(),
        wallet = await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .boundingBox();
      expect(buy.y + buy.height).toBeLessThan(844);
      expect(wallet.y + wallet.height).toBeLessThan(844);
      record("Product and ETH buy action visible on first 390 screen");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Connect a wallet" }),
  ).toBeVisible();
  await overflow("Wallet sheet no overflow at 390");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeFocused();
  record("Native wallet dialog Escape and focus restoration");
  mock.state.reject = true;
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Test browser wallet" }).click();
  await expect(page.getByRole("dialog")).toContainText("Request declined");
  mock.state.reject = false;
  await page.getByRole("button", { name: "Test browser wallet" }).click();
  await expect(page.locator(".wallet-control")).toContainText("Disconnect");
  record("Wallet rejection is recoverable");
  await page.getByRole("link", { name: "Burn", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Burn NOTSTOCK", exact: true }),
  ).toBeVisible();
  await page.getByLabel("NOTSTOCK amount", { exact: true }).fill("1001");
  await expect(
    page
      .getByText("This amount exceeds your NOTSTOCK balance.", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deposit NOTSTOCK", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Max", exact: true }).click();
  await expect(page.getByLabel("NOTSTOCK amount", { exact: true })).toHaveValue(
    "1000",
  );
  await page.getByLabel("NOTSTOCK amount", { exact: true }).fill("10");
  await send("Deposit NOTSTOCK");
  expect(mock.state.sent.at(-1).fn).toBe("transfer");
  expect(mock.state.sent.at(-1).args[1]).toBe(10n * 10n ** 18n);
  record("Burner deposit, Max and over-balance guard");
  await send("Burn");
  expect(mock.state.sent.at(-1).fn).toBe("burn");
  expect(mock.state.burnBalance).toBe(0n);
  await overflow("Burn no overflow at 390");
  await page.screenshot({
    path: path.join(out, "burn-390.png"),
    fullPage: true,
  });
  record("Permissionless Burner burn and receipt refresh");
  await page.getByRole("link", { name: "LP Desk", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open position", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Close position", exact: true }),
  ).toHaveCount(0);
  record("Non-operator has no operator controls");
  await page.getByLabel("Amount to stake", { exact: true }).fill("10");
  await send("Approve staking");
  await send("Stake NOTSTOCK");
  expect(mock.state.stake).toBe(110n * 10n ** 18n);
  await page.getByRole("button", { name: "Unstake", exact: true }).click();
  await page.getByLabel("Amount to unstake", { exact: true }).fill("5");
  await send("Unstake NOTSTOCK");
  expect(mock.state.stake).toBe(105n * 10n ** 18n);
  record("Exact staking approval, stake and unstake");
  await page.getByRole("button", { name: "Vote for", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect.poll(() => mock.state.sent.at(-1)?.fn).toBe("vote");
  record("Proposal vote uses connected wallet");
  const expired = page.locator(".proposal").filter({ hasText: "Expired" });
  await expect(
    expired.getByRole("button", { name: "Execute proposal" }),
  ).toHaveCount(0);
  record("Expired proposal has no execute action");
  await page.waitForTimeout(400);
  await send("Execute proposal");
  await expect(
    page.locator(`.data-row a[href$="${mock.addresses.factory}"]`),
  ).toBeVisible();
  record("Executed AddVenue updates live venue list");
  await overflow("LP Desk no overflow at 390");
  await page.screenshot({
    path: path.join(out, "desk-390.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByLabel("You pay IMD", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1. Approve IMD", exact: true }),
  ).toBeVisible();
  await send("1. Approve IMD");
  await expect(
    page.getByRole("button", { name: "2. Approve router", exact: true }),
  ).toBeVisible();
  await send("2. Approve router");
  await expect(
    page.getByRole("button", { name: "Swap tokens", exact: true }),
  ).toBeEnabled();
  await send("Swap tokens");
  expect(mock.state.sent.at(-1).name).toBe("router");
  expect(mock.state.sent.at(-1).tx.value ?? "0x0").toBe("0x0");
  record("IMD approval, Permit2 approval and simulated router swap");
  await start({ chainId: 1, unknownChain: true });
  await connect();
  expect(mock.state.requests).toContain("wallet_addEthereumChain");
  expect(mock.state.addedChain).toEqual(network.walletAddChain);
  record("Unknown chain adds exact walletAddChain and retries switch");
  await start({ chainId: 1, switchReject: true });
  await connect();
  await expect(
    page.getByText("Wrong network.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Distribute IMD", exact: true }),
  ).toBeDisabled();
  mock.state.switchReject = false;
  await page
    .getByRole("button", { name: "Switch to Robinhood Chain", exact: true })
    .click();
  await expect(page.getByText("Wrong network.", { exact: false })).toHaveCount(
    0,
  );
  record("Rejected chain switch keeps writes disabled and can be retried");
  await start({ bridgeMode: true });
  await connect();
  await page.getByRole("link", { name: "LP Desk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bridge 0", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Execute proposal", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("LayerZero fee");
  await expect(page.getByRole("dialog")).toContainText("0.001 ETH");
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect.poll(() => mock.state.sent.length).toBe(1);
  expect(BigInt(mock.state.sent[0].tx.value)).toBe(1000000000000000n);
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  record(
    "BridgeOut quotes LayerZero fee, displays it before signing and sends exact native value",
  );
  await start({ account: mock.state.operator });
  await connect();
  await page.getByRole("link", { name: "LP Desk", exact: true }).click();
  await page
    .getByLabel("NOTSTOCK amount from LP Desk", { exact: true })
    .fill("100");
  await expect(
    page.getByRole("button", { name: "Open position", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("99.5% of the preview.", { exact: false }).first(),
  ).toBeVisible();
  await page.getByText("Manage position #0", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close position", exact: true }),
  ).toBeEnabled();
  await send("Open position");
  await send("Collect fees");
  record("Operator Open during bootstrap and Collect");
  mock.state.revert = { fn: "close", error: "BelowMinOut" };
  await page
    .getByRole("button", { name: "Close position", exact: true })
    .click();
  await expect(
    page.getByText(
      "The output is below your minimum. Refresh the quote or revise slippage.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  mock.state.revert = null;
  record("Custom revert is explained before signing");
  await send("Close position");
  record("Operator Close during bootstrap");
  mock.state.afterBootstrap = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open position", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Close position", exact: true }),
  ).toBeEnabled();
  record("Bootstrap expiry disables Open while Close stays active");
  await page.setViewportSize({ width: 320, height: 844 });
  await overflow("Operator controls no overflow at 320");
  await page.screenshot({
    path: path.join(out, "operator-320.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: path.join(out, "operator-1440.png"),
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page }).analyze();
  fs.writeFileSync(
    path.join(out, "axe.json"),
    JSON.stringify(axe.violations, null, 2),
  );
  expect(
    axe.violations.filter((x) => ["critical", "serious"].includes(x.impact)),
  ).toEqual([]);
  record("Axe accessibility: no serious or critical violations", {
    violations: axe.violations.length,
  });
  await start({
    modules: [false, false, false, false],
    registered: false,
    splitDone: false,
    feeReady: false,
    stockBalance: 600000000n * 10n ** 18n,
  });
  await connect();
  await page.getByRole("link", { name: "LP Desk", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fund GenesisSplitter", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Register", exact: true }),
  ).toBeDisabled();
  await send("Deploy LpGovernor");
  expect(mock.state.sent.at(-1).fn).toBe("deployModule");
  expect(mock.state.sent.at(-1).args[1].length).toBeGreaterThan(20000);
  record(
    "Setup deployment uses embedded creation code; funding/register prerequisites enforced",
  );
  for (const name of ["PriceGuard", "VenueV3", "VenueV4"])
    await send(`Deploy ${name}`);
  await send("Fund GenesisSplitter");
  expect(mock.state.splitBalance).toBe(600000000n * 10n ** 18n);
  await expect(
    page.getByRole("button", { name: "Fund GenesisSplitter", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Register", exact: true }),
  ).toBeDisabled();
  await send("Set FirmVault recipient");
  expect(mock.state.sent.at(-1).args[0]).toBe(3232n);
  await send("Register");
  expect(mock.state.sent.at(-1).args[0]).toBe(3232n);
  await send("Split");
  await expect(
    page.getByText("Genesis setup complete.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Split", exact: true }),
  ).toHaveCount(0);
  record(
    "Full setup order, exact 600m funding, fixed launch number and completed-action hiding",
  );
  await start({ noWallet: true, mobile: true }, { width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"]) {
    const link = page.getByRole("link", {
      name: `Open in ${name}`,
      exact: true,
    });
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toContain(
      name === "MetaMask" ? "127.0.0.1:4173" : "127.0.0.1%3A4173",
    );
  }
  await expect(
    page.getByRole("button", { name: "Coinbase Smart Wallet", exact: true }),
  ).toBeVisible();
  await overflow("Mobile wallet deep links have no horizontal overflow");
  record(
    "Missing mobile wallet offers all four wallet browsers and Coinbase Smart Wallet",
  );
  expect(errors).toEqual([]);
  record("No browser JavaScript errors across interactions");
} catch (e) {
  results.push({
    name: "Browser interaction failure",
    passed: false,
    error: String(e),
  });
  console.error(e.message?.slice(0, 2500));
  if (page) {
    console.error((await page.locator("body").innerText()).slice(0, 7000));
    await page.screenshot({
      path: path.join(out, "failure.png"),
      fullPage: true,
    });
  }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  server.close();
}
