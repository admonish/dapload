# Development notes

The product is called **Dapload** (repo `admonish/dapload`, website dapload.com). It was previously a private repo called `shanling-uploader`, and the local folder still has that name. Keep "Shanling" out of the product name and use it only to describe what Dapload works with, because it's their trademark.

Public-facing docs are in `README.md`, and the reverse-engineered device API and firmware quirks are in `docs/device-api.md`. Read that before touching anything that talks to the device. This file covers internals.

Personal deployment details, if any, are in `CLAUDE.local.md`, which is gitignored. Never commit anyone's IPs, hostnames or paths.

## Files

| File | Purpose |
|---|---|
| `proxy.py` | stdlib `http.server`. Serves `public/`, proxies device API routes, and implements `/config`, `/library/*` and `/usage`. The only third-party dependency is the optional `smbprotocol` (in `requirements.txt`, installed in the Docker image). Everything must keep working without it, apart from connecting SMB shares. |
| `public/index.html` | Page markup, including the offline/setup screen and the modals. |
| `public/app.js` | All client logic, in vanilla JS with no build step. |
| `public/app.css` | Styles, with light and dark themes via CSS variables. |
| `Dockerfile` | `python:3.12-slim` with a `CONFIG_DIR=/data` volume. It's Debian, not Alpine, because `cryptography` (needed by smbprotocol) only ships armv7 wheels for glibc. It builds in two stages: `cffi` has no armv7 wheel, so a build stage with gcc compiles wheels and the final image installs only those. Without that, the armv7 build fails with "No such file or directory: 'gcc'". |
| `site/` | The dapload.com website, including the live demo that runs the real app from `public/` against an in-browser mock of `proxy.py` (`site/demo/mock-backend.js`). See `site/README.md`. Built by `node site/build.mjs` into `dist/` (inlines the CSS, fingerprints asset URLs for long caching, and writes `/analytics-events.json` from `site/analytics.mjs`, the site's custom analytics events), deployed by Vercel via `vercel.json`. When `proxy.py` routes or response shapes change, update the mock too. |
| `.github/workflows/docker-publish.yml` | Builds multi-arch images and pushes them to `ghcr.io/<owner>/dapload` on pushes to `main` and on `v*` tags. Changes that only touch `site/`, docs or Markdown are skipped. |

## Internals

Proxy routes, SMB gotchas and frontend behaviour (`app.js` startup, offline gating, transfer pipeline and dock, support link): `docs/internals.md`. Read the relevant section before changing `proxy.py` or `public/app.js`. Rules that bite: every response sends `Cache-Control: no-store`; `transfersInProgress` covers the whole batch (no per-item panel hiding); the support link is paused (`SUPPORT_URL` empty) and must stay subtle.

## Testing

- There is no automated test suite.
- Syntax checks: `node --check public/app.js` and `python3 -m py_compile proxy.py`.
- For SMB, run a throwaway Samba server: `docker run -d -p 127.0.0.1:445:445 -v <dir>:/music:ro dperson/samba -u "demo;demo" -s "music;/music;yes;yes;no;demo"`. Its `server min protocol` is SMB2_10, which is a useful realism check.
- Without a device, run a tiny mock that answers `/list` with JSON and accepts `POST /upload`, then point the proxy at it (`CONFIG_DIR=/tmp/x python3 proxy.py 127.0.0.1:<port> <port>`). Make sure the mock's folder tree terminates, because `/usage` walks it recursively.
- UI can be driven with Playwright and headless Chromium.
- Against a real device, only use throwaway folders under `/mnt/mmc/` (e.g. `_test*`) and delete them afterwards. Never write into real music folders. If the device is unreachable, ask the user to open WiFi Transfer on the player.

## Known limitations and ideas

- Library copies have no per-file byte progress, only per-file completion and an overall "N of M" counter.
- If the device drops **mid-transfer**, each remaining file fails individually. Only `refresh()` switches to the offline screen.
- Rename and move are impossible because the firmware lacks `/move`.
- `HOME` (`/mnt/mmc/`) and `VALID_TYPES` are hardcoded for the M1 Plus. Supporting other models may need these to come from `/config`.
- No authentication (see README "Security").
