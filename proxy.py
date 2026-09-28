#!/usr/bin/env python3
"""
Local proxy + static server for the Shanling M1 Plus WiFi upload page.

The device (GCDWebUploader/thttpd on port 8888) sends no CORS headers,
so a browser page hosted anywhere else can't call its API directly.
This script serves the improved UI from ./public and transparently
forwards the known API routes (list/upload/create/delete/move/download)
to the device, so everything ends up same-origin.

It can also expose a read-only music library (/library/list,
/library/push) so files can be copied straight from it to the device
without round-tripping through the browser. The library is either a
local folder (LIBRARY_DIR) or an SMB network share connected from the
web UI (needs the optional `smbprotocol` package).

Usage:
    python3 proxy.py [device_host[:port]] [local_port]

Environment variables (all optional):
    DEVICE        device address, e.g. 192.168.1.23:8888. Only a starting
                  value -- an address saved from the web UI takes precedence.
    PORT          port to serve the UI on (default 8899)
    LIBRARY_DIR   local music folder to use as the library (NAS_ROOT is
                  accepted as an alias). When set, the library can't be
                  changed from the web UI.
    LIBRARY_NAME  label for that folder in the UI (default "Library")
    CONFIG_DIR    where settings saved from the web UI are kept
                  (default ./data)
"""

import http.client
import http.server
import json
import os
import posixpath
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

try:
    import smbclient
except ImportError:
    smbclient = None

API_PATHS = {"/list", "/upload", "/create", "/delete", "/move", "/download"}
PUBLIC_DIR = Path(__file__).parent / "public"
DEFAULT_DEVICE_PORT = 8888
CONFIG_FILE = Path(os.environ.get("CONFIG_DIR") or Path(__file__).parent / "data") / "config.json"

_library_env = os.environ.get("LIBRARY_DIR") or os.environ.get("NAS_ROOT") or ""
LIBRARY_DIR = os.path.normpath(_library_env) if _library_env else None
LIBRARY_NAME = os.environ.get("LIBRARY_NAME") or "Library"

# Clutter NAS devices and OSes leave in shares (Synology @eaDir, #recycle, ...)
HIDDEN_PREFIXES = (".", "@", "#", "$")


def normalize_device_address(value):
    """Accepts "192.168.1.23", "192.168.1.23:8888" or the full
    "http://192.168.1.23:8888/" the device shows on its screen, and returns
    "host:port". Raises ValueError for anything else."""
    value = (value or "").strip()
    value = re.sub(r"^https?://", "", value, flags=re.I).split("/", 1)[0]
    m = re.fullmatch(r"([A-Za-z0-9.-]+)(?::(\d{1,5}))?", value)
    if not m:
        raise ValueError("enter an address like 192.168.1.23:8888")
    port = int(m.group(2) or DEFAULT_DEVICE_PORT)
    if not 1 <= port <= 65535:
        raise ValueError("port must be between 1 and 65535")
    return f"{m.group(1)}:{port}"


def parse_share_address(value):
    r"""Accepts \\nas\music\FLAC, //nas/music, smb://nas:445/music/FLAC or
    nas/music and returns (server, port, share, folder). Raises ValueError."""
    value = (value or "").strip().replace("\\", "/")
    value = re.sub(r"^smb:", "", value, flags=re.I).lstrip("/")
    parts = [p for p in value.split("/") if p]
    if len(parts) < 2:
        raise ValueError("include the share name, e.g. \\\\nas\\music")
    m = re.fullmatch(r"([A-Za-z0-9.-]+)(?::(\d{1,5}))?", parts[0])
    if not m:
        raise ValueError(f"'{parts[0]}' doesn't look like a server name or IP address")
    port = int(m.group(2) or 445)
    if any(p in (".", "..") for p in parts[1:]):
        raise ValueError("the address can't contain '.' or '..'")
    return m.group(1), port, parts[1], "/".join(parts[2:])


def safe_relative(rel):
    """Normalizes a library-relative path, refusing anything that climbs out."""
    rel = posixpath.normpath("/" + (rel or "").replace("\\", "/")).lstrip("/")
    if rel.startswith(".."):
        raise ValueError("path escapes library root")
    return "" if rel == "." else rel


class LibraryError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class LocalLibrary:
    """A folder on the machine running the proxy (LIBRARY_DIR)."""

    def __init__(self, root, name):
        self.root = root
        self.name = name

    def describe(self):
        return {"name": self.name, "type": "local"}

    def _full(self, rel):
        rel = safe_relative(rel)
        return os.path.join(self.root, *rel.split("/")) if rel else self.root

    def list(self, rel):
        local_dir = self._full(rel)
        if not os.path.isdir(local_dir):
            raise LibraryError(404, "folder not found")
        entries = []
        for entry in os.scandir(local_dir):
            try:
                st = entry.stat()
                entries.append((entry.name, entry.is_dir(), st.st_size, st.st_mtime))
            except OSError:
                continue
        return entries

    def open(self, rel):
        path = self._full(rel)
        if not os.path.isfile(path):
            raise LibraryError(404, "source file not found")
        return os.path.getsize(path), open(path, "rb")

    def close(self):
        pass


class SmbLibrary:
    """An SMB/CIFS network share, e.g. a NAS, read over the network."""

    def __init__(self, settings):
        self.settings = settings
        self.server, self.port, self.share, self.folder = parse_share_address(settings["address"])
        self.name = settings.get("name") or "NAS"
        # A private cache so changed credentials never reuse an old session.
        self._cache = {}

    def describe(self):
        s = self.settings
        return {"name": self.name, "type": "smb", "address": s["address"],
                "username": s.get("username", ""), "hasPassword": bool(s.get("password"))}

    def _unc(self, rel):
        parts = [self.server, self.share] + [p for p in (self.folder + "/" + safe_relative(rel)).split("/") if p]
        return "\\\\" + "\\".join(parts)

    def _kwargs(self):
        return {"username": self.settings.get("username") or None,
                "password": self.settings.get("password") or None,
                "port": self.port, "connection_timeout": 10,
                "connection_cache": self._cache}

    def _translate(self, e):
        """Turns smbprotocol's exceptions into messages a person can act on."""
        text = str(e)
        if isinstance(e, ValueError) and "Failed to connect" in text:
            return LibraryError(502, f"Couldn't reach {self.server}:{self.port}. Check the address and that the NAS is on.")
        if "No username or password was specified" in text:
            return LibraryError(401, "This share needs a username and password.")
        if "LogonFailure" in type(e).__name__ or "0xc000006d" in text.lower() or "logon failure" in text.lower():
            return LibraryError(401, "The NAS rejected the username or password.")
        if "BadNetworkName" in type(e).__name__ or "0xc00000cc" in text.lower():
            return LibraryError(404, f"There's no share called '{self.share}' on {self.server}.")
        if "0xc0000022" in text.lower() or "access is denied" in text.lower():
            return LibraryError(403, "Access denied. Check that this user can read the share.")
        if "0xc0000034" in text.lower() or "0xc000003a" in text.lower() or "No such file" in text:
            return LibraryError(404, f"Couldn't find that share or folder on {self.server}. Check the spelling.")
        return LibraryError(502, f"NAS error: {text}")

    def list(self, rel):
        # Use the metadata the directory listing already returned: entry.stat()
        # would open a new connection that ignores our port and credentials.
        try:
            return [(e.name, e.is_dir(), e.smb_info.end_of_file, e.smb_info.last_write_time.timestamp())
                    for e in smbclient.scandir(self._unc(rel), **self._kwargs())]
        except Exception as e:
            raise self._translate(e) from e

    def open(self, rel):
        path = self._unc(rel)
        try:
            size = smbclient.stat(path, **self._kwargs()).st_size
            return size, smbclient.open_file(path, mode="rb", **self._kwargs())
        except Exception as e:
            raise self._translate(e) from e

    def close(self):
        try:
            smbclient.reset_connection_cache(connection_cache=self._cache)
        except Exception:
            pass


class Settings:
    """Settings changeable from the web UI, persisted to CONFIG_FILE:
    the device address (players usually get their IP via DHCP, so it can
    change) and the SMB library connection. A saved device address wins
    over the DEVICE env/CLI value."""

    def __init__(self, initial_device):
        self._lock = threading.Lock()
        try:
            data = json.loads(CONFIG_FILE.read_text())
            if not isinstance(data, dict):
                data = {}
        except (OSError, ValueError):
            data = {}
        try:
            self._device = normalize_device_address(data["device"])
        except (KeyError, TypeError, ValueError):
            self._device = normalize_device_address(initial_device) if initial_device else None
        self._smb = data.get("library") if isinstance(data.get("library"), dict) else None

        self.library_editable = LIBRARY_DIR is None
        self._library = None
        if LIBRARY_DIR:
            self._library = LocalLibrary(LIBRARY_DIR, LIBRARY_NAME)
        elif self._smb and smbclient:
            try:
                self._library = SmbLibrary(self._smb)
            except ValueError:
                self._smb = None

    def _save(self):
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = {"device": self._device, "library": self._smb}
        tmp = CONFIG_FILE.with_suffix(".tmp")
        # 0600: this file can hold the NAS password
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(json.dumps(data, indent=2) + "\n")
        os.replace(tmp, CONFIG_FILE)

    @property
    def device(self):
        with self._lock:
            return self._device

    @property
    def library(self):
        with self._lock:
            return self._library

    def set_device(self, value):
        address = normalize_device_address(value)
        with self._lock:
            self._device = address
            self._save()
        return address

    def set_smb_library(self, address, username, password, name):
        """Connects to the share to check the settings actually work before
        saving them. An empty password keeps the saved one, so editing the
        name or folder doesn't mean retyping it."""
        with self._lock:
            old = self._smb
        if not password and old and old.get("username", "") == username:
            password = old.get("password", "")
        settings = {"address": address.strip(), "username": username.strip(),
                    "password": password, "name": name.strip() or "NAS"}
        library = SmbLibrary(settings)  # ValueError for a malformed address
        try:
            library.list("")
        except LibraryError:
            library.close()
            raise
        with self._lock:
            old_library, self._library, self._smb = self._library, library, settings
            self._save()
        if old_library:
            old_library.close()

    def remove_smb_library(self):
        with self._lock:
            old_library, self._library, self._smb = self._library, None, None
            self._save()
        if old_library:
            old_library.close()


# The device has no storage/capacity endpoint at all -- GCDWebUploader only
# exposes list/upload/create/delete/move/download. This approximates "space
# used" by recursively summing file sizes from repeated /list calls. It
# can't report free or total capacity; that number simply isn't available
# anywhere in the API. Requests are sequential (not parallel) because the
# device's embedded thttpd is single-threaded-ish and flaky under load, and
# results are cached since a full walk can take a while on a large library.
USAGE_CACHE_TTL = 300
_usage_cache = {}
_usage_lock = threading.Lock()


def compute_usage(device_base, root_path):
    total_bytes = 0
    file_count = 0
    folder_count = 0
    stack = [root_path]
    while stack:
        path = stack.pop()
        url = device_base + "/list?path=" + urllib.parse.quote(path)
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for entry in data:
            if entry.get("size") is not None:
                total_bytes += int(entry["size"])
                file_count += 1
            else:
                folder_count += 1
                stack.append(entry["path"])
    return {"totalBytes": total_bytes, "fileCount": file_count, "folderCount": folder_count}


def stream_file_to_device(host, port, dest_path, filename, file_size, fileobj):
    """Streams a file object straight into the device's /upload endpoint,
    a chunk at a time, so multi-GB files don't have to fit in memory."""
    boundary = uuid.uuid4().hex
    pre = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="path"\r\n\r\n{dest_path}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files[]"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    post = f"\r\n--{boundary}--\r\n".encode("utf-8")
    content_length = len(pre) + file_size + len(post)

    conn = http.client.HTTPConnection(host, port, timeout=600)
    try:
        conn.putrequest("POST", "/upload")
        conn.putheader("Content-Type", f"multipart/form-data; boundary={boundary}")
        conn.putheader("Content-Length", str(content_length))
        conn.endheaders()
        conn.send(pre)
        while True:
            chunk = fileobj.read(1024 * 1024)
            if not chunk:
                break
            conn.send(chunk)
        conn.send(post)
        resp = conn.getresponse()
        resp.read()
        return resp.status
    finally:
        conn.close()


def make_handler(settings):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

        def log_message(self, fmt, *args):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

        def end_headers(self):
            # http.server sends no Cache-Control by default, which lets
            # browsers heuristically cache app.js/index.html across
            # deploys and silently run stale code. This is a small local
            # control panel, not a CDN asset -- never worth caching.
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def _json_response(self, code, obj):
            body = json.dumps(obj).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _api_path(self):
            path_only = self.path.split("?", 1)[0]
            return path_only in API_PATHS

        def _read_form(self):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            return {k: v[0] for k, v in urllib.parse.parse_qs(body.decode("utf-8"), keep_blank_values=True).items()}

        def _config(self):
            library = settings.library
            self._json_response(200, {
                "device": settings.device,
                "library": library.describe() if library else None,
                "libraryEditable": settings.library_editable,
                "smbAvailable": smbclient is not None,
            })

        def _set_config(self):
            try:
                settings.set_device(self._read_form().get("device", ""))
            except ValueError as e:
                self._json_response(400, {"error": str(e)})
                return
            except OSError as e:
                self._json_response(500, {"error": f"could not save setting: {e}"})
                return
            self._config()

        def _library_setup(self):
            if not settings.library_editable:
                self._json_response(403, {"error": "the library is set by LIBRARY_DIR on the server"})
                return
            if smbclient is None:
                self._json_response(501, {"error": "network shares need the smbprotocol package: pip install smbprotocol"})
                return
            form = self._read_form()
            try:
                settings.set_smb_library(form.get("address", ""), form.get("username", ""),
                                         form.get("password", ""), form.get("name", ""))
            except ValueError as e:
                self._json_response(400, {"error": str(e)})
                return
            except LibraryError as e:
                self._json_response(e.status, {"error": str(e)})
                return
            except OSError as e:
                self._json_response(500, {"error": f"could not save setting: {e}"})
                return
            self._config()

        def _library_remove(self):
            if not settings.library_editable:
                self._json_response(403, {"error": "the library is set by LIBRARY_DIR on the server"})
                return
            settings.remove_smb_library()
            self._config()

        def _proxy(self, method):
            address = settings.device
            if not address:
                self._json_response(503, {"error": "no device address configured"})
                return
            url = "http://" + address + self.path
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else None

            headers = {}
            if "Content-Type" in self.headers:
                headers["Content-Type"] = self.headers["Content-Type"]

            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    self.send_response(resp.status)
                    for key in ("Content-Type", "Content-Disposition", "Content-Length"):
                        if resp.headers.get(key):
                            self.send_header(key, resp.headers[key])
                    self.end_headers()
                    self.wfile.write(resp.read())
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(f"Proxy error reaching device: {e}".encode())

        def _library_list(self, rel):
            library = settings.library
            if not library:
                self._json_response(404, {"error": "no library configured"})
                return
            try:
                rel = safe_relative(rel)
                listing = library.list(rel)
            except ValueError:
                self._json_response(400, {"error": "invalid path"})
                return
            except LibraryError as e:
                self._json_response(e.status, {"error": str(e)})
                return
            except OSError as e:
                self._json_response(500, {"error": str(e)})
                return
            entries = []
            for name, is_dir, size, mtime in listing:
                if name.startswith(HIDDEN_PREFIXES):
                    continue
                rel_path = (rel + "/" + name) if rel else name
                if is_dir:
                    entries.append({"path": rel_path + "/", "name": name, "ctime": str(int(mtime))})
                else:
                    entries.append({
                        "path": rel_path, "name": name,
                        "ctime": str(int(mtime)), "size": str(size),
                    })
            self._json_response(200, entries)

        def _library_push(self):
            params = self._read_form()
            src = params.get("src", "")
            dest = params.get("dest", "")
            library = settings.library
            address = settings.device
            if not library:
                self._json_response(404, {"error": "no library configured"})
                return
            if not address:
                self._json_response(503, {"error": "no device address configured"})
                return
            try:
                size, fileobj = library.open(src)
            except ValueError:
                self._json_response(400, {"error": "invalid src"})
                return
            except LibraryError as e:
                self._json_response(e.status, {"error": str(e)})
                return
            filename = posixpath.basename(safe_relative(src))
            host, port = address.rsplit(":", 1)
            try:
                with fileobj:
                    status = stream_file_to_device(host, int(port), dest, filename, size, fileobj)
            except Exception as e:
                self._json_response(502, {"error": str(e)})
                return
            if 200 <= status < 300:
                self._json_response(200, {})
            else:
                self._json_response(502, {"error": f"device returned HTTP {status}"})

        def _usage(self, root_path, force):
            address = settings.device
            if not address:
                self._json_response(503, {"error": "no device address configured"})
                return
            key = (address, root_path)
            now = time.time()
            with _usage_lock:
                cached = _usage_cache.get(key)
            if not force and cached and (now - cached["computedAt"]) < USAGE_CACHE_TTL:
                self._json_response(200, cached)
                return
            try:
                result = compute_usage("http://" + address, root_path)
            except Exception as e:
                self._json_response(502, {"error": str(e)})
                return
            result["computedAt"] = now
            with _usage_lock:
                _usage_cache[key] = result
            self._json_response(200, result)

        def do_GET(self):
            path_only = self.path.split("?", 1)[0]
            if path_only == "/config":
                self._config()
            elif path_only == "/library/list":
                qs = urllib.parse.urlparse(self.path).query
                rel = urllib.parse.parse_qs(qs).get("path", [""])[0]
                self._library_list(rel)
            elif path_only == "/usage":
                qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                root_path = qs.get("path", [""])[0]
                force = qs.get("force", ["0"])[0] == "1"
                self._usage(root_path, force)
            elif self._api_path():
                self._proxy("GET")
            else:
                super().do_GET()

        def do_POST(self):
            path_only = self.path.split("?", 1)[0]
            if path_only == "/config":
                self._set_config()
            elif path_only == "/library/setup":
                self._library_setup()
            elif path_only == "/library/remove":
                self._library_remove()
            elif path_only == "/library/push":
                self._library_push()
            elif self._api_path():
                self._proxy("POST")
            else:
                self.send_response(404)
                self.end_headers()

    return Handler


def main():
    global LIBRARY_DIR
    sys.stdout.reconfigure(line_buffering=True)  # so startup messages reach `docker logs`
    initial = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DEVICE", "")
    port = int(sys.argv[2]) if len(sys.argv) > 2 else int(os.environ.get("PORT", "8899"))

    if LIBRARY_DIR and not os.path.isdir(LIBRARY_DIR):
        print(f"Warning: library folder {LIBRARY_DIR} doesn't exist; ignoring LIBRARY_DIR")
        LIBRARY_DIR = None

    settings = Settings(initial)
    handler = make_handler(settings)
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    if settings.device:
        print(f"Proxying API calls to http://{settings.device}")
    else:
        print("No device address set yet; enter it in the web UI")
    library = settings.library
    if isinstance(library, LocalLibrary):
        print(f"Serving {library.name} from {library.root} (read-only)")
    elif isinstance(library, SmbLibrary):
        print(f"Library: {library.name} on {library.settings['address']}")
    if smbclient is None and settings.library_editable:
        print("Note: install smbprotocol to connect network shares from the web UI")
    print(f"Open http://localhost:{port} in your browser")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
