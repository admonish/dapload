"use strict";

// Matches the device's own firmware config (js/index.js on the device).
const ROOT = "/mnt/";
const HOME = "/mnt/mmc/";
const DEVICE_NAME = "Shanling M1 Plus";
const VALID_TYPES = ["ISO","DFF","DSF","APE","FLAC","AIF","AIFF","WAV","M4A","AAC","MP2","AC3","DTS",
  "MP3","OGG","WMA","CUE","M3U","M3U8","PNG","JPG","JPEG","LRC","BIN"];

const AUDIO_EXT = new Set(["ISO","DFF","DSF","APE","FLAC","AIF","AIFF","WAV","M4A","AAC","MP2","AC3","DTS","MP3","OGG","WMA"]);
const IMAGE_EXT = new Set(["PNG","JPG","JPEG"]);

// ---------- state ----------
let currentPath = HOME;
let currentEntries = [];
let selected = new Set();
let sortMode = localStorage.getItem("sortMode") || "date-desc";
let filterText = "";

// ---------- dom ----------
const $ = (sel) => document.querySelector(sel);
const breadcrumbEl = $("#breadcrumb");
const listingEl = $("#listing");
const emptyStateEl = $("#empty-state");
const bulkBar = $("#bulk-bar");
const bulkCount = $("#bulk-count");
const uploadPanel = $("#upload-panel");
const uploadPanelHeader = $("#upload-panel-header");
const uploadProgressTrack = $("#upload-progress-track");
const uploadProgressFill = $("#upload-progress-fill");
const uploadList = $("#upload-list");
const toastContainer = $("#toast-container");
const dropOverlay = $("#drop-overlay");
const filterInput = $("#filter-input");
const sortSelect = $("#sort-select");
const usageText = $("#usage-text");
const usageRefreshBtn = $("#usage-refresh");
const usageBadge = $("#usage-badge");
const appMain = $("#app-main");
const offlineState = $("#offline-state");
const offlineRetryBtn = $("#offline-retry");
const deviceInput = $("#device-input");
const addLibraryBtn = $("#add-library-btn");

sortSelect.value = sortMode;

// ---------- helpers ----------
function isHome(path) { return path === HOME; }
function isRoot(path) { return path === ROOT; }

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "";
}

function isValidFileType(name) {
  return VALID_TYPES.includes(extOf(name));
}

// Stroke icons on a 24x24 grid. <svg data-icon="name"> placeholders in the
// HTML are filled in by hydrateIcons(); svgIcon() makes new ones.
const FOLDER_PATH = "M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.2h8.7A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z";
const ICONS = {
  folder: FOLDER_PATH,
  note: "M9 18V6l11-2v12 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
  image: "M4 5h16v14H4z M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 17 M16.5 9.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0",
  text: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12.5h7 M9 16h7",
  playlist: "M4 6h13 M4 11h13 M4 16h7 M19 19V12l2-.6 M19 19a2 2 0 1 1-4 0a2 2 0 1 1 4 0",
  file: "M6 3h9l4 4v14H6z M14 3v5h5",
  up: "M12 19V5 M6 11l6-6 6 6",
  upload: "M12 15V4 M7 9l5-5 5 5 M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
  folderUpload: FOLDER_PATH + " M12 17v-6 M9.5 13.5 12 11l2.5 2.5",
  folderPlus: FOLDER_PATH + " M12 11v6 M9 14h6",
  library: "M12 21a9 9 0 1 1 0-18a9 9 0 1 1 0 18z M12 14.5a2.5 2.5 0 1 1 0-5a2.5 2.5 0 1 1 0 5z",
  nas: "M4 4h16v7H4z M4 13h16v7H4z M8 7.5h.01 M8 16.5h.01 M12 7.5h4 M12 16.5h4",
  search: "M11 18a7 7 0 1 1 0-14a7 7 0 1 1 0 14z M20 20l-4-4",
  sort: "M7 4v16 M4 17l3 3 3-3 M13 6h7 M13 11h5 M13 16h3",
  settings: "M4 7h9 M19 7h1 M4 17h3 M13 17h7 M18 7a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M12 17a2 2 0 1 1-4 0a2 2 0 1 1 4 0",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  sun: "M12 16a4 4 0 1 1 0-8a4 4 0 1 1 0 8z M12 2.5v2 M12 19.5v2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M2.5 12h2 M19.5 12h2 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4",
  refresh: "M20 12a8 8 0 1 1-2.34-5.66 M20 4v4h-4",
  download: "M12 4v11 M7 10l5 5 5-5 M4 20h16",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5",
  x: "M6 6l12 12 M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  skip: "M12 21a9 9 0 1 1 0-18a9 9 0 1 1 0 18z M8 12h8",
  alert: "M12 3.5l9 16H3z M12 10v4 M12 17h.01",
  device: "M7.5 2.5h9A1.5 1.5 0 0 1 18 4v16a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V4A1.5 1.5 0 0 1 7.5 2.5z M9 5.5h6v5H9z M14.5 16.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0",
  chevron: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
  coffee: "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 11h1.5a2.5 2.5 0 0 1 0 5H17 M8 3.5v2.5 M12.5 3.5v2.5",
};
const SVG_NS = "http://www.w3.org/2000/svg";

function setIcon(svg, name) {
  svg.dataset.icon = name;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  let path = svg.firstElementChild;
  if (!path) { path = document.createElementNS(SVG_NS, "path"); svg.appendChild(path); }
  path.setAttribute("d", ICONS[name]);
}

function svgIcon(name, className) {
  const svg = document.createElementNS(SVG_NS, "svg");
  if (className) svg.setAttribute("class", className);
  setIcon(svg, name);
  return svg;
}

document.querySelectorAll("svg[data-icon]").forEach((svg) => setIcon(svg, svg.dataset.icon));

function iconFor(entry) {
  if (entry.size == null) return "folder";
  const ext = extOf(entry.name);
  if (AUDIO_EXT.has(ext)) return "note";
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === "LRC") return "text";
  if (["CUE", "M3U", "M3U8"].includes(ext)) return "playlist";
  return "file";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes >= 0x40000000) return (bytes / 0x40000000).toFixed(2) + " GB";
  if (bytes >= 0x100000) return (bytes / 0x100000).toFixed(2) + " MB";
  if (bytes >= 0x400) return (bytes / 0x400).toFixed(2) + " KB";
  return bytes + " B";
}

function formatDate(ctime) {
  const n = Number(ctime);
  if (!n) return "";
  const d = new Date(n * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function toast(message, isError) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3500);
}

function setTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  setIcon($("#theme-icon"), dark ? "sun" : "moon");
  localStorage.setItem("theme", dark ? "dark" : "light");
}
const savedTheme = localStorage.getItem("theme")
  || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
setTheme(savedTheme === "dark");
$("#theme-toggle").addEventListener("click", () => {
  setTheme(!document.documentElement.classList.contains("dark"));
});

// ---------- modal (replaces confirm()/prompt()) ----------
function modal({ title, bodyHtml, confirmLabel = "OK", danger = false, onConfirm, focusSelector }) {
  const backdrop = $("#modal-backdrop");
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = bodyHtml;
  const confirmBtn = $("#modal-confirm");
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className = "btn " + (danger ? "btn-danger" : "btn-primary");
  backdrop.classList.remove("hidden");

  const close = () => {
    backdrop.classList.add("hidden");
    confirmBtn.removeEventListener("click", onOk);
    $("#modal-cancel").removeEventListener("click", onCancel);
    backdrop.removeEventListener("keydown", onKey);
  };
  const onOk = () => { close(); onConfirm && onConfirm(); };
  const onCancel = () => close();
  const onKey = (e) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && document.activeElement.tagName !== "TEXTAREA") onOk();
  };
  confirmBtn.addEventListener("click", onOk);
  $("#modal-cancel").addEventListener("click", onCancel);
  backdrop.addEventListener("keydown", onKey);

  if (focusSelector) {
    setTimeout(() => {
      const f = $(focusSelector);
      if (f) { f.focus(); f.select && f.select(); }
    }, 0);
  }
}

// ---------- config ----------
// Served by the proxy: { device: "host:port" | null, library: {...} | null,
// libraryEditable, smbAvailable }. library is a LIBRARY_DIR folder (type
// "local", fixed on the server) or an SMB share connected from the UI.
let config = { device: null, library: null, libraryEditable: false, smbAvailable: false };

function applyConfig() {
  const lib = config.library;
  const libLabel = lib ? `Add from ${lib.name}` : "Add from library";
  addLibraryBtn.querySelector(".label").textContent = libLabel;
  addLibraryBtn.title = libLabel;
  $("#library-modal-title").textContent = libLabel;
  $("#library-settings-btn").classList.toggle("hidden", !config.libraryEditable);
  deviceInput.value = config.device || "";
  $("#offline-title").textContent = config.device ? `Can’t reach your ${DEVICE_NAME}` : `Connect your ${DEVICE_NAME}`;
  $("#offline-reachable-msg").classList.toggle("hidden", !config.device);
  $("#offline-setup-msg").classList.toggle("hidden", !!config.device);
  $("#offline-hint").classList.toggle("hidden", !config.device);
  $("#offline-status").textContent = config.device ? "NO SIGNAL" : "NO DEVICE SET";
  $("#offline-address").textContent = config.device || "—";
  $("#offline-led").classList.toggle("err", !!config.device);
  // Nothing to retry until an address is entered, so Save is the main action then.
  offlineRetryBtn.classList.toggle("hidden", !config.device);
  $("#device-save").classList.toggle("btn-primary", !config.device);
}

async function loadConfig() {
  try {
    const res = await fetch("config");
    if (res.ok) config = await res.json();
  } catch (e) {
    // proxy unreachable -- refresh() will show the offline screen
  }
  applyConfig();
}

async function saveDeviceAddress(address) {
  const res = await fetch("config", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams({ device: address }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(`Could not save address: ${data.error || "HTTP " + res.status}`, true);
    return;
  }
  config = data;
  applyConfig();
  toast(`Device address set to ${config.device}`);
  const wasOnline = deviceOnline;
  currentPath = HOME;
  selected.clear();
  await refresh();
  if (wasOnline && deviceOnline) loadUsage(false);
}

$("#device-form").addEventListener("submit", (e) => {
  e.preventDefault();
  saveDeviceAddress(deviceInput.value);
});

$("#settings-btn").addEventListener("click", () => {
  modal({
    title: "Device address",
    bodyHtml: `Shown on the player's WiFi Transfer screen.<input type="text" id="settings-device-input" class="input mono" placeholder="e.g. 192.168.1.23:8888" spellcheck="false">
      <div class="about">Dapload is made by Thomas. Free and ad-free. If it's worth something to you, you can <a href="${SUPPORT_URL}" target="_blank" rel="noopener">buy me a coffee</a>.<br>Unofficial. Not affiliated with or endorsed by Shanling.</div>`,
    confirmLabel: "Save",
    focusSelector: "#settings-device-input",
    onConfirm: () => saveDeviceAddress($("#settings-device-input").value),
  });
  $("#settings-device-input").value = config.device || "";
});

// ---------- API ----------
async function apiList(path) {
  const res = await fetch("list?path=" + encodeURIComponent(path));
  if (!res.ok) {
    const err = new Error("HTTP " + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function apiForm(url, data) {
  const params = new URLSearchParams(data);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res;
}

function apiUpload(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("path", path);
    form.append("files[]", file, file.name);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("HTTP " + xhr.status));
    });
    xhr.addEventListener("error", () => reject(new Error("network error")));
    xhr.addEventListener("abort", () => reject(new Error("abort")));

    xhr.open("POST", "upload");
    xhr.send(form);
    onProgress.xhr = xhr;
  });
}

// ---------- breadcrumb ----------
// Renders the ancestors of the current folder (each followed by a chevron);
// the current folder itself is the page title. Also used by the library
// browser, which shows the current folder as the last crumb instead.
function renderCrumbs(el, crumbs, onClick, includeCurrent) {
  el.innerHTML = "";
  const shown = includeCurrent ? crumbs : crumbs.slice(0, -1);
  shown.forEach(({ label, path }, i) => {
    if (i > 0) el.appendChild(svgIcon("chevron", "sep"));
    const isCurrent = includeCurrent && i === shown.length - 1;
    const node = document.createElement(isCurrent ? "span" : "a");
    node.textContent = label;
    if (isCurrent) node.className = "current";
    else node.addEventListener("click", () => onClick(path));
    el.appendChild(node);
  });
  if (!includeCurrent && shown.length) el.appendChild(svgIcon("chevron", "sep"));
}

function renderBreadcrumb() {
  const crumbs = [{ label: DEVICE_NAME, path: HOME }];
  let acc = HOME;
  for (const part of currentPath.slice(HOME.length).split("/").filter(Boolean)) {
    acc += part + "/";
    crumbs.push({ label: part, path: acc });
  }
  renderCrumbs(breadcrumbEl, crumbs, navigate, false);
  const title = crumbs[crumbs.length - 1].label;
  $("#folder-title").textContent = title;
  $("#drop-target").textContent = "→ " + title;
  $("#up-btn").disabled = isHome(currentPath);
}

// ---------- listing ----------
function applyFilterSort(entries) {
  let out = entries;
  if (filterText) {
    const f = filterText.toLowerCase();
    out = out.filter((e) => e.name.toLowerCase().includes(f));
  }
  const [key, dir] = sortMode.split("-");
  const mult = dir === "asc" ? 1 : -1;
  out = out.slice().sort((a, b) => {
    if (key === "name") return mult * a.name.localeCompare(b.name);
    if (key === "size") {
      const as = a.size == null ? -1 : a.size, bs = b.size == null ? -1 : b.size;
      return mult * (as - bs);
    }
    return mult * (Number(a.ctime) - Number(b.ctime));
  });
  return out;
}

let visibleEntries = [];

function renderListing() {
  const entries = applyFilterSort(currentEntries);
  visibleEntries = entries;
  listingEl.innerHTML = "";
  emptyStateEl.classList.toggle("hidden", entries.length > 0);
  listingEl.classList.toggle("hidden", entries.length === 0);
  const empty = currentEntries.length === 0;
  $("#empty-title").textContent = empty ? "This folder is empty." : `Nothing matches “${filterText}”.`;
  $("#empty-hint").classList.toggle("hidden", !empty);

  const total = currentEntries.length;
  const noun = (n) => n + (n === 1 ? " item" : " items");
  $("#folder-count").textContent = filterText ? `${entries.length} of ${noun(total)}` : noun(total);

  const width = Math.max(2, String(entries.length).length);
  entries.forEach((entry, i) => {
    listingEl.appendChild(renderRow(entry, String(i + 1).padStart(width, "0")));
  });
  updateBulkBar();
}

function renderRow(entry, number) {
  const row = document.createElement("div");
  const isFolder = entry.size == null;
  const home = isHome(entry.path);
  row.className = "row grid-row" + (isFolder ? " folder" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "checkbox";
  checkbox.title = "Select";
  checkbox.style.visibility = home ? "hidden" : "visible";
  checkbox.checked = selected.has(entry.path);
  row.classList.toggle("selected", checkbox.checked);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selected.add(entry.path); else selected.delete(entry.path);
    row.classList.toggle("selected", checkbox.checked);
    updateBulkBar();
  });

  const n = document.createElement("span");
  n.className = "n";
  n.textContent = number;

  const nameCell = document.createElement("div");
  nameCell.className = "name-cell";
  const nameEl = document.createElement("span");
  nameEl.className = "name";
  nameEl.textContent = entry.name;
  nameEl.title = entry.name;
  const sub = document.createElement("span");
  sub.className = "sub";
  sub.textContent = [isFolder ? "" : formatSize(entry.size), formatDate(entry.ctime)].filter(Boolean).join(" · ");
  nameCell.append(nameEl, sub);

  const size = document.createElement("span");
  size.className = "size";
  size.textContent = isFolder ? "" : formatSize(entry.size);

  const date = document.createElement("span");
  date.className = "date";
  date.textContent = formatDate(entry.ctime);

  const actions = document.createElement("span");
  actions.className = "actions";

  if (isFolder) {
    // The whole row opens the folder (except its checkbox and buttons).
    row.tabIndex = 0;
    row.addEventListener("click", (e) => {
      if (!e.target.closest("input, button")) navigate(entry.path);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target === row) navigate(entry.path);
    });
  } else {
    const dl = document.createElement("button");
    dl.title = "Download";
    dl.appendChild(svgIcon("download"));
    dl.addEventListener("click", () => {
      window.location = "download?path=" + encodeURIComponent(entry.path);
    });
    actions.appendChild(dl);
  }

  if (!home) {
    const del = document.createElement("button");
    del.className = "delete-btn";
    del.title = "Delete";
    del.appendChild(svgIcon("trash"));
    del.addEventListener("click", () => confirmDelete([entry]));
    actions.appendChild(del);
  }

  row.append(checkbox, n, svgIcon(iconFor(entry), "icon"), nameCell, size, date, actions);
  return row;
}

function selectableVisible() {
  return visibleEntries.filter((e) => !isHome(e.path));
}

function updateBulkBar() {
  const any = selected.size > 0;
  bulkBar.classList.toggle("hidden", !any);
  $("#list-head").classList.toggle("hidden", any || visibleEntries.length === 0);
  bulkCount.textContent = `${selected.size} selected`;
  const selectable = selectableVisible();
  const all = selectable.length > 0 && selectable.every((e) => selected.has(e.path));
  for (const box of [$("#select-all"), $("#bulk-all")]) {
    box.checked = all;
    box.indeterminate = any && !all;
  }
}

function onSelectAll(e) {
  if (e.target.checked) selectableVisible().forEach((entry) => selected.add(entry.path));
  else selected.clear();
  renderListing();
}
$("#select-all").addEventListener("change", onSelectAll);
$("#bulk-all").addEventListener("change", onSelectAll);

function confirmDelete(entries) {
  const MAX_SHOWN = 12;
  const names = entries.slice(0, MAX_SHOWN).map((e) => escapeHtml(e.name)).join("<br>")
    + (entries.length > MAX_SHOWN ? `<br>+${entries.length - MAX_SHOWN} more` : "");
  modal({
    title: "Delete " + (entries.length > 1 ? `${entries.length} items` : `"${entries[0].name}"`),
    bodyHtml: `This can't be undone.<div class="name-well">${names}</div>`,
    confirmLabel: "Delete",
    danger: true,
    onConfirm: async () => {
      let failed = 0;
      for (const entry of entries) {
        try {
          await apiForm("delete", { path: entry.path });
          selected.delete(entry.path);
        } catch (e) {
          failed++;
        }
      }
      if (failed) toast(`Failed to delete ${failed} item(s)`, true);
      else toast("Deleted");
      await refresh();
      loadUsage(true);
    },
  });
}

// ---------- navigation ----------
async function navigate(path) {
  currentPath = path;
  selected.clear();
  filterInput.value = "";
  filterText = "";
  await refresh();
}

// The device only runs its web server while "WiFi Transfer" is open on
// screen, so being unreachable is a normal, common state, not an error to
// just toast over. The proxy reports that specific case as HTTP 502, and
// 503 when no device address has been entered yet; a missing status means
// fetch() itself failed (e.g. the proxy is down). Anything else means the
// device answered, so it's just a plain error.
let deviceOnline = false;
let offlineRetryTimer = null;

function setDeviceOnline(online) {
  const wasOffline = !deviceOnline;
  deviceOnline = online;
  appMain.classList.toggle("hidden", !online);
  offlineState.classList.toggle("hidden", online);
  usageBadge.classList.toggle("hidden", !online);

  if (online) {
    if (offlineRetryTimer) { clearInterval(offlineRetryTimer); offlineRetryTimer = null; }
    if (wasOffline) loadUsage(false);
  } else if (!offlineRetryTimer) {
    offlineRetryTimer = setInterval(refresh, 5000);
  }
}

async function refresh() {
  try {
    const data = await apiList(currentPath);
    currentEntries = data || [];
    setDeviceOnline(true);
    renderBreadcrumb();
    renderListing();
  } catch (e) {
    if (e.status === 502 || e.status === 503 || e.status === undefined) {
      setDeviceOnline(false);
    } else {
      toast(`Could not load "${currentPath}": ${e.message}`, true);
    }
  }
}

$("#refresh-btn").addEventListener("click", refresh);
offlineRetryBtn.addEventListener("click", refresh);

// The device has no capacity/free-space endpoint at all -- this is only an
// approximation of space USED, computed by the proxy recursively summing
// /list results. It cannot report free or total capacity.
async function loadUsage(force) {
  usageRefreshBtn.classList.add("spinning");
  try {
    const url = "usage?path=" + encodeURIComponent(HOME) + (force ? "&force=1" : "");
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    usageText.textContent = `≈ ${formatSize(data.totalBytes)} used`;
    $("#usage-files").textContent = `${data.fileCount.toLocaleString()} files`;
    const when = new Date(data.computedAt * 1000).toLocaleTimeString();
    usageBadge.title = `Approximate space used on the device, calculated by summing file sizes under ${HOME}. `
      + `This is NOT free or total card capacity -- the device doesn't expose that. Last calculated ${when}.`;
  } catch (e) {
    usageText.textContent = "Usage unavailable";
    $("#usage-files").textContent = "";
    usageBadge.title = e.message;
  } finally {
    usageRefreshBtn.classList.remove("spinning");
  }
}
usageRefreshBtn.addEventListener("click", () => loadUsage(true));

$("#up-btn").addEventListener("click", () => {
  if (isHome(currentPath)) { toast("Already at the top level"); return; }
  const trimmed = currentPath.slice(0, -1);
  const parent = trimmed.slice(0, trimmed.lastIndexOf("/") + 1);
  navigate(parent);
});

filterInput.addEventListener("input", () => {
  filterText = filterInput.value;
  renderListing();
});

sortSelect.addEventListener("change", () => {
  sortMode = sortSelect.value;
  localStorage.setItem("sortMode", sortMode);
  renderListing();
});

$("#bulk-clear-btn").addEventListener("click", () => { selected.clear(); renderListing(); });
$("#bulk-delete-btn").addEventListener("click", () => {
  const entries = currentEntries.filter((e) => selected.has(e.path));
  if (entries.length) confirmDelete(entries);
});

// ---------- new folder ----------
$("#new-folder-btn").addEventListener("click", () => {
  if (isRoot(currentPath)) { toast("No permission to create folders here", true); return; }
  modal({
    title: "New folder",
    bodyHtml: `<input type="text" id="new-folder-input" value="New Folder">`,
    confirmLabel: "Create",
    focusSelector: "#new-folder-input",
    onConfirm: async () => {
      const name = $("#new-folder-input").value.trim();
      if (!name) return;
      try {
        await apiForm("create", { path: currentPath + name });
        toast(`Created "${name}"`);
        await refresh();
      } catch (e) {
        toast(`Could not create "${name}": ${e.message}`, true);
      }
    },
  });
});

// ---------- uploads ----------
const JUNK_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
function isJunkFile(name) {
  return JUNK_NAMES.has(name) || name.startsWith("._");
}

// Cache of {parentPath: Set(existing folder names)} so a folder-tree upload
// doesn't re-list the same parent for every file inside it.
const dirChildrenCache = new Map();

// Creates fullPath (and any missing ancestors under currentPath) one level
// at a time -- the device's /create does not create parent directories,
// and re-creating an existing folder makes it drop the connection instead
// of erroring cleanly, so existence is checked via /list first.
async function ensureDir(fullPath) {
  if (fullPath === HOME || fullPath === currentPath) return;
  const trimmed = fullPath.slice(0, -1);
  const parent = trimmed.slice(0, trimmed.lastIndexOf("/") + 1);
  const name = trimmed.slice(parent.length);
  await ensureDir(parent);

  let siblings = dirChildrenCache.get(parent);
  if (!siblings) {
    const entries = await apiList(parent);
    siblings = new Set(entries.filter((e) => e.size == null).map((e) => e.name));
    dirChildrenCache.set(parent, siblings);
  }
  if (siblings.has(name)) return;

  await apiForm("create", { path: trimmed });
  siblings.add(name);
}

// Covers the whole span of a transferEntries() call, including directory
// creation and the gaps between files -- not just moments a byte transfer
// is literally in flight -- so the beforeunload guard can't miss a window.
let transfersInProgress = 0;

// Cache of {destDir: Map(filename -> size)} used to skip files that are
// already at the destination -- makes an interrupted or re-run batch cheap
// to resume instead of re-transferring everything from scratch.
const destFilesCache = new Map();
async function alreadyAtDestination(destDir, filename, size) {
  let files = destFilesCache.get(destDir);
  if (!files) {
    const entries = await apiList(destDir);
    files = new Map(entries.filter((e) => e.size != null).map((e) => [e.name, Number(e.size)]));
    destFilesCache.set(destDir, files);
  }
  return files.has(filename) && files.get(filename) === size;
}

// ---------- support prompt ----------
// One quiet line in the dock after a batch that transferred something, at
// most once per session. Dismissing it hides it for 30 days. It never
// blocks anything; see the shared support-model guidelines.
const SUPPORT_URL = "https://ko-fi.com/thomasjohnsrud";
const SUPPORT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function supportPromptDue() {
  if (sessionStorage.getItem("supportShown")) return false;
  return Date.now() > Number(localStorage.getItem("supportDismissedUntil") || 0);
}

function showSupportPrompt() {
  sessionStorage.setItem("supportShown", "1");
  $("#dock-support").classList.remove("hidden");
}

$("#dock-support-dismiss").addEventListener("click", () => {
  localStorage.setItem("supportDismissedUntil", String(Date.now() + SUPPORT_SNOOZE_MS));
  $("#dock-support").classList.add("hidden");
});

// ---------- transfer dock ----------
// One dock for all transfers. It's reset when a batch starts while nothing
// else is running; rows of finished files stay listed until then.
const SEGMENT_LIMIT = 40; // up to this many files, the progress bar has one segment per file
let dockStats = null;
let dockHideTimer = null;

function resetDock(total, iconName) {
  clearTimeout(dockHideTimer);
  uploadList.innerHTML = "";
  setIcon($("#dock-icon"), iconName);
  $("#dock-close").classList.add("hidden");
  $("#dock-toggle").classList.remove("hidden");
  $("#dock-support").classList.add("hidden");
  uploadPanel.classList.remove("hidden");
  dockStats = { total, transferred: 0, skipped: 0, failed: 0 };
  const segmented = total <= SEGMENT_LIMIT;
  uploadProgressTrack.classList.toggle("segmented", segmented);
  uploadProgressTrack.querySelectorAll(".seg").forEach((el) => el.remove());
  if (segmented) {
    for (let i = 0; i < total; i++) {
      const seg = document.createElement("span");
      seg.className = "seg";
      uploadProgressTrack.appendChild(seg);
    }
  }
  setUploadProgress(0, total);
  updateDockSummary();
  syncDockHeight();
}

function setUploadHeader(text, current) {
  uploadPanelHeader.textContent = text;
  $("#upload-current").textContent = current || "";
}
function setUploadProgress(done, total) {
  uploadProgressFill.style.width = (total ? (done / total) * 100 : 0) + "%";
}
function setSegment(index, state) {
  const seg = uploadProgressTrack.querySelectorAll(".seg")[index];
  if (seg) seg.className = "seg " + state;
}
function updateDockSummary() {
  const parts = [];
  if (dockStats.skipped) parts.push(`${dockStats.skipped} skipped`);
  if (dockStats.failed) parts.push(`${dockStats.failed} failed`);
  $("#upload-summary").textContent = parts.join(" · ");
}

// Keeps toasts above the dock.
function syncDockHeight() {
  const h = uploadPanel.classList.contains("hidden") ? 0 : uploadPanel.offsetHeight;
  document.documentElement.style.setProperty("--dock-h", h + "px");
}
if (window.ResizeObserver) new ResizeObserver(syncDockHeight).observe(uploadPanel);

function hideDock() {
  clearTimeout(dockHideTimer);
  uploadPanel.classList.add("hidden");
  syncDockHeight();
}

$("#dock-toggle").addEventListener("click", () => {
  const collapsed = uploadPanel.classList.toggle("collapsed");
  $("#dock-toggle").title = collapsed ? "Show files" : "Collapse";
});
$("#dock-close").addEventListener("click", hideDock);

const TRANSFER_ICONS = { active: "refresh", done: "check", skip: "skip", fail: "alert" };

// A row in the dock's file list. status holds the state text and, for
// uploads, a progress bar and Cancel button.
function transferRow(label) {
  const row = document.createElement("div");
  const icon = svgIcon("refresh");
  const name = document.createElement("span");
  name.className = "label";
  name.textContent = label;
  name.title = label;
  const status = document.createElement("span");
  status.className = "status";
  row.append(icon, name, status);
  uploadList.appendChild(row);
  const setState = (state, text) => {
    row.className = "transfer-row " + state;
    setIcon(icon, TRANSFER_ICONS[state]);
    status.textContent = text;
  };
  setState("active", "");
  row.scrollIntoView({ block: "nearest" });
  return { row, status, setState };
}

// Shared by local-file uploads and library copies: recreates the folder
// structure implied by each entry's relativePath, skips anything already
// present at the destination, then hands the rest to transferOne(entry,
// destPath) to actually move the bytes. entries: [{name, relativePath,
// size, ...}] where relativePath may contain "/" for items that came from
// a dropped/selected/library folder.
async function transferEntries(entries, transferOne, iconName) {
  if (isRoot(currentPath)) { toast("No permission to upload here", true); return; }
  if (!entries.length) return;

  const notJunk = entries.filter((e) => !isJunkFile(e.name));
  const invalid = [];
  const accepted = [];
  for (const e of notJunk) {
    if (isValidFileType(e.name)) accepted.push(e);
    else invalid.push(e.name);
  }
  if (invalid.length) {
    const shown = invalid.slice(0, 3).join(", ") + (invalid.length > 3 ? `, +${invalid.length - 3} more` : "");
    toast(`Unsupported file type: ${shown}`, true);
  }
  if (!accepted.length) return;

  if (transfersInProgress === 0) resetDock(accepted.length, iconName);
  else uploadProgressTrack.classList.remove("segmented"); // segments can't show two overlapping batches
  transfersInProgress++;
  let failed = 0;
  try {
    destFilesCache.clear();

    const total = accepted.length;
    setUploadHeader(`Transferring 0 of ${total}`, "Preparing folders…");

    const dirsNeeded = new Set();
    for (const { relativePath } of accepted) {
      const parts = relativePath.split("/");
      parts.pop();
      let acc = "";
      for (const part of parts) {
        acc += part + "/";
        dirsNeeded.add(acc);
      }
    }
    const sortedDirs = Array.from(dirsNeeded).sort((a, b) => {
      const depthDiff = a.split("/").length - b.split("/").length;
      return depthDiff !== 0 ? depthDiff : a.localeCompare(b);
    });
    for (const rel of sortedDirs) {
      try {
        await ensureDir(currentPath + rel);
      } catch (e) {
        toast(`Could not create folder "${rel}": ${e.message}`, true);
      }
    }
    dirChildrenCache.clear();

    let done = 0;
    let skipped = 0;
    for (const entry of accepted) {
      const slash = entry.relativePath.lastIndexOf("/");
      const destPath = slash >= 0 ? currentPath + entry.relativePath.slice(0, slash + 1) : currentPath;
      const index = done;

      if (entry.size != null && await alreadyAtDestination(destPath, entry.name, entry.size)) {
        skipped++;
        dockStats.skipped++;
        transferRow(entry.relativePath).setState("skip", "Already on device");
        setSegment(index, "skip");
      } else {
        setUploadHeader(`Transferring ${done + 1} of ${total}`, entry.relativePath);
        setSegment(index, "active");
        const ok = await transferOne(entry, destPath);
        if (ok) dockStats.transferred++;
        else { failed++; dockStats.failed++; }
        setSegment(index, ok ? "done" : "fail");
      }
      updateDockSummary();
      done++;
      setUploadProgress(done, total);
    }

    const moved = total - skipped - failed;
    setUploadHeader(`Done — ${moved} transferred${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} failed` : ""}`);
    if (skipped) toast(`Skipped ${skipped} file(s) already on the device`);
    if (moved > 0) loadUsage(true);
  } finally {
    transfersInProgress--;
    if (transfersInProgress === 0) {
      $("#upload-current").textContent = "";
      $("#dock-toggle").classList.add("hidden");
      $("#dock-close").classList.remove("hidden");
      // Failures stay on screen until dismissed. The support line gets a
      // little longer so it can be read.
      if (!dockStats.failed) {
        const prompt = dockStats.transferred > 0 && supportPromptDue();
        if (prompt) showSupportPrompt();
        dockHideTimer = setTimeout(hideDock, prompt ? 12000 : 4000);
      }
    }
  }
}

function processUploadEntries(entries) {
  const items = entries.map(({ file, relativePath }) => ({ file, relativePath, name: file.name, size: file.size }));
  return transferEntries(items, (item, destPath) => uploadOne(item.file, destPath, item.relativePath), "upload");
}

function processLibraryEntries(entries) {
  return transferEntries(entries, (item, destPath) => copyFromLibrary(item.srcRel, destPath, item.relativePath), "library");
}

function queueUploads(fileList) {
  processUploadEntries(Array.from(fileList).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })));
}

// Recursively walks entries from a drag-and-drop DataTransferItemList,
// preserving folder structure. Falls back to flat files if the browser
// doesn't support the (non-standard but widely implemented) entries API.
async function collectDroppedEntries(items) {
  const withEntries = Array.from(items)
    .filter((it) => it.kind === "file")
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null));

  if (withEntries.some((e) => e == null)) {
    return Array.from(items)
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter(Boolean)
      .map((file) => ({ file, relativePath: file.name }));
  }

  const results = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      results.push({ file, relativePath: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, prefix + entry.name + "/");
      } while (batch.length > 0);
    }
  }
  for (const entry of withEntries) {
    if (entry) await walk(entry, "");
  }
  return results;
}

// Both return true on success so transferEntries() can count failures.
async function uploadOne(file, destPath, label) {
  destPath = destPath || currentPath;
  const { status, setState } = transferRow(label || file.name);
  const track = document.createElement("span");
  track.className = "bar-track";
  const fill = document.createElement("span");
  fill.className = "bar-fill";
  track.appendChild(fill);
  const pct = document.createElement("span");
  pct.textContent = "0%";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel-btn";
  cancelBtn.textContent = "Cancel";
  status.append(track, pct, cancelBtn);

  const onProgress = (fraction) => {
    const p = Math.round(fraction * 100);
    fill.style.width = p + "%";
    pct.textContent = p + "%";
  };

  cancelBtn.addEventListener("click", () => onProgress.xhr && onProgress.xhr.abort());

  try {
    await apiUpload(destPath, file, onProgress);
    setState("done", "Done");
    await refresh();
    return true;
  } catch (e) {
    setState("fail", e.message === "abort" ? "Cancelled" : "Failed");
    if (e.message !== "abort") toast(`Failed to upload "${file.name}": ${e.message}`, true);
    return false;
  }
}

// Asks the proxy to copy a file straight from the library folder to the device
// (server-to-device, doesn't pass through the browser). There's no
// byte-level progress for this -- it's one request/response -- so the row
// just shows a "Copying..." state until it resolves.
async function copyFromLibrary(srcRel, destPath, label) {
  const { setState } = transferRow(label);
  setState("active", "Copying…");
  try {
    await apiForm("library/push", { src: srcRel, dest: destPath });
    setState("done", "Done");
    await refresh();
    return true;
  } catch (e) {
    setState("fail", "Failed");
    toast(`Could not copy "${label}": ${e.message}`, true);
    return false;
  }
}

// A page reload aborts any in-flight upload/copy loop -- warn before that
// happens instead of letting a transfer silently die mid-batch.
window.addEventListener("beforeunload", (e) => {
  if (transfersInProgress > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});

$("#upload-btn").addEventListener("click", () => $("#file-input").click());
$("#file-input").addEventListener("change", (e) => {
  queueUploads(e.target.files);
  e.target.value = "";
});

$("#upload-folder-btn").addEventListener("click", () => $("#folder-input").click());
$("#folder-input").addEventListener("change", (e) => {
  queueUploads(e.target.files);
  e.target.value = "";
});

// drag & drop anywhere on the page -- supports whole folders being dropped
let dragCounter = 0;
window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer.types.includes("Files")) return;
  dragCounter++;
  dropOverlay.classList.add("active");
});
window.addEventListener("dragleave", () => {
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove("active"); }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove("active");
  if (!e.dataTransfer.items || !e.dataTransfer.items.length) return;
  const entries = await collectDroppedEntries(e.dataTransfer.items);
  await processUploadEntries(entries);
});

// ---------- library browser ----------
let libraryPath = "";
let libraryEntries = [];
let librarySelected = new Map(); // path -> entry

async function apiLibraryList(relPath) {
  const res = await fetch("library/list?path=" + encodeURIComponent(relPath));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "HTTP " + res.status);
  }
  return res.json();
}

function openLibraryModal() {
  librarySelected.clear();
  updateLibrarySelectedCount();
  $("#library-modal-backdrop").classList.remove("hidden");
  navigateLibrary("");
}

function closeLibraryModal() {
  $("#library-modal-backdrop").classList.add("hidden");
}

async function navigateLibrary(relPath) {
  libraryPath = relPath;
  const errorEl = $("#library-error");
  try {
    libraryEntries = await apiLibraryList(relPath);
    errorEl.classList.add("hidden");
  } catch (e) {
    libraryEntries = [];
    // e.g. the NAS is off or its password changed -- say so in place, with
    // a way to fix it, rather than showing an empty list
    errorEl.innerHTML = `<div class="readout"><span class="led"></span>NO SIGNAL</div>
      <div class="library-error-title">Couldn't open this folder</div>
      <div class="library-error-msg"></div>`;
    errorEl.querySelector(".library-error-msg").textContent = e.message;
    if (config.libraryEditable) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Fix connection settings";
      btn.addEventListener("click", () => { closeLibraryModal(); openLibrarySetup(); });
      errorEl.append(btn);
    }
    errorEl.classList.remove("hidden");
  }
  $("#library-listing").classList.toggle("hidden", !errorEl.classList.contains("hidden"));
  renderLibraryBreadcrumb();
  renderLibraryListing();
}

function renderLibraryBreadcrumb() {
  const crumbs = [{ label: config.library.name, path: "" }];
  let acc = "";
  for (const part of libraryPath.split("/").filter(Boolean)) {
    acc += part + "/";
    crumbs.push({ label: part, path: acc });
  }
  renderCrumbs($("#library-breadcrumb"), crumbs, navigateLibrary, true);
}

function renderLibraryListing() {
  const el = $("#library-listing");
  el.innerHTML = "";
  const sorted = libraryEntries.slice().sort((a, b) => {
    const aDir = a.size == null, bDir = b.size == null;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of sorted) {
    const isFolder = entry.size == null;
    const row = document.createElement("div");
    row.className = "row" + (isFolder ? " folder" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "checkbox";
    checkbox.title = "Select";
    checkbox.checked = librarySelected.has(entry.path);
    row.classList.toggle("selected", checkbox.checked);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) librarySelected.set(entry.path, entry);
      else librarySelected.delete(entry.path);
      row.classList.toggle("selected", checkbox.checked);
      updateLibrarySelectedCount();
    });

    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = entry.name;
    nameEl.title = entry.name;
    if (isFolder) {
      row.tabIndex = 0;
      row.addEventListener("click", (e) => { if (e.target !== checkbox) navigateLibrary(entry.path); });
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === row) navigateLibrary(entry.path); });
    }

    const size = document.createElement("span");
    size.className = "size";
    size.textContent = isFolder ? "" : formatSize(Number(entry.size));

    row.append(checkbox, svgIcon(iconFor(entry), "icon"), nameEl, size);
    el.appendChild(row);
  }
  el.scrollTop = 0;
}

function updateLibrarySelectedCount() {
  $("#library-selected-count").textContent = librarySelected.size ? `${librarySelected.size} selected` : "";
  $("#library-copy-btn").disabled = librarySelected.size === 0;
}

// Recursively walks a library folder via /library/list, preserving structure --
// mirrors collectDroppedEntries but reads from the library folder instead of
// the browser's drag-and-drop entries API.
async function collectLibraryEntries(relPath, prefix) {
  const listing = await apiLibraryList(relPath);
  const results = [];
  for (const entry of listing) {
    if (entry.size == null) {
      results.push(...(await collectLibraryEntries(entry.path, prefix + entry.name + "/")));
    } else {
      results.push({ srcRel: entry.path, relativePath: prefix + entry.name, name: entry.name, size: Number(entry.size) });
    }
  }
  return results;
}

addLibraryBtn.addEventListener("click", () => {
  if (config.library) openLibraryModal();
  else openLibrarySetup();
});
$("#library-settings-btn").addEventListener("click", () => { closeLibraryModal(); openLibrarySetup(); });
$("#library-cancel").addEventListener("click", closeLibraryModal);
$("#library-modal-backdrop").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLibraryModal();
});

$("#library-copy-btn").addEventListener("click", async () => {
  if (!librarySelected.size) { closeLibraryModal(); return; }
  const picks = Array.from(librarySelected.values());
  closeLibraryModal();

  const entries = [];
  for (const entry of picks) {
    if (entry.size == null) {
      entries.push(...(await collectLibraryEntries(entry.path, entry.name + "/")));
    } else {
      entries.push({ srcRel: entry.path, relativePath: entry.name, name: entry.name, size: Number(entry.size) });
    }
  }
  await processLibraryEntries(entries);
});

// ---------- library setup (SMB share) ----------
const setupBackdrop = $("#library-setup-backdrop");
const setupError = $("#library-setup-error");
const setupConnectBtn = $("#ls-connect");

function openLibrarySetup() {
  const lib = config.library && config.library.type === "smb" ? config.library : null;
  $("#ls-address").value = lib ? lib.address : "";
  $("#ls-username").value = lib ? lib.username : "";
  $("#ls-password").value = "";
  $("#ls-password").placeholder = lib && lib.hasPassword ? "Saved (leave blank to keep)" : "";
  $("#ls-name").value = lib ? lib.name : "NAS";
  $("#ls-remove").classList.toggle("hidden", !lib);
  $("#library-setup-unavailable").classList.toggle("hidden", config.smbAvailable);
  setupConnectBtn.disabled = !config.smbAvailable;
  setupError.classList.add("hidden");
  setPasswordVisible(false);
  setupBackdrop.classList.remove("hidden");
  setTimeout(() => $("#ls-address").focus(), 0);
}

function closeLibrarySetup() {
  setupBackdrop.classList.add("hidden");
}

$("#library-setup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setupError.classList.add("hidden");
  setupConnectBtn.disabled = true;
  setupConnectBtn.textContent = "Connecting…";
  try {
    const res = await fetch("library/setup", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({
        address: $("#ls-address").value,
        username: $("#ls-username").value,
        password: $("#ls-password").value,
        name: $("#ls-name").value,
      }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    config = data;
    applyConfig();
    closeLibrarySetup();
    toast(`Connected to ${config.library.name}`);
    openLibraryModal();
  } catch (err) {
    $("#library-setup-error-text").textContent = err.message;
    setupError.classList.remove("hidden");
  } finally {
    setupConnectBtn.disabled = !config.smbAvailable;
    setupConnectBtn.textContent = "Connect";
  }
});

$("#ls-cancel").addEventListener("click", closeLibrarySetup);

function setPasswordVisible(visible) {
  $("#ls-password").type = visible ? "text" : "password";
  $("#ls-password-toggle").title = visible ? "Hide password" : "Show password";
}
$("#ls-password-toggle").addEventListener("click", () => {
  setPasswordVisible($("#ls-password").type === "password");
});
setupBackdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLibrarySetup(); });

$("#ls-remove").addEventListener("click", async () => {
  const res = await fetch("library/remove", { method: "POST" });
  if (!res.ok) { toast("Could not disconnect", true); return; }
  config = await res.json();
  applyConfig();
  closeLibrarySetup();
  toast("Library disconnected");
});

// ---------- init ----------
loadConfig().then(refresh);
