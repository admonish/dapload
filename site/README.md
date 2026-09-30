# dapload.com

Static site for Dapload. Plain HTML, CSS and JS. It lives in the same repo as the app so the live demo always runs the current app.

```
index.html            landing page
site.css              styles (colour tokens copied from public/app.css)
site.js               icons, theme toggle, install tabs, copy buttons, demo controls
demo/index.html       full-screen demo (dapload.com/demo/)
demo/demo-host.js     loads the real app into an iframe with the mock injected
demo/mock-backend.js  in-browser stand-in for proxy.py, the player and the NAS
build.mjs             builds the site into dist/ (Node, no dependencies)
og.png                1200x630 link-preview image (og:image), rendered from og/template.html by og/render.mjs; og/ isn't deployed
```

## Building and deploying

`node site/build.mjs` builds the site into `dist/`:

- It copies this folder, and adds the current `public/index.html`, `app.css` and `app.js` as `dist/demo/app/`. `demo-host.js` fetches `demo/app/index.html`, adds a `<base href>` and a `<script>` for `mock-backend.js` right after `<head>`, and loads the result with `iframe.srcdoc`. `site/demo/app/` is gitignored so a stale copy can't be committed.
- It inlines `site.css` into both pages, so the first paint doesn't wait for a second request.
- It adds `?v=<content hash>` to every CSS and JS URL, including in the dist copy of the app's `index.html`. `vercel.json` caches URLs that have `?v` for a year, and HTML is revalidated on every visit, so a deploy shows up at once. The build fails if a reference it expects to rewrite is missing, so keep the `<link>`/`<script>` tags in the pages as they are, or update `build.mjs` along with them.

Vercel runs the same script (`vercel.json` at the repo root) and skips deploys for commits that change nothing under `site/` or `public/`. To preview locally, run the build and serve `dist/` over http, e.g. `python3 -m http.server -d dist`. It has to be http(s), because the demo loads the app with `fetch()`, which doesn't work from `file://`.

If `proxy.py` gains or changes routes, update `handle()` in `demo/mock-backend.js`. Also check:

- the colour tokens at the top of `site.css`, which are copied from `app.css`
- `VALID_TYPES` in `mock-backend.js`, which is copied from `app.js`
- the install commands in `index.html`, which are copied from `README.md` and `docker-compose.yml`

## Things the mock does to fit around the app

These are all in `mock-backend.js`. None of them change the app files.

- Downloads: `app.js` starts a download with `window.location = "download?..."`, which would navigate the demo away. A capture-phase click listener catches the Download button and shows a toast instead.
- `scrollIntoView()`: inside an iframe this also scrolls the page around it, so the site jumped whenever the transfer dock added a row. The mock replaces it inside the demo document so it only scrolls the dock's own list.
- The demo's theme is switched by calling the app's global `setTheme()`, and "Simulate player going offline" calls the global `refresh()` so the offline screen appears straight away. Going back online is left to the app's own 5-second retry.

## Health check

`/api/health` (`api/health.mjs` at the repo root, the only Vercel function) is for uptime monitoring with Better Stack. It follows the format shared by all our sites: `{"ok": true, "checks": {}, "version": "<commit>"}`, 200 when every check passes and 503 otherwise, with `Cache-Control: no-store` and no error details. The site has no backend dependencies, so `checks` is empty and a 200 proves the deployment serves functions. `version` is `VERCEL_GIT_COMMIT_SHA` shortened to 7 characters. The project isn't connected to GitHub, so deploys have to pass it with `--env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)`, or it reads `local`.

## Privacy

The demo only ever reads `file.name` and `file.size`. Its state is kept in `sessionStorage` under `dapload-demo-state-v1`, and it makes no network requests apart from loading its own files. The site itself uses Vercel Web Analytics and Speed Insights (cookieless, loaded from `/_vercel/` on the same domain; the `<script>` tags are at the end of both pages). They only work on the Vercel deployment and 404 harmlessly in a local preview. Nothing is loaded from third parties, and the app itself has no analytics.
