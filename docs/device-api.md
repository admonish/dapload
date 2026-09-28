# Shanling M1 Plus WiFi Transfer: reverse-engineered notes

Everything here was verified against a real M1 Plus. Other Shanling players with WiFi Transfer may behave the same way, but that hasn't been tested.

The device runs **thttpd/2.29** serving Shanling's rebrand of **GCDWebUploader** (Pierre-Olivier Latour's GCDWebServer). The stock UI is jQuery/Bootstrap and Chinese-only (title 山灵音乐).

- The browsable root is `/mnt/`. The only usable "home" is `/mnt/mmc/` (the SD card). Uploading or creating at `/mnt/` itself is disallowed.
- **The web server only runs while the "WiFi Transfer" screen is open on the device.** When the screen is closed, port 8888 refuses connections even though the device still answers ping. Treat "device unreachable" as a normal state, not an error.
- The device sends **no CORS headers**, so a same-origin proxy is required.

## API

| Route | Method | Params | Notes |
|---|---|---|---|
| `/list` | GET | `path` | JSON array of `{path, name, ctime}`. Files also have `size`, and **both `size` and `ctime` are strings**. Folders have no `size` and their `path` ends in `/`. |
| `/upload` | POST multipart | `path` (dest dir, trailing `/`), `files[]` | One file per request works fine. Returns 200 even when it silently rejects a file. |
| `/create` | POST form | `path` (no trailing `/`) | Creates **one level only**. It does not create parents. |
| `/delete` | POST form | `path` | Works for files and folders. |
| `/download` | GET | `path` | |
| `/move` | POST | `oldPath`, `newPath` | **Not implemented on this firmware (404).** The stock UI's rename never worked. |

## Firmware quirks

- **An extension whitelist is enforced server-side, silently.** A `.txt` upload returns 200 but the file never appears. Allowed: ISO, DFF, DSF, APE, FLAC, AIF, AIFF, WAV, M4A, AAC, MP2, AC3, DTS, MP3, OGG, WMA, CUE, M3U, M3U8, PNG, JPG, JPEG, LRC, BIN. This list is mirrored in `VALID_TYPES` in `public/app.js`.
- **Creating a folder that already exists drops the connection** with no HTTP response, not an error status. Listing, deleting or downloading a path that doesn't exist does the same. So check existence via `/list` before calling `/create`.
- **Responses use malformed line endings.** The status line ends in CRLF, but the header lines after it end in a bare LF (`HTTP/1.0 200 OK\r\nContent-type: ...\n\n`). Python's `http.client`, curl and browsers accept this. Node's strict parser rejects it with `HPE_INVALID_HEADER_TOKEN`, so `fetch()` from Node fails. Use `http.request(url, { insecureHTTPParser: true })` there.
- **There is no storage or capacity endpoint.** About 25 plausible paths were probed (`info`, `status`, `df`, `statfs`, `capacity`, `volumes`, ...) and all return 404. `/list` never includes capacity fields, and there's no shell access. Free or total space **cannot** be obtained, so the app can only approximate space used by summing file sizes.
