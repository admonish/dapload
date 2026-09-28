/*
 * Mounts the real app (demo/app/index.html, unmodified) in an iframe with
 * the demo backend injected before app.js runs.
 *
 * How: fetch the app's index.html as text, insert a <base href> pointing at
 * demo/app/ plus a <script> tag for mock-backend.js right after <head>, and
 * load the result with iframe.srcdoc. A srcdoc document shares this page's
 * origin, so the app's localStorage and the demo's sessionStorage work
 * normally, and app.css/app.js load from demo/app/ through the <base>.
 *
 * demo/app/ is filled in by site/build.mjs from public/, so the demo always
 * runs the current app. Nothing needs to be copied by hand.
 *
 * Needs to be served over http(s); fetch() of a file:// URL is blocked.
 */
(function () {
  "use strict";

  function mount(iframe, opts) {
    const appBase = new URL(opts.appBase, location.href).href;       // .../demo/app/
    const mockSrc = new URL(opts.mockSrc, location.href).href;       // .../demo/mock-backend.js
    let html = null;
    let loads = 0;
    const listeners = [];
    const win = () => iframe.contentWindow;

    const ready = fetch(appBase + "index.html", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then((text) => {
        html = text.replace(/<head[^>]*>/i, (m) =>
          `${m}\n<base href="${appBase}">\n<script src="${mockSrc}"><\/script>`);
        load();
      });

    function load() {
      // A changing comment makes the browser treat it as a new document.
      iframe.srcdoc = html + `\n<!-- demo load ${++loads} -->`;
    }

    iframe.addEventListener("load", () => {
      if (opts.theme) applyTheme(opts.theme());
      listeners.forEach((fn) => fn());
    });

    function applyTheme(dark) {
      const w = win();
      if (w && typeof w.setTheme === "function") w.setTheme(dark); // global in app.js
    }

    return {
      ready,
      onLoad(fn) { listeners.push(fn); },
      isOffline() { const d = win() && win().__shanlingDemo; return d ? d.isOffline() : false; },
      setOffline(v) {
        const w = win();
        if (!w || !w.__shanlingDemo) return;
        w.__shanlingDemo.setOffline(v);
        // Going offline: check now so the "can't reach" screen appears at once.
        // Coming back: leave it to the app's own 5-second retry, so the
        // automatic reconnect is what people see.
        if (v && typeof w.refresh === "function") w.refresh();
      },
      isDark() { const w = win(); return !!(w && w.document.documentElement.classList.contains("dark")); },
      setDark: applyTheme,
      reset() {
        const w = win();
        if (w && w.__shanlingDemo) w.__shanlingDemo.reset();
        try { sessionStorage.removeItem("dapload-demo-state-v1"); } catch (e) { /* ignore */ }
        if (html) load();
      },
    };
  }

  window.ShanlingDemo = { mount };
})();
