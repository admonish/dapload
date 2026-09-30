// Every custom event dapload.com sends to Vercel Web Analytics, and the funnels made from them.
//
// This is data, not just documentation: build.mjs publishes it at /analytics-events.json so the owner's dashboard
// across their sites knows what to query and which drop-offs matter, and the build fails if the pages track an
// event, property or value that isn't listed here. The format and naming rules are shared by all the owner's sites
// (Sjekkhytta and Cuff do the same):
// - Names and property keys are snake_case and never change. To change what an event means, add a new one. Use the
//   same name on every site for the same thing (`from` = which button or place started it).
// - At most 2 properties per event. Values come from small fixed sets, never free text, IDs or URLs.
// - Nothing that identifies a person. Events are cookieless, like the page views.
// - `label` is a short name in plain English (2–5 words, at most 40 characters) that the dashboard shows;
//   `description` says exactly when the event fires and what each value means (an AI reads it to suggest changes).
//
// Events are sent by site.js: a click on an element with data-event="<name>" sends it, with its
// data-event-<prop>="<value>" attributes as properties. demo_used is also sent by site.js for the first click
// inside the demo app. The Web Analytics API only returns totals, so a funnel step is the count of an event and a
// funnel is those counts side by side.

export const SITE = "https://dapload.com";

export const EVENTS = {
  demo_used: {
    label: "Tried the demo",
    description:
      "The first time in a page view that someone used the live demo; later demo clicks in the same page view send " +
      "nothing, so this counts page views where the demo was tried. `control` is what they used first: `app` = " +
      "clicked inside the demo app itself (on the home page or the full-screen demo page), `reset`, `offline` " +
      '("Simulate player going offline"), `theme` (light/dark), `view` (desktop/phone width) = the buttons above the ' +
      'demo, `full_screen` = a "Full screen" link to the demo page.',
    props: { control: ["app", "reset", "offline", "theme", "view", "full_screen"] },
  },
  install_copied: {
    label: "Copied an install command",
    description:
      "A Copy button in the Install section was clicked, the closest signal that someone is installing Dapload. " +
      "Every click counts, so one visitor can send several. `method`: `docker` = the docker run command for an SMB " +
      "share, `docker_local` = docker run with a local folder (under \"Music on the same machine?\"), `compose` = " +
      "the docker-compose.yml, `compose_up` = the docker compose up command, `python` = the git clone and python " +
      "commands.",
    props: { method: ["docker", "docker_local", "compose", "compose_up", "python"] },
  },
  github_clicked: {
    label: "Opened GitHub",
    description:
      "A link to the GitHub repository was clicked. `from`: `header` = the GitHub button at the top of the home " +
      "page, `faq` = the \"open an issue\" link in the FAQ, `footer` = the repository, issues or license link in " +
      "the footer.",
    props: { from: ["header", "faq", "footer"] },
  },
};

export const FUNNELS = [
  {
    id: "demo_to_install",
    label: "Demo to install",
    description:
      "From trying the demo to copying an install command. Both are event counts: demo_used is once per page " +
      "view, install_copied once per click, and people can copy a command without trying the demo.",
    steps: [
      { event: "demo_used", label: "Tried the demo" },
      { event: "install_copied", label: "Copied an install command" },
    ],
  },
];

const snake = (s) => /^[a-z][a-z0-9_]*$/.test(s);

/** Throws unless EVENTS and FUNNELS follow the rules above. */
export function validate() {
  const label = (l, where) => {
    if (typeof l !== "string" || !l.length || l.length > 40) throw new Error(`${where}: needs a label of 1–40 characters`);
  };
  for (const [name, e] of Object.entries(EVENTS)) {
    label(e.label, name);
    if (!snake(name) || !Object.keys(e.props).every(snake)) throw new Error(`${name}: names and property keys must be snake_case`);
    if (Object.keys(e.props).length > 2) throw new Error(`${name}: at most 2 properties per event`);
    for (const [k, v] of Object.entries(e.props)) {
      if (!Array.isArray(v) || !v.length || !v.every((x) => typeof x === "string")) throw new Error(`${name}.${k}: values must be a list of strings`);
    }
  }
  for (const f of FUNNELS) {
    label(f.label, `funnel ${f.id}`);
    f.steps.forEach((s, i) => {
      if (s.label !== undefined) label(s.label, `funnel ${f.id} step ${i + 1}`);
      if (!EVENTS[s.event]) throw new Error(`funnel ${f.id} step ${i + 1}: unknown event ${s.event}`);
    });
  }
}

/** Checks every data-event element in a built page against EVENTS. Returns the [event, props] pairs found. */
export function checkMarkup(page, html) {
  const found = [];
  for (const tag of html.match(/<[a-z]+\b[^>]*\bdata-event="[^"]*"[^>]*>/g) ?? []) {
    const event = tag.match(/\bdata-event="([^"]*)"/)[1];
    const props = Object.fromEntries([...tag.matchAll(/\bdata-event-([a-z0-9-]+)="([^"]*)"/g)].map(([, k, v]) => [k.replace(/-/g, "_"), v]));
    const def = EVENTS[event];
    if (!def) throw new Error(`${page}: unknown event ${event} in ${tag.slice(0, 80)}`);
    for (const [k, allowed] of Object.entries(def.props)) {
      if (!(k in props)) throw new Error(`${page}: ${event} is missing ${k} in ${tag.slice(0, 80)}`);
      if (!allowed.includes(props[k])) throw new Error(`${page}: ${props[k]} is not an allowed ${event}.${k}`);
    }
    for (const k of Object.keys(props)) if (!(k in def.props)) throw new Error(`${page}: ${event} has no property ${k}`);
    found.push([event, props]);
  }
  return found;
}

/** /analytics-events.json (schema 1). */
export function manifest() {
  validate();
  return {
    schema: 1,
    site: SITE,
    events: Object.entries(EVENTS).map(([name, e]) => ({ name, label: e.label, description: e.description, props: e.props })),
    funnels: FUNNELS,
  };
}
