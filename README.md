# Dapload

A better web UI for the **WiFi Transfer** feature on the Shanling M1 Plus digital audio player.

The player's built-in upload page is Chinese-only, uploads one file at a time and can't handle folders. This replaces it with a small local web app that you run on any computer, server or NAS on the same network.

- Upload whole folders by drag-and-drop or folder picker, with the folder structure preserved
- Skip files that are already on the player, so an interrupted batch resumes where it left off
- Connect your NAS from the web page and copy music straight from it to the player, without going through your browser
- Multi-select and bulk delete, sorting and filtering
- Approximate "space used" on the SD card
- Dark mode

**Tested on:** Shanling M1 Plus. Other Shanling players with WiFi Transfer probably use the same server software and may work. If you try one, please open an issue saying whether it worked.

## Quick start

### With Docker (recommended)

```bash
docker run -d --name dapload --restart unless-stopped \
  -p 8899:8899 \
  -v dapload-data:/data \
  ghcr.io/admonish/dapload:latest
```

Or copy [`docker-compose.yml`](docker-compose.yml) and run `docker compose up -d`.

Images are published for `amd64`, `arm64` and `armv7`, so it runs on a Raspberry Pi or on most NAS devices that support Docker (Synology, Unraid, TrueNAS and so on).

### Without Docker

You need Python 3.8 or newer.

```bash
git clone https://github.com/admonish/dapload.git
cd dapload
pip install -r requirements.txt   # optional, only needed for connecting a NAS
python3 proxy.py
```

### Then

1. On the player, open **WiFi Transfer**. It shows an address like `http://192.168.1.23:8888`.
2. Open `http://<the machine running this>:8899` in a browser.
3. Enter the player's address when asked. It's remembered. If the player's IP changes later, update it from the ⚙ button or the "can't reach" screen.

The player's web server only runs while the WiFi Transfer screen is open. When it's closed, the app shows a "can't reach" screen and reconnects automatically when you open it again.

## Copying from your NAS ("Add from library")

Click **Add from library** and enter your network share the way you'd type it in Windows File Explorer, e.g. `\\nas\music` or `\\192.168.1.10\music\FLAC`, plus your NAS username and password. The app checks the connection, remembers it, and from then on lets you pick albums or folders on the NAS and copy them straight to the player.

This works with any NAS or computer that shares folders over SMB (Windows file sharing), which covers Synology, QNAP, TrueNAS, Unraid, Windows and macOS shares. The share is only read, never modified. It's a good idea to create a NAS user that only has read access to your music.

### Alternative: a folder on the machine running the app

If the music is on the same machine (or you've already mounted the share there), point the app at the folder instead. This also works for NFS shares.

```bash
docker run -d --name dapload --restart unless-stopped \
  -p 8899:8899 \
  -v dapload-data:/data \
  -v /path/to/music:/music:ro \
  -e LIBRARY_DIR=/music \
  -e LIBRARY_NAME=NAS \
  ghcr.io/admonish/dapload:latest
```

When `LIBRARY_DIR` is set, it replaces the NAS connection from the web page, which can't be changed from the web page any more.

## Configuration

All settings are optional environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `DEVICE` | *(none)* | Player address, e.g. `192.168.1.23:8888`. Only used as a starting value. An address saved in the web UI takes precedence. |
| `PORT` | `8899` | Port the web UI listens on. |
| `LIBRARY_DIR` | *(none)* | Use a folder on this machine as the library instead of connecting a NAS from the web page. `NAS_ROOT` also works. |
| `LIBRARY_NAME` | `Library` | What to call that folder in the UI, e.g. `NAS`. |
| `CONFIG_DIR` | `./data` (`/data` in Docker) | Where settings from the web page are saved: the player address and the NAS connection, including its password. The file is readable only by the app's user. |

Without Docker, you can also pass the address and port as arguments: `python3 proxy.py 192.168.1.23:8888 8899`.

## Security

The app has **no login**. Anyone who can reach port 8899 can browse, upload to and delete from the player (while WiFi Transfer is open), browse the connected library, and change the settings. The NAS password is never sent back to the browser, but it is stored in plain text in `CONFIG_DIR` on the server. That's the same trust model as the player's own WiFi Transfer page. Run it only on a trusted home network, and don't expose it to the internet.

## Limitations

These come from the player's firmware, not from this app:

- **No rename or move.** The firmware doesn't implement it.
- **No free-space figure.** The player doesn't report capacity, so the "≈ used" number is calculated by adding up file sizes.
- **Only certain file types are accepted:** ISO, DFF, DSF, APE, FLAC, AIF(F), WAV, M4A, AAC, MP2, AC3, DTS, MP3, OGG, WMA, CUE, M3U(8), PNG, JPG, LRC and BIN. The player silently drops anything else, so the app filters those files out up front and tells you.

## How it works

The player's upload page is served by a small embedded web server that doesn't allow cross-origin requests. `proxy.py` is a Python standard-library server that serves the UI from `public/` and forwards API calls to the player, so everything is same-origin. It also implements the library browser (local folder, or SMB via [smbprotocol](https://github.com/jborean93/smbprotocol)) and the streaming copy to the player. The frontend is plain HTML, CSS and JavaScript with no build step.

The details of the player's API and its firmware quirks are in [docs/device-api.md](docs/device-api.md).

## License

The code is [MIT](LICENSE)-licensed. The Dapload name isn't covered by the license, so please use a different name for your own fork.

Dapload is an unofficial community project. It is not affiliated with or endorsed by Shanling.

If Dapload is useful to you, you can [buy me a coffee](https://ko-fi.com/thomasjohnsrud).
