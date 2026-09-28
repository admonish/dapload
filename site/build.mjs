// Builds the website into dist/. No dependencies, just Node.
//
//   node site/build.mjs
//
// 1. Copies site/ into dist/, and the current app from public/ into
//    dist/demo/app/, so the demo always runs the app as it is in this commit.
// 2. Inlines site.css into both pages, so the first paint needs no extra
//    request.
// 3. Adds ?v=<content hash> to every CSS/JS URL. vercel.json caches URLs
//    with ?v for a year; a changed file gets a new URL, so a deploy shows
//    up immediately. HTML itself is never cached long.
//
// Every replacement is checked, so if a page's markup changes and a
// reference no longer matches, the build fails instead of silently
// shipping an unversioned file.
import { createHash } from "node:crypto";
import { cpSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const d = (p) => join(dist, p);

rmSync(dist, { recursive: true, force: true });
cpSync(join(root, "site"), dist, { recursive: true });
for (const f of ["README.md", "build.mjs", "og"]) rmSync(d(f), { recursive: true, force: true }); // og/ is the image source
mkdirSync(d("demo/app"), { recursive: true });
for (const f of ["index.html", "app.css", "app.js"]) cpSync(join(root, "public", f), d(`demo/app/${f}`));

const version = (p) => createHash("sha256").update(readFileSync(d(p))).digest("hex").slice(0, 10);

function rewrite(page, replacements) {
  let html = readFileSync(d(page), "utf8");
  for (const [from, to] of replacements) {
    if (!html.includes(from)) throw new Error(`${page}: expected to find ${from}`);
    html = html.replace(from, to);
  }
  writeFileSync(d(page), html);
}

const css = `<style>\n${readFileSync(d("site.css"), "utf8")}</style>`;
const v = {
  site: version("site.js"),
  host: version("demo/demo-host.js"),
  mock: version("demo/mock-backend.js"),
  appCss: version("demo/app/app.css"),
  appJs: version("demo/app/app.js"),
};

rewrite("index.html", [
  ['<link rel="stylesheet" href="site.css">', css],
  ['src="demo/demo-host.js"', `src="demo/demo-host.js?v=${v.host}"`],
  ['src="site.js"', `src="site.js?v=${v.site}"`],
  ['data-mock-src="demo/mock-backend.js"', `data-mock-src="demo/mock-backend.js?v=${v.mock}"`],
]);
rewrite("demo/index.html", [
  ['<link rel="stylesheet" href="../site.css">', css],
  ['src="demo-host.js"', `src="demo-host.js?v=${v.host}"`],
  ['src="../site.js"', `src="../site.js?v=${v.site}"`],
  ['data-mock-src="mock-backend.js"', `data-mock-src="mock-backend.js?v=${v.mock}"`],
]);
// Only the dist copy is touched; public/index.html stays as it is.
rewrite("demo/app/index.html", [
  ['href="app.css"', `href="app.css?v=${v.appCss}"`],
  ['src="app.js"', `src="app.js?v=${v.appJs}"`],
]);

rmSync(d("site.css")); // inlined everywhere, nothing links to it any more
console.log("Built dist/", v);
