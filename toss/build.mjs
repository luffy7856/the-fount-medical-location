/* Builds toss/dist for the 앱인토스 bundle: an esbuild SPA of the website's location screen (entry.tsx).
   The website build (next build) is untouched; this only reads src/. Run from toss/: `npm run build` → thefount-location.ait
   - globals.css goes through Tailwind/PostCSS like in Next (root tailwind.config.ts / postcss.config.mjs).
   - next/dynamic, next/image and ./base-layer are swapped for the stand-ins in stubs/ (each file says why). */
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync, statSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(here, "dist");
const rootRequire = createRequire(path.join(root, "package.json"));
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const stubs = {
  "next/dynamic": path.join(here, "stubs/next-dynamic.tsx"),
  "next/image": path.join(here, "stubs/next-image.tsx"),
  "./base-layer": path.join(here, "stubs/base-layer.tsx"),
};
const tossPlugin = { name: "toss", setup(b) {
  b.onResolve({ filter: /^(next\/dynamic|next\/image|\.\/base-layer)$/ }, (args) => ({ path: stubs[args.path] }));
  // one copy of react / leaflet for the whole bundle (maplibre-gl-leaflet lives in toss/node_modules)
  b.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|leaflet|react-leaflet)$/ }, (args) => ({ path: rootRequire.resolve(args.path) }));
  b.onLoad({ filter: /src[\\/]app[\\/]globals\.css$/ }, async (args) => {
    const postcss = rootRequire("postcss");
    const tailwind = rootRequire("tailwindcss");
    const autoprefixer = rootRequire("autoprefixer");
    const config = (await import(pathToFileURL(path.join(root, "tailwind.config.ts")).href).catch(() => null))?.default
      || { content: [path.join(root, "src/**/*.{js,ts,jsx,tsx,mdx}")], theme: { extend: {} }, plugins: [] };
    config.content = [path.join(root, "src/**/*.{js,ts,jsx,tsx,mdx}"), path.join(here, "*.tsx"), path.join(here, "stubs/*.tsx")];
    const result = await postcss([tailwind(config), autoprefixer]).process(readFileSync(args.path, "utf8"), { from: args.path });
    return { contents: result.css, loader: "css", resolveDir: path.dirname(args.path) };
  });
} };

await build({
  entryPoints: { app: path.join(here, "entry.tsx") },
  outdir: dist,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "chrome87", "safari15"],
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  nodePaths: [path.join(root, "node_modules"), path.join(here, "node_modules")],
  plugins: [tossPlugin],
  loader: { ".png": "dataurl", ".svg": "dataurl" },
  define: {
    "process.env.NEXT_PUBLIC_TOSS_BUILD": '"1"',
    "process.env.NODE_ENV": '"production"',
    "process.env": "{}",
  },
  external: ["https://fonts.googleapis.com/*"],
  legalComments: "none",
  logLevel: "warning",
});

const version = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
writeFileSync(path.join(dist, "index.html"), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>병원 입지분석</title>
<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin>
<link rel="stylesheet" href="./app.css?v=${version}">
</head>
<body>
<div id="root"></div>
<script src="./app.js?v=${version}"></script>
</body>
</html>
`);
for (const f of readdirSync(dist)) console.log(`toss/dist/${f}`, (statSync(path.join(dist, f)).size / 1024).toFixed(0) + " KB");
