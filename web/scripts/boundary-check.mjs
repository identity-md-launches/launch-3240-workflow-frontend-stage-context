import { server } from "./serve.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { mockChain } from "../tests/mock-chain.mjs";
const browser = await chromium.launch({
  executablePath: process.env.IMD_CHROMIUM,
  headless: true,
});
const results = [],
  errors = [];
const pass = (name) => {
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
let page;
try {
  page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  const mock = mockChain({
    stockBalance: (1n << 256n) - 1n,
    imdBalance: (1n << 256n) - 1n,
  });
  await mock.install(page);
  await page.goto("http://127.0.0.1:4173/preview/");
  await expect(page.locator(".network-line")).toContainText("Block", {
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test browser wallet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".wallet-control")).toContainText("Disconnect");
  await expect(
    page.getByText("Balance:", { exact: false }).first(),
  ).toContainText(
    "115792089237316195423570985008687907853269984665640564039457",
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  pass(
    "Maximum uint256 wallet balances wrap at 320 and 390 without horizontal overflow",
  );
  await page
    .getByRole("button", { name: "Distribute IMD", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Split undistributed IMD equally",
  );
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 15000,
  });
  expect(mock.state.sent.at(-1).fn).toBe("distribute");
  pass(
    "Permissionless FirmVault distribution is previewed and signed by the visitor",
  );
  await page.getByRole("link", { name: "Burn", exact: true }).click();
  await page.getByRole("button", { name: "Burn", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const before = mock.state.sent.length;
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(mock.state.sent.length).toBe(before);
  pass("Cancelling transaction review sends no wallet transaction");
  await page.getByRole("button", { name: "Burn", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  mock.state.reject = true;
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(
    page.getByText("Request declined in your wallet. You can try again.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(mock.state.sent.length).toBe(before);
  pass("Wallet transaction rejection is explained and sends nothing");
  mock.state.reject = false;
  mock.state.account = mock.state.operator;
  await page.evaluate(
    (address) => window.mockWallet.emit("accountsChanged", [address]),
    mock.state.account,
  );
  await page.getByRole("link", { name: "LP Desk", exact: true }).click();
  await expect(
    page.getByLabel("Price (IMD per NOTSTOCK)", { exact: true }),
  ).toHaveValue("1");
  await page
    .getByLabel("Price (IMD per NOTSTOCK)", { exact: true })
    .fill("1.002");
  await page
    .getByLabel("Range from (IMD per NOTSTOCK)", { exact: true })
    .fill("0.8");
  mock.state.poolSqrt = (2n ** 96n * 11n) / 10n;
  mock.state.block++;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.locator(".open-form").getByText("0.8264463 IMD per NOTSTOCK", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Price (IMD per NOTSTOCK)", { exact: true }),
  ).toHaveValue("1.002");
  await expect(
    page.getByLabel("Range from (IMD per NOTSTOCK)", { exact: true }),
  ).toHaveValue("0.8");
  pass(
    "Operator pool quote refreshes on new blocks without overwriting manual price or range",
  );
  await page.close();
  page = await browser.newPage();
  await page.route("**/abi/LaunchToken.json", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.goto("http://127.0.0.1:4173/preview/");
  await expect(page.getByRole("alert")).toContainText(
    "ABI integrity check failed",
    { timeout: 15000 },
  );
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toHaveCount(0);
  pass("Tampered implementation ABI fails closed before actions are shown");
  expect(errors).toEqual([]);
} catch (e) {
  results.push({
    name: "Boundary check failure",
    passed: false,
    error: String(e),
  });
  console.error(e);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    new URL("../../docs/validation/boundaries.json", import.meta.url),
    JSON.stringify({ results, errors }, null, 2) + "\n",
  );
  await browser.close();
  server.close();
}
