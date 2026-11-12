import { server } from "./serve.mjs";
import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: process.env.IMD_CHROMIUM,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("requestfailed", (r) =>
  console.log("REQUEST FAILED", r.url(), r.failure()),
);
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text());
});
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:4173/preview/");
await page.getByRole("heading", { name: "Not Firm", exact: true }).waitFor();
await page.waitForTimeout(15000);
fs.mkdirSync("test/scratch/shots", { recursive: true });
await page.screenshot({
  path: "test/scratch/shots/home-live-390.png",
  fullPage: true,
});
console.log(await page.locator("body").innerText());
console.log({
  errors,
  overflow: await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  ),
});
await browser.close();
server.close();
