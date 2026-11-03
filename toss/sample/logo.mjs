/* Renders toss/logo.html to a 600×600 PNG: node logo.mjs <out.png> */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
await page.goto(new URL("../logo.html", import.meta.url).href);
await page.locator("#s").screenshot({ path: process.argv[2] || fileURLToPath(new URL("../logo-600.png", import.meta.url)), omitBackground: false });
await browser.close();
