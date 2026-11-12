import { server } from "./serve.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
const network = JSON.parse(fs.readFileSync("web/network.json")).network;
const browser = await chromium.launch({
  executablePath: process.env.IMD_CHROMIUM,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [],
  rpcErrors = [];
page.on("pageerror", (e) => errors.push(e.message));
let requests = 0;
await page.route("https://**", async (route) => {
  if (network.rpcUrls.some((url) => route.request().url().startsWith(url))) {
    requests++;
    try {
      const body = route.request().postDataJSON();
      for (const call of Array.isArray(body) ? body : [body])
        if (
          ![
            "eth_chainId",
            "eth_call",
            "eth_getCode",
            "eth_getBlockByNumber",
            "eth_blockNumber",
            "eth_getLogs",
          ].includes(call.method)
        )
          throw Error("Read-only validation refused " + call.method);
      const r = await fetch(route.request().url(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await route.fulfill({
        status: r.status,
        contentType: "application/json",
        body: await r.text(),
      });
    } catch (e) {
      rpcErrors.push(String(e));
      await route.abort();
    }
  } else await route.abort();
});
try {
  await page.goto("http://127.0.0.1:4173/preview/");
  await expect(page.locator(".network-line")).toContainText("Block", {
    timeout: 60000,
  });
  await expect(page.getByText("Source blocks", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.screenshot({
    path: "test/scratch/shots/live-relayed-390.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "LP Desk", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Deploy LpGovernor", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test/scratch/shots/live-setup-390.png",
    fullPage: true,
  });
  console.log(await page.locator("body").innerText());
  console.log({ requests, errors, rpcErrors });
  fs.writeFileSync(
    "docs/validation/live-browser.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        readOnly: true,
        nodeTransportBridge: true,
        requests,
        errors,
        rpcErrors,
        state:
          "Live setup read and rendered; module deploy buttons present, disabled without wallet.",
      },
      null,
      2,
    ) + "\n",
  );
} catch (e) {
  console.error(e);
  console.error(await page.locator("body").innerText());
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
