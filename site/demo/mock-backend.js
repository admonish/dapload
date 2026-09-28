/*
 * Dapload: in-browser demo backend
 * ===========================================
 *
 * The real app (public/index.html, app.css, app.js) talks to proxy.py over
 * same-origin HTTP. For the demo on the website there is no proxy, no
 * player and no NAS, so this file stands in for all three. It is loaded
 * into the demo document BEFORE app.js (see demo-host.js) and replaces
 * window.fetch and window.XMLHttpRequest for the app's own routes.
 *
 * Routes and JSON shapes mirror proxy.py and docs/device-api.md:
 *
 *   GET  /config                 {device, library, libraryEditable, smbAvailable}
 *   POST /config                 form: device            -> config
 *   GET  /list?path=             device listing: [{path, name, ctime, size?}]
 *   POST /upload  (XHR)          multipart: path, files[]
 *   POST /create                 form: path (no trailing slash, one level only)
 *   POST /delete                 form: path
 *   GET  /download?path=         (the app navigates to it; see the click guard below)
 *   GET  /usage?path=[&force=1]  {totalBytes, fileCount, folderCount, computedAt}
 *   GET  /library/list?path=     library listing, library-relative paths
 *   POST /library/push           form: src, dest
 *   POST /library/setup          form: address, username, password, name -> config
 *   POST /library/remove         -> config
 *
 * Firmware behaviour that the app relies on is reproduced too:
 *   - sizes and ctimes are strings; folders have no size and end in "/"
 *   - /create only makes one level, and creating something that already
 *     exists (or listing/deleting something missing) "drops the
 *     connection", which the proxy reports as a 502
 *   - /upload returns 200 but silently drops disallowed file types
 *   - while "offline", every device route returns 502, like the proxy does
 *     when WiFi Transfer is closed on the player
 *
 * Privacy: file CONTENTS are never read. For uploads only file.name and
 * file.size are kept. State lives in sessionStorage (this tab only) and
 * nothing is sent over the network.
 */
(function () {
  "use strict";

  const STORE_KEY = "dapload-demo-state-v1";
  const ROOT = "/mnt/";
  const MB = 1048576;
  const DAY = 86400;

  // Same list as VALID_TYPES in app.js and the firmware's whitelist.
  const VALID_TYPES = ["ISO","DFF","DSF","APE","FLAC","AIF","AIFF","WAV","M4A","AAC","MP2","AC3","DTS",
    "MP3","OGG","WMA","CUE","M3U","M3U8","PNG","JPG","JPEG","LRC","BIN"];
  // Names proxy.py hides from library listings (Synology @eaDir, #recycle, ...).
  const HIDDEN_PREFIXES = [".", "@", "#", "$"];

  // ---------------------------------------------------------------------
  // Deterministic "random" numbers, so every visitor sees the same player
  // and the same file sizes appear on the player and the NAS. That's what
  // makes "skip files already on the device" visible when copying an
  // album that's on both.
  // ---------------------------------------------------------------------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const rnd = (key) => hash(key) / 4294967296;
  const between = (key, a, b) => Math.floor(a + rnd(key) * (b - a + 1));

  const TITLE_POOL = ["First Light", "Glass Houses", "Undertow", "Lanterns", "Slow Orbit", "Paper Moon",
    "Northbound", "Ember", "Saltwater", "Fieldwork", "Parallel Lines", "Low Sun", "Driftwood", "Signal",
    "Weather Report", "Stillwater", "Long Division", "Late Train", "Halfway Home", "Cinder", "Arcadia",
    "Harbour Wall", "Small Hours", "Tin Roof", "Aftermath", "Open Water", "Radio Silence", "Kite",
    "Two Rivers", "Blue Hour", "Thaw", "Night Ferry", "Copper", "The Long Way", "Semaphore", "Hinterland"];

  // [artist, album, format, tracks (count or titles), where: p = player, n = NAS]
  const CATALOGUE = [
    ["Aldous Marr", "Low Tide Hours", "flac", 9, "pn"],
    ["Aldous Marr", "Salt & Signal", "flac", 10, "p"],
    ["Brass Lantern Ensemble", "Night Market", "flac", 8, "p"],
    ["Clara Østergaard", "Winter Études", "cue", 1, "pn"],
    ["Delacroix String Quartet", "Haydn - String Quartets Op. 76", "flac",
      ["No. 1 - I. Allegro con spirito", "No. 1 - II. Adagio sostenuto", "No. 2 - I. Allegro", "No. 2 - III. Menuetto",
       "No. 3 - II. Poco adagio, cantabile", "No. 4 - I. Allegro con spirito", "No. 5 - II. Largo", "No. 6 - IV. Allegro spiritoso"], "n"],
    ["Evening Radio Club", "Static Bloom", "flac", 11, "p", { lrc: true }],
    ["Fenwick & Hale", "Paper Boats", "flac", 10, "n", { junk: ["Thumbs.db"] }],
    ["Ilse Marten", "Bach - Goldberg Variations", "dsf",
      ["Aria", "Variatio 1", "Variatio 2", "Variatio 3 Canone all'Unisono", "Variatio 4", "Variatio 5",
       "Variatio 6 Canone alla Seconda", "Variatio 7", "Variatio 8", "Aria da capo"], "p"],
    ["Harbour Lights", "Longshore", "flac", 9, "p"],
    ["Juniper Vale", "Quiet Machines", "flac", 10, "pn"],
    ["Juniper Vale", "Afterglow EP", "flac", 4, "n"],
    ["Kōji Takamura Trio", "Blue Hour Sessions", "dsf", 7, "p"],
    ["Lumen Choir", "Hymns for Open Air", "flac", 12, "n", { junk: ["booklet.pdf"] }],
    ["Mira Okafor", "Tidewater", "flac", 10, "p"],
    ["Northern Transit", "Coastline", "flac", 9, "p"],
    ["Northern Transit", "Departures", "flac", 11, "pn"],
    ["Northern Transit", "Night Service", "flac", 8, "n"],
    ["Ostinato", "Pulse Studies", "flac", 6, "n"],
    ["Pale Orchard", "Fieldnotes", "flac", 10, "p"],
    ["Hanne Roos", "Satie - Piano Works", "flac",
      ["Gymnopédie No. 1", "Gymnopédie No. 2", "Gymnopédie No. 3", "Gnossienne No. 1",
       "Gnossienne No. 2", "Gnossienne No. 3", "Je te veux", "Vexations (excerpt)"], "pn"],
    ["The Sundays Off", "Postcards", "flac", 10, "p"],
    ["Velvet Ashes", "Slow Fire", "flac", 9, "n"],
    ["Aster Symphony Orchestra", "Mahler - Symphony No. 1", "dsf",
      ["I. Langsam, schleppend", "II. Kräftig bewegt", "III. Feierlich und gemessen", "IV. Stürmisch bewegt"], "n"],
    ["Kestrel Philharmonic", "Beethoven - Symphony No. 7", "flac",
      ["I. Poco sostenuto - Vivace", "II. Allegretto", "III. Presto", "IV. Allegro con brio"], "n"],
    ["Grey Heron", "Estuary", "flac", 10, "n"],
    ["Nightjar", "Moth Hours", "flac", 8, "n"],
    ["Wren Hollow", "Kindling", "flac", 9, "n"],
    ["Isola Bella Trio", "Terrazza", "dsf", 6, "n"],
    ["Rosewater Duo", "Correspondence", "flac", 10, "n"],
  ];

  const pad = (n) => String(n).padStart(2, "0");

  function albumFiles(artist, album, fmt, tracks, opts) {
    const key = artist + "/" + album;
    const files = [];
    if (fmt === "cue") {
      files.push({ name: album + ".flac", size: between(key + "/img", 290 * MB, 420 * MB) });
      files.push({ name: album + ".cue", size: between(key + "/cue", 1100, 2900) });
    } else {
      let titles = tracks;
      if (typeof tracks === "number") {
        const start = between(key, 0, TITLE_POOL.length - 1);
        titles = Array.from({ length: tracks }, (_, i) => TITLE_POOL[(start + i * 7) % TITLE_POOL.length]);
      }
      titles.forEach((t, i) => {
        const name = `${pad(i + 1)} ${t}.${fmt}`;
        const size = fmt === "dsf" ? between(key + name, 150 * MB, 340 * MB) : between(key + name, 18 * MB, 52 * MB);
        files.push({ name, size });
        if (opts && opts.lrc) files.push({ name: `${pad(i + 1)} ${t}.lrc`, size: between(key + name + "lrc", 1800, 5200) });
      });
    }
    files.push({ name: "cover.jpg", size: between(key + "/cover", 210 * 1024, 1900 * 1024) });
    return files;
  }

  // Tree nodes: folder = {d: 1, t: ctime, c: {name: node}}, file = {s: size, t: ctime}.
  const dir = (t) => ({ d: 1, t, c: {} });

  function seed() {
    const now = Math.floor(Date.now() / 1000);
    const device = dir(now - 900 * DAY);
    const mmc = device.c.mmc = dir(now - 900 * DAY);
    const nas = dir(now - 1500 * DAY);

    for (const [artist, album, fmt, tracks, where, opts] of CATALOGUE) {
      const files = albumFiles(artist, album, fmt, tracks, opts);
      if (where.includes("p")) {
        // "Added" dates spread over the last ~20 months.
        const t = now - between(artist + album + "added", 3, 600) * DAY;
        const a = mmc.c[artist] || (mmc.c[artist] = dir(t));
        a.t = Math.max(a.t, t);
        const al = a.c[album] = dir(t);
        files.forEach((f, i) => { al.c[f.name] = { s: f.size, t: t + i * 40 }; });
      }
      if (where.includes("n")) {
        const t = now - between(artist + album + "nas", 200, 1400) * DAY;
        const a = nas.c[artist] || (nas.c[artist] = dir(t));
        const al = a.c[album] = dir(t);
        files.forEach((f) => { al.c[f.name] = { s: f.size, t }; });
        (opts && opts.junk || []).forEach((j) => { al.c[j] = { s: between(key(artist, album, j), 8000, 900000), t }; });
        al.c["@eaDir"] = dir(t);          // hidden by the library listing
        al.c[".DS_Store"] = { s: 6148, t }; // hidden too
      }
    }
    const pl = mmc.c.Playlists = dir(now - 40 * DAY);
    pl.c["Favourites.m3u8"] = { s: 2150, t: now - 12 * DAY };
    pl.c["Late night.m3u8"] = { s: 1320, t: now - 40 * DAY };
    nas.c["#recycle"] = dir(now - 300 * DAY);

    return {
      device,
      nas,
      config: { device: "192.168.1.23:8888", library: { address: "\\\\nas\\music", username: "music", name: "NAS" } },
      offline: false,
    };
  }
  function key(a, b, c) { return a + "/" + b + "/" + c; }

  // ---------------------------------------------------------------------
  // State, kept in sessionStorage so it survives reloads in this tab only.
  // ---------------------------------------------------------------------
  let state;
  try { state = JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (e) { state = null; }
  if (!state || !state.device) state = seed();
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* quota: keep in memory */ }
    }, 150);
  }
  save();

  // Device paths are absolute ("/mnt/mmc/Artist/Album/"); the tree root is /mnt/.
  function devSegments(path) {
    if (!path.startsWith(ROOT)) return null;
    return path.slice(ROOT.length).split("/").filter(Boolean);
  }
  function walk(rootNode, segs) {
    let node = rootNode;
    for (const s of segs) {
      if (!node || !node.d || !node.c[s]) return null;
      node = node.c[s];
    }
    return node;
  }
  const devNode = (path) => { const s = devSegments(path); return s ? walk(state.device, s) : null; };

  // Mirrors safe_relative() in proxy.py: normalizes, clamps "..", no leading slash.
  function safeRelative(rel) {
    const out = [];
    for (const p of String(rel || "").replace(/\\/g, "/").split("/")) {
      if (!p || p === ".") continue;
      if (p === "..") out.pop(); else out.push(p);
    }
    return out.join("/");
  }
  const nasNode = (rel) => { const r = safeRelative(rel); return walk(state.nas, r ? r.split("/") : []); };

  function extOf(name) { const i = name.lastIndexOf("."); return i >= 0 ? name.slice(i + 1).toUpperCase() : ""; }
  const nowSec = () => Math.floor(Date.now() / 1000);

  // ---------------------------------------------------------------------
  // Validation copied from proxy.py so error messages match the real app.
  // ---------------------------------------------------------------------
  function normalizeDeviceAddress(value) {
    value = String(value || "").trim().replace(/^https?:\/\//i, "").split("/")[0];
    const m = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(value);
    if (!m) throw new Error("enter an address like 192.168.1.23:8888");
    const port = Number(m[2] || 8888);
    if (port < 1 || port > 65535) throw new Error("port must be between 1 and 65535");
    return `${m[1]}:${port}`;
  }
  function parseShareAddress(value) {
    value = String(value || "").trim().replace(/\\/g, "/").replace(/^smb:/i, "").replace(/^\/+/, "");
    const parts = value.split("/").filter(Boolean);
    if (parts.length < 2) throw new Error("include the share name, e.g. \\\\nas\\music");
    const m = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(parts[0]);
    if (!m) throw new Error(`'${parts[0]}' doesn't look like a server name or IP address`);
    if (parts.slice(1).some((p) => p === "." || p === "..")) throw new Error("the address can't contain '.' or '..'");
    return { server: m[1], share: parts[1] };
  }

  function configJson() {
    const lib = state.config.library;
    return {
      device: state.config.device,
      library: lib ? { name: lib.name, type: "smb", address: lib.address, username: lib.username, hasPassword: true } : null,
      libraryEditable: true,
      smbAvailable: true,
    };
  }

  // ---------------------------------------------------------------------
  // Responses
  // ---------------------------------------------------------------------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const latency = () => wait(60 + Math.random() * 110);
  function json(status, obj) {
    return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  // What proxy.py sends when it can't reach the player (WiFi Transfer closed,
  // or the device dropped the connection).
  function deviceDown(reason) {
    return new Response("Proxy error reaching device: " + (reason || "[Errno 111] Connection refused"),
      { status: 502, headers: { "Content-Type": "text/plain" } });
  }
  const DROPPED = "Remote end closed connection without response";

  function listDir(node, pathPrefix, hideClutter) {
    const out = [];
    for (const [name, child] of Object.entries(node.c)) {
      if (hideClutter && HIDDEN_PREFIXES.some((p) => name.startsWith(p))) continue;
      if (child.d) out.push({ path: pathPrefix + name + "/", name, ctime: String(child.t) });
      else out.push({ path: pathPrefix + name, name, ctime: String(child.t), size: String(child.s) });
    }
    return out;
  }

  function sumTree(node) {
    let totalBytes = 0, fileCount = 0, folderCount = 0;
    for (const child of Object.values(node.c)) {
      if (child.d) { folderCount++; const r = sumTree(child); totalBytes += r.totalBytes; fileCount += r.fileCount; folderCount += r.folderCount; }
      else { totalBytes += child.s; fileCount++; }
    }
    return { totalBytes, fileCount, folderCount };
  }

  function splitParent(path) {
    const trimmed = path.replace(/\/$/, "");
    const i = trimmed.lastIndexOf("/");
    return { parent: trimmed.slice(0, i + 1), name: trimmed.slice(i + 1) };
  }

  // Simulated transfer time. Real WiFi transfers are slower; this is just
  // long enough for the progress bars to be visible.
  const transferMs = (size) => Math.min(3800, Math.max(450, (size / (45 * MB)) * 1000));

  // Paths are resolved against the app document's base URL, so "list?path="
  // becomes ".../demo/app/list". ROUTE_BASE is that directory.
  const ROUTE_BASE = new URL(".", document.baseURI).pathname;
  function routeOf(url) {
    const u = new URL(url, document.baseURI);
    if (u.origin !== location.origin && location.origin !== "null") return null;
    if (!u.pathname.startsWith(ROUTE_BASE)) return null;
    const route = u.pathname.slice(ROUTE_BASE.length);
    return ROUTES.has(route) ? { route, query: u.searchParams } : null;
  }
  const ROUTES = new Set(["config", "list", "upload", "create", "delete", "download", "move", "usage",
    "library/list", "library/push", "library/setup", "library/remove"]);

  async function handle(route, query, method, form) {
    const deviceRoutes = ["list", "upload", "create", "delete", "download", "move"];
    if (deviceRoutes.includes(route) && !state.config.device) return json(503, { error: "no device address configured" });
    if (deviceRoutes.includes(route) && state.offline) { await wait(250); return deviceDown(); }

    switch (route + " " + method) {
      case "config GET":
        return json(200, configJson());

      case "config POST":
        try { state.config.device = normalizeDeviceAddress(form.get("device")); }
        catch (e) { return json(400, { error: e.message }); }
        save();
        return json(200, configJson());

      case "list GET": {
        const path = query.get("path") || "";
        const node = devNode(path);
        if (!node || !node.d) return deviceDown(DROPPED);
        return json(200, listDir(node, path, false));
      }

      case "create POST": {
        const { parent, name } = splitParent(form.get("path") || "");
        if (parent === ROOT) return json(403, { error: "Forbidden" }); // uploading/creating at /mnt/ is disallowed
        const p = devNode(parent);
        if (!p || !p.d || !name || p.c[name]) return deviceDown(DROPPED); // firmware drops the connection
        p.c[name] = dir(nowSec());
        save();
        return new Response("", { status: 200 });
      }

      case "delete POST": {
        const { parent, name } = splitParent(form.get("path") || "");
        const p = devNode(parent);
        if (!p || !p.c[name] || parent === ROOT) return deviceDown(DROPPED);
        delete p.c[name];
        save();
        return new Response("", { status: 200 });
      }

      case "move POST":
        return new Response("Not Found", { status: 404 }); // not implemented by this firmware

      case "download GET":
        return new Response("Downloads are disabled in the demo.", { status: 200, headers: { "Content-Type": "text/plain" } });

      case "usage GET": {
        if (!state.config.device) return json(503, { error: "no device address configured" });
        await wait(query.get("force") === "1" ? 700 : 350); // the real proxy walks the whole card
        if (state.offline) return json(502, { error: "[Errno 111] Connection refused" });
        const node = devNode(query.get("path") || "/mnt/mmc/");
        if (!node) return json(502, { error: DROPPED });
        return json(200, { ...sumTree(node), computedAt: Date.now() / 1000 });
      }

      case "library/list GET": {
        const lib = state.config.library;
        if (!lib) return json(404, { error: "no library configured" });
        const rel = safeRelative(query.get("path"));
        const node = nasNode(rel);
        if (!node || !node.d) {
          const server = parseShareAddress(lib.address).server;
          return json(404, { error: `Couldn't find that share or folder on ${server}. Check the spelling.` });
        }
        return json(200, listDir(node, rel ? rel + "/" : "", true));
      }

      case "library/push POST": {
        const lib = state.config.library;
        if (!lib) return json(404, { error: "no library configured" });
        if (!state.config.device) return json(503, { error: "no device address configured" });
        const src = safeRelative(form.get("src"));
        const file = nasNode(src);
        if (!file || file.d) return json(404, { error: "source file not found" });
        await wait(transferMs(file.s));
        // The player may have "gone offline" while this file was copying.
        if (state.offline) return json(502, { error: "[Errno 111] Connection refused" });
        const destDir = devNode(form.get("dest") || "");
        if (!destDir || !destDir.d) return json(502, { error: "device returned HTTP 500" });
        const name = src.split("/").pop();
        if (VALID_TYPES.includes(extOf(name))) destDir.c[name] = { s: file.s, t: nowSec() };
        save();
        return json(200, {});
      }

      case "library/setup POST": {
        const address = (form.get("address") || "").trim();
        const username = (form.get("username") || "").trim();
        let password = form.get("password") || "";
        const old = state.config.library;
        if (!password && old && old.username === username) password = "(saved)";
        let parsed;
        try { parsed = parseShareAddress(address); } catch (e) { return json(400, { error: e.message }); }
        await wait(600); // proxy.py test-lists the share before saving
        if (!username || !password) return json(401, { error: "This share needs a username and password." });
        state.config.library = { address, username, name: (form.get("name") || "").trim() || "NAS" };
        void parsed;
        save();
        return json(200, configJson());
      }

      case "library/remove POST":
        state.config.library = null;
        save();
        return json(200, configJson());
    }
    return new Response("Not Found", { status: 404 });
  }

  function formOf(body) {
    if (body instanceof URLSearchParams) return body;
    if (typeof body === "string") return new URLSearchParams(body);
    if (body instanceof FormData) return body;
    return new URLSearchParams();
  }

  // ---------------------------------------------------------------------
  // fetch()
  // ---------------------------------------------------------------------
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const r = routeOf(url);
    if (!r) return realFetch(input, init);
    const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    await latency();
    return handle(r.route, r.query, method, formOf(init && init.body));
  };

  // ---------------------------------------------------------------------
  // XMLHttpRequest, used by app.js only for uploads (so it gets progress
  // events). Anything that isn't an app route is handed to a real XHR.
  // ---------------------------------------------------------------------
  const RealXHR = window.XMLHttpRequest;

  class DemoXHR {
    constructor() {
      this._listeners = {};
      this.upload = new EventTarget();
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this._real = null;
    }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); if (this._real) this._real.addEventListener(type, fn); }
    removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn); }
    _emit(type) {
      const ev = new Event(type);
      (this._listeners[type] || []).forEach((fn) => fn.call(this, ev));
      if (typeof this["on" + type] === "function") this["on" + type](ev);
    }
    setRequestHeader(k, v) { if (this._real) this._real.setRequestHeader(k, v); }
    open(method, url) {
      this._method = String(method).toUpperCase();
      this._route = routeOf(url);
      if (!this._route) {
        // Not ours: behave like a normal XHR.
        this._real = new RealXHR();
        for (const [type, fns] of Object.entries(this._listeners)) fns.forEach((fn) => this._real.addEventListener(type, fn));
        this._real.open(method, url);
        return;
      }
      this.readyState = 1;
    }
    send(body) {
      if (this._real) return this._real.send(body);
      if (this._route.route !== "upload") {
        // Only uploads go through XHR in app.js; route anything else via the fetch mock.
        handle(this._route.route, this._route.query, this._method, formOf(body)).then(async (res) => {
          this.status = res.status; this.responseText = await res.text(); this.readyState = 4; this._emit("load");
        });
        return;
      }
      this._simulateUpload(body);
    }
    abort() {
      if (this._real) return this._real.abort();
      this._aborted = true;
      clearInterval(this._timer);
      this.readyState = 4;
      this._emit("abort");
    }
    _finish(status) {
      clearInterval(this._timer);
      this.status = status;
      this.readyState = 4;
      this._emit("load");
    }
    _simulateUpload(form) {
      const destPath = form.get("path") || "";
      const file = form.get("files[]");
      const total = file ? file.size : 0;
      if (!state.config.device) { setTimeout(() => this._finish(503), 100); return; }
      if (state.offline) { setTimeout(() => this._finish(502), 300); return; }

      const duration = transferMs(total);
      const started = performance.now();
      this._timer = setInterval(() => {
        if (this._aborted) return;
        const f = Math.min(1, (performance.now() - started) / duration);
        this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: Math.round(total * f), total }));
        if (f < 1) return;
        clearInterval(this._timer);
        // Player went away mid-transfer: this file fails, like the real thing.
        if (state.offline) { this._finish(502); return; }
        const destDir = devNode(destPath);
        if (!destDir || !destDir.d || destPath === ROOT) { this._finish(500); return; }
        // The firmware answers 200 but silently drops disallowed types.
        if (file && VALID_TYPES.includes(extOf(file.name))) {
          destDir.c[file.name] = { s: file.size, t: nowSec() };
          save();
        }
        this._finish(200);
      }, 90);
    }
  }
  window.XMLHttpRequest = DemoXHR;

  // ---------------------------------------------------------------------
  // Downloads. app.js starts them with `window.location = "download?..."`,
  // which can't be intercepted and would navigate the demo away. A
  // capture-phase listener catches the Download button first and shows a
  // toast instead. (toast() is a global function in app.js.)
  // ---------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest('button[title="Download"]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (typeof window.toast === "function") {
      window.toast("Downloads are turned off in the demo. Only file names and sizes are kept, not the files themselves.");
    }
  }, true);

  // ---------------------------------------------------------------------
  // scrollIntoView() from inside an iframe also scrolls the page around it,
  // so the website would jump every time the transfer dock adds a row.
  // Inside the demo it only scrolls the element's own scroll container.
  // ---------------------------------------------------------------------
  Element.prototype.scrollIntoView = function () {
    let box = this.parentElement;
    while (box && box !== document.body) {
      const oy = getComputedStyle(box).overflowY;
      if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    if (!box || box === document.body) return;
    const r = this.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
    else if (r.top < b.top) box.scrollTop -= b.top - r.top;
  };

  // ---------------------------------------------------------------------
  // Controls for the page hosting the demo (see demo-host.js).
  // ---------------------------------------------------------------------
  window.__shanlingDemo = {
    isOffline: () => !!state.offline,
    setOffline(v) { state.offline = !!v; save(); },
    reset() {
      clearTimeout(saveTimer);
      try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      state = seed();
    },
  };
})();
