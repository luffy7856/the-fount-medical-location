/* Console screenshots of the built Toss bundle (toss/dist) in a phone viewport.
   The API is answered from a fixtures file: { "analyze": <LocationAnalysis JSON>, "ai": <AiInterpretation JSON> }
   (capture both from the live site for a real address; see README). Map tiles load from OpenFreeMap, so run this on
   a machine that can reach tiles.openfreemap.org. Usage: node shots.mjs <fixtures.json> <outDir> [port] [address] [specialty] */
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");   // preinstalled globally (NODE_PATH)

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
const fx = JSON.parse(readFileSync(path.resolve(process.argv[2] || path.join(here, "fixtures.json")), "utf8"));
const out = path.resolve(process.argv[3] || path.join(here, "shots"));
const port = Number(process.argv[4] || 8993);
const address = process.argv[5] || fx.analyze.location.displayName.split(",")[0];
mkdirSync(out, { recursive: true });
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const file = path.join(dist, url.pathname === "/" ? "index.html" : url.pathname);
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
}).listen(port);

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function phone(viewport, scale) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul",
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 TossApp" });
  await context.route("https://www.thefount.co.kr/location/api/**", async (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop();
    const body = name === "analyze" ? fx.analyze : name === "ai-insight" ? fx.ai : name === "living-population" ? (fx.living || fx.analyze.livingPopulation || { status: "unsupported" }) : null;
    await new Promise((ok) => setTimeout(ok, 300));
    r.fulfill(body ? { contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) } : { status: 404, body: "" });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(`http://localhost:${port}/`);
  return { context, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(out, name) }).then(() => console.log(name));
const settle = (page, ms = 1500) => page.waitForTimeout(ms);
async function analyze(page) {
  await page.fill('input[aria-label="분석할 주소"]', address);
  await page.selectOption('select[aria-label="진료과 선택"]', fx.analyze.specialty);
  await page.selectOption('select[aria-label="주변 범위 선택"]', String(fx.analyze.radiusMeters));
  await page.click("button.analyze-button");
  await page.waitForSelector(".loading-mask", { state: "detached", timeout: 30000 }).catch(() => {});
  await settle(page, 3500);   // flyTo + tiles
}
const scrollPanel = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el) return false;
  el.scrollIntoView({ block: "start" }); window.scrollBy(0, -64); return true;
}, selector);

/* portrait 636×1048 (CSS 424×699 at 1.5x; crop to 1048) */
{
  const { context, page } = await phone({ width: 424, height: 699 }, 1.5);
  await settle(page, 2500); await shot(page, "p1-start.png");
  await analyze(page);
  await page.evaluate(() => window.scrollTo(0, 0)); await settle(page); await shot(page, "p2-map.png");
  await scrollPanel(page, ".panel-tabs"); await settle(page, 800); await shot(page, "p3-summary.png");
  await scrollPanel(page, ".decision-evidence, .ai-insight, .stats-grid"); await settle(page, 800); await shot(page, "p4-evidence.png");
  await page.click('.panel-tabs button:has-text("수익성")'); await settle(page, 900); await shot(page, "p5-profitability.png");
  await page.click('.panel-tabs button:has-text("3년전망")'); await settle(page, 900); await shot(page, "p6-forecast.png");
  await context.close();
}
/* landscape 1504×741 (CSS 752×371 at 2x; crop to 741) */
{
  const { context, page } = await phone({ width: 752, height: 371 }, 2);
  await analyze(page);
  await shot(page, "l1-map.png");
  await context.close();
}
await browser.close(); server.close();
