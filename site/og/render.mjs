// Renders site/og/template.html to site/og.png (1200x630) for link previews.
// Needs Playwright with Chromium (npm i playwright && npx playwright install
// chromium); it isn't a dependency of the project, so run it where
// Playwright is installed, e.g. NODE_PATH=/path/to/node_modules node site/og/render.mjs
// Set CHROME_PATH to use a specific Chromium binary.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, "template.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(here, "..", "og.png") });
await browser.close();
console.log("Wrote site/og.png");
