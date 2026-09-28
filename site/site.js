/* dapload.com site script: icons, theme, install tabs, copy buttons and
   the demo controls. No dependencies. */
(function () {
  "use strict";

  // Same stroke icons as ICONS in public/app.js, plus a few for the site.
  const FOLDER = "M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.2h8.7A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z";
  const ICONS = {
    folder: FOLDER,
    note: "M9 18V6l11-2v12 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
    upload: "M12 15V4 M7 9l5-5 5 5 M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
    folderUpload: FOLDER + " M12 17v-6 M9.5 13.5 12 11l2.5 2.5",
    folderPlus: FOLDER + " M12 11v6 M9 14h6",
    library: "M12 21a9 9 0 1 1 0-18a9 9 0 1 1 0 18z M12 14.5a2.5 2.5 0 1 1 0-5a2.5 2.5 0 1 1 0 5z",
    nas: "M4 4h16v7H4z M4 13h16v7H4z M8 7.5h.01 M8 16.5h.01 M12 7.5h4 M12 16.5h4",
    search: "M11 18a7 7 0 1 1 0-14a7 7 0 1 1 0 14z M20 20l-4-4",
    sort: "M7 4v16 M4 17l3 3 3-3 M13 6h7 M13 11h5 M13 16h3",
    settings: "M4 7h9 M19 7h1 M4 17h3 M13 17h7 M18 7a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M12 17a2 2 0 1 1-4 0a2 2 0 1 1 4 0",
    moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
    sun: "M12 16a4 4 0 1 1 0-8a4 4 0 1 1 0 8z M12 2.5v2 M12 19.5v2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M2.5 12h2 M19.5 12h2 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4",
    refresh: "M20 12a8 8 0 1 1-2.34-5.66 M20 4v4h-4",
    trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5",
    check: "M5 12.5l4.5 4.5L19 7",
    skip: "M12 21a9 9 0 1 1 0-18a9 9 0 1 1 0 18z M8 12h8",
    alert: "M12 3.5l9 16H3z M12 10v4 M12 17h.01",
    device: "M7.5 2.5h9A1.5 1.5 0 0 1 18 4v16a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V4A1.5 1.5 0 0 1 7.5 2.5z M9 5.5h6v5H9z M14.5 16.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0",
    chevron: "M9 6l6 6-6 6",
    chevronDown: "M6 9l6 6 6-6",
    // site additions, same grid and stroke
    copy: "M9 9h11v11H9z M5 15H4V4h11v1",
    external: "M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
    lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
    shield: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
    browser: "M3 5h18v14H3z M3 9h18 M6 7h.01 M8.5 7h.01",
    phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 18h2",
    monitor: "M3 5h18v11H3z M9 20h6 M12 16v4",
    power: "M12 3v8 M7 6.5a7 7 0 1 0 10 0",
    wifi: "M2.5 9a14 14 0 0 1 19 0 M6 12.5a9 9 0 0 1 12 0 M9.5 16a4 4 0 0 1 5 0 M12 19.5h.01",
    gauge: "M4 18a8 8 0 1 1 16 0 M12 18l4-5",
    listCheck: "M4 6h10 M4 12h10 M4 18h6 M15 17l2 2 4-4",
    code: "M8 7l-5 5 5 5 M16 7l5 5-5 5",
    cpu: "M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4",
    reset: "M4 12a8 8 0 1 0 2.34-5.66 M4 4v4h4",
    coffee: "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 11h1.5a2.5 2.5 0 0 1 0 5H17 M8 3.5v2.5 M12.5 3.5v2.5",
  };
  const SVG_NS = "http://www.w3.org/2000/svg";
  function setIcon(svg, name) {
    svg.dataset.icon = name;
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    let p = svg.firstElementChild;
    if (!p) { p = document.createElementNS(SVG_NS, "path"); svg.appendChild(p); }
    p.setAttribute("d", ICONS[name] || "");
  }
  document.querySelectorAll("svg[data-icon]").forEach((s) => setIcon(s, s.dataset.icon));

  // ---------- theme ----------
  // The inline script in <head> sets html.dark before first paint. The
  // choice is stored as "site-theme" so it doesn't clash with the app's
  // own "theme" key (the demo shares this origin).
  const root = document.documentElement;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const themeBtn = document.getElementById("theme-toggle");
  function paintThemeBtn() {
    if (!themeBtn) return;
    const dark = root.classList.contains("dark");
    setIcon(themeBtn.querySelector("svg"), dark ? "sun" : "moon");
    themeBtn.title = dark ? "Switch to light theme" : "Switch to dark theme";
    themeBtn.setAttribute("aria-label", themeBtn.title);
  }
  paintThemeBtn();
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    try { localStorage.setItem("site-theme", dark ? "dark" : "light"); } catch (e) { /* ignore */ }
    paintThemeBtn();
    if (demo) { demo.setDark(dark); paintDemoTheme(); }
  });
  mq.addEventListener && mq.addEventListener("change", (e) => {
    let saved = null;
    try { saved = localStorage.getItem("site-theme"); } catch (err) { /* ignore */ }
    if (saved || new URLSearchParams(location.search).get("theme")) return;
    root.classList.toggle("dark", e.matches);
    paintThemeBtn();
  });

  // ---------- install tabs ----------
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") selectTab(tabs[(i + 1) % tabs.length], true);
      if (e.key === "ArrowLeft") selectTab(tabs[(i - 1 + tabs.length) % tabs.length], true);
    });
  });

  // ---------- copy buttons ----------
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    const label = btn.querySelector("span");
    btn.addEventListener("click", async () => {
      const src = document.getElementById(btn.dataset.copy);
      // Prompts ($) are marked .p and left out of the copied text.
      const clone = src.cloneNode(true);
      clone.querySelectorAll(".p").forEach((el) => el.remove());
      const text = clone.textContent.replace(/\n$/, "");
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (err) { /* ignore */ }
        ta.remove();
      }
      btn.classList.add("copied");
      setIcon(btn.querySelector("svg"), "check");
      label.textContent = "Copied";
      setTimeout(() => { btn.classList.remove("copied"); setIcon(btn.querySelector("svg"), "copy"); label.textContent = "Copy"; }, 1600);
    });
  });

  // ---------- demo ----------
  const frameEl = document.getElementById("demo-iframe");
  let demo = null;
  const $ = (id) => document.getElementById(id);

  function paintDemoTheme() {
    const dark = demo ? demo.isDark() : root.classList.contains("dark");
    $("demo-light") && $("demo-light").setAttribute("aria-pressed", !dark);
    $("demo-dark") && $("demo-dark").setAttribute("aria-pressed", dark);
  }
  function paintOffline() {
    const btn = $("demo-offline");
    if (!btn || !demo) return;
    const off = demo.isOffline();
    btn.setAttribute("aria-pressed", off);
    btn.querySelector("span").textContent = off ? "Bring player back online" : "Simulate player going offline";
    setIcon(btn.querySelector("svg"), off ? "wifi" : "power");
    const url = $("demo-url-led");
    if (url) url.className = "led " + (off ? "err" : "on");
  }

  function startDemo() {
    if (demo || !frameEl || !window.ShanlingDemo) return;
    demo = window.ShanlingDemo.mount(frameEl, {
      appBase: frameEl.dataset.appBase,
      mockSrc: frameEl.dataset.mockSrc,
      theme: () => root.classList.contains("dark"),
    });
    demo.onLoad(() => {
      const l = $("demo-loading");
      if (l) l.classList.add("hidden");
      paintDemoTheme();
      paintOffline();
    });
    demo.ready.catch(() => {
      const l = $("demo-loading");
      if (l) l.textContent = "The demo needs to be served over http(s) to load.";
    });
  }

  if (frameEl) {
    if (frameEl.dataset.eager === "1" || !("IntersectionObserver" in window)) startDemo();
    else {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); startDemo(); } }, { rootMargin: "600px 0px" });
      io.observe(frameEl);
    }
    document.querySelectorAll('a[href="#demo"]').forEach((a) => a.addEventListener("click", startDemo));
  }

  $("demo-reset") && $("demo-reset").addEventListener("click", () => { if (demo) { demo.reset(); } });
  $("demo-offline") && $("demo-offline").addEventListener("click", () => {
    if (!demo) return;
    demo.setOffline(!demo.isOffline());
    paintOffline();
  });
  $("demo-light") && $("demo-light").addEventListener("click", () => { if (demo) { demo.setDark(false); paintDemoTheme(); } });
  $("demo-dark") && $("demo-dark").addEventListener("click", () => { if (demo) { demo.setDark(true); paintDemoTheme(); } });

  const frameBox = $("demo-frame");
  function setWidth(phone) {
    if (!frameBox) return;
    frameBox.classList.toggle("is-phone", phone);
    $("demo-desktop").setAttribute("aria-pressed", !phone);
    $("demo-phone").setAttribute("aria-pressed", phone);
  }
  $("demo-desktop") && $("demo-desktop").addEventListener("click", () => setWidth(false));
  $("demo-phone") && $("demo-phone").addEventListener("click", () => setWidth(true));
})();
