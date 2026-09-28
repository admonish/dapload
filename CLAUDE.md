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
| `.github/workflows/docker-publish.yml` | Builds multi-arch images and pushes them to `ghcr.io/<owner>/dapload` on pushes to `main` and on `v*` tags. |

## Proxy endpoints (`proxy.py`)

| Route | What it does |
|---|---|
| `/`, static files | Serves `public/`. |
| `/list`, `/upload`, `/create`, `/delete`, `/move`, `/download` | Transparent pass-through to the device. **502** with a plain-text body if the device can't be reached, **503** JSON if no device address is configured yet. |
| `GET /config` | `{device, library, libraryEditable, smbAvailable}`. `library` is null, `{name, type: "local"}` (from `LIBRARY_DIR`) or `{name, type: "smb", address, username, hasPassword}`. The password is never returned. `libraryEditable` is false when `LIBRARY_DIR` is set. |
| `POST /config` (form: `device`) | Validates and normalizes via `normalize_device_address()` (accepts `http://ip:port/`, `ip:port` or bare `ip`, where the port defaults to 8888), saves to `$CONFIG_DIR/config.json`, and returns the new config. A saved address wins over `DEVICE` env/argv on the next start. |
| `POST /library/setup` (form: `address`, `username`, `password`, `name`) | Parses the share address (`parse_share_address()` accepts `\\nas\share\sub`, `//nas/share`, `smb://nas:port/share`), **test-lists the share before saving**, then saves to config. An empty password keeps the saved one if the username is unchanged. Errors are translated into readable messages by `SmbLibrary._translate()`. Returns 403 if `LIBRARY_DIR` is set, and 501 without smbprotocol. |
| `POST /library/remove` | Forgets the SMB library. |
| `GET /library/list?path=<rel>` | Lists a library directory, in the same JSON shape as the device's `/list` but with library-relative paths. Names starting with `.`, `@`, `#` or `$` are hidden (NAS clutter like `@eaDir` and `#recycle`). `safe_relative()` clamps `..` to the library root. Returns 404 when no library is configured. |
| `POST /library/push` (form: `src`, `dest`) | Streams a library file (local or SMB) straight to the device's `/upload` in 1 MB chunks using `http.client`. Bytes never go through the browser, and large DSD/ISO files don't load into memory. The destination filename is always the source basename. |
| `GET /usage?path=/mnt/mmc/[&force=1]` | Recursively sums file sizes via sequential device `/list` calls, which approximates **used** space only. Cached in memory for 5 minutes, keyed by (device, path). `force=1` bypasses the cache. |

`Settings` holds the device address and the library, and persists them to `$CONFIG_DIR/config.json` (mode 0600, because it can contain the NAS password). Both are read per request, so changes from the UI take effect without a restart.

Libraries are `LocalLibrary` or `SmbLibrary`, which share the same `list(rel)` / `open(rel)` interface. SMB gotchas:
- Each `SmbLibrary` uses its own smbclient `connection_cache`. With the global cache, a wrong password was silently "accepted" because an existing session was reused.
- Use `entry.smb_info` from `scandir()`, not `entry.stat()`. `stat()` opens a new connection that ignores the custom port and credentials.
- pysmb was tried first and rejected: it only speaks SMB 2.0.2, and many NAS devices require at least 2.1.

All responses carry `Cache-Control: no-store`, set in `end_headers()`. Without it, browsers heuristically cached `app.js` across deploys and ran stale code.

`HEAD` requests aren't routed to the proxy logic, so `curl -I /list` hits the static-file handler and returns 404. Use `curl -D - -o /dev/null` to inspect headers.

## Frontend behaviour (`app.js`)

- **Startup.** `loadConfig().then(refresh)`. `applyConfig()` shows or hides the library button and sets its label from `config.library.name`. It also switches the offline screen between "Connect your …" (no address) and "Can't reach …" (address set), both with the address form.
- **Device-availability gating.** `refresh()` is the single source of truth. On 502, 503, or a thrown `fetch` (no `status`), `setDeviceOnline(false)` hides `#app-main` and shows `#offline-state`, then polls `refresh()` every 5 s. Other HTTP errors are shown as a toast. `#app-main` and `#usage-badge` start hidden in the HTML.
- **Device address.** It can be changed from the offline screen form or the ⚙ modal. Both call `saveDeviceAddress()`, which resets to `HOME` and refreshes.
- **Uploads.** The UI has drag-and-drop anywhere on the page, an "Upload files" button, and an "Upload folder" button (`webkitdirectory`). Dropped folders are walked with `webkitGetAsEntry()`, and `readEntries()` is looped until it returns empty.
- **Shared transfer pipeline.** `transferEntries(entries, transferOne)` is used by both local uploads (`uploadOne`, XHR with real progress) and library copies (`copyFromLibrary`, which has no byte progress). For each batch it:
  1. filters out junk (`.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`) and disallowed extensions
  2. creates the needed folders parent-first via `ensureDir()`
  3. **skips files already at the destination with the same name and size**, so interrupted batches resume cheaply
  4. transfers the rest sequentially while updating the "Transferring N of M" header and the progress bar
- **Transfer dock.** `#upload-panel` sits at the bottom of the content column. A batch that starts while nothing else is running resets it (`resetDock`). Finished rows stay listed with done/skipped/failed state. The progress bar has one segment per file for batches up to `SEGMENT_LIMIT`, and is continuous above that. `uploadOne`/`copyFromLibrary` return true on success so failures can be counted. When all batches finish, the dock hides after 4 s, unless something failed, in which case it stays until closed. `--dock-h` keeps toasts above it.
- **`transfersInProgress`** covers the whole batch and drives both the `beforeunload` warning and the dock lifecycle. Don't reintroduce per-item panel hiding, because it hid the panel between files.
- **Icons** are inline SVG paths in `ICONS`. HTML uses `<svg data-icon="name">` placeholders that are filled at startup, and JS builds new ones with `svgIcon()`/`setIcon()`. No emoji or icon fonts.
- **Layout.** The left panel (`.side`) holds the device name, the usage readout and the actions, with Upload files as the only primary button. Under 760 px it folds into a top bar and an action strip. On phones, rows show size and date in a second line, and modals become bottom sheets.
- **Add from library.** The button is always visible. With no library configured it opens the setup modal (`openLibrarySetup()`), and otherwise the browser modal. The browser has a "Connection settings" link, and shows errors (NAS off, password changed) in place with a button to fix them. The modal browses `/library/list` with checkboxes. Selected folders are expanded recursively (`collectLibraryEntries`) and the folder structure is preserved under the current device folder.
- **Support link (Ko-fi).** Follows the owner's shared support-model guidelines: subtle, never blocking, and the app works the same without it. There's a "Support this project" link in the side panel (hidden on phones), an about line with an unofficial-project disclaimer in the ⚙ modal, and one dismissible line in the dock after a batch that transferred files. That line shows at most once per session (`sessionStorage`), and dismissing it hides it for 30 days (`localStorage`). Don't turn it into a popup or show it more often.
- **Usage badge.** It is loaded once when the device comes online and force-refreshed after deletes and after a batch that transferred anything. The label is deliberately "≈ X used", and the tooltip explains that it is not free or total space.

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
