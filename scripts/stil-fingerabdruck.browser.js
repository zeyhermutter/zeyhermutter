// Stil-Fingerabdruck fuer das visuelle Fundament (Paket C, 19.10.2026).
//
// Laeuft NICHT im Build, sondern im angemeldeten Browser auf BETA (Konsole
// bzw. Werkzeug). Laedt jede Seite in einem unsichtbaren Rahmen (1300 px
// breit), liest fuer jedes sichtbare Element die berechneten Stilwerte und
// speichert sie unter einem Namen in der IndexedDB dieses Browsers.
//
//   await fingerabdruck("vorher")      // Stand vor der CSS-Aenderung
//   ... Aenderung deployen ...
//   await fingerabdruck("nachher")
//   await vergleiche("vorher", "nachher")  // -> Seiten mit Abweichungen
//
// So laesst sich nachweisen, dass ein Umbau der Stylesheets (Farben als
// Tokens, Dunkelbasis abbauen) nichts sichtbar veraendert -- oder genau
// sagen, was sich veraendert.

const SEITEN = [
  "/crm", "/crm/tasks", "/crm/calendar", "/crm/notifications", "/crm/search?q=Demo", "/crm/archive?type=CONTACT&view=archived",
  "/crm/contacts?ansicht=tabelle", "/crm/contacts/10000000-0000-4000-8000-000000000002", "/crm/contacts/10000000-0000-4000-8000-000000000002/stammdaten",
  "/crm/organizations?ansicht=tabelle", "/crm/organizations/20000000-0000-4000-8000-000000000004",
  "/leads?ansicht=tabelle", "/leads/b6589283-6c5b-4d89-a440-bf718d199533",
  "/search-profiles?ansicht=tabelle", "/search-profiles/ee22bcfc-75d8-45ee-a2a1-6eedf1f9cd05",
  "/properties?ansicht=tabelle", "/properties/ff87c37e-3d5d-4dac-b1b8-770d299f0181", "/properties/ff87c37e-3d5d-4dac-b1b8-770d299f0181/objektdaten",
  "/properties/ff87c37e-3d5d-4dac-b1b8-770d299f0181/legal", "/properties/ff87c37e-3d5d-4dac-b1b8-770d299f0181/marketing", "/properties/ff87c37e-3d5d-4dac-b1b8-770d299f0181/documents",
  "/inquiries?ansicht=tabelle", "/inquiries/2ade3589-910e-4fa5-92b6-1dfe8cff9971", "/viewings?ansicht=tabelle&status=ALL", "/viewings/f46ae400-d1ba-4bcc-abe1-c9dec59347e5",
  "/purchase-offers?ansicht=tabelle", "/purchase-offers/f9f3e486-b60b-4dc8-afe2-cc1eb2bec686", "/closings/a5cf0716-1a9d-48a3-a3bd-1e82f726c74b",
  "/commissions/32bc00a8-969f-4a69-9e2a-7cec6ab93303", "/projects/bb629a18-b769-425c-b8e2-5cc9bc65171f",
  "/crm/email?inquiry_id=2ade3589-910e-4fa5-92b6-1dfe8cff9971", "/reports", "/crm/users", "/crm/automatik", "/crm/hilfe",
];
const EIGENSCHAFTEN = [
  "color", "background-color", "background-image", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-width", "border-bottom-width", "border-radius", "box-shadow", "outline-color", "font-size", "font-weight", "font-family",
  "line-height", "letter-spacing", "text-transform", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "display", "opacity", "gap",
];

function pfad(el) {
  const teile = [];
  for (let e = el; e && e.nodeType === 1 && e.tagName !== "BODY"; e = e.parentElement) {
    let n = e.tagName.toLowerCase();
    if (e.classList.length) n += "." + [...e.classList].sort().join(".");
    const geschwister = e.parentElement ? [...e.parentElement.children].filter((x) => x.tagName === e.tagName) : [];
    if (geschwister.length > 1) n += `:${geschwister.indexOf(e)}`;
    teile.unshift(n);
  }
  return teile.join(">");
}

async function ladeRahmen(url) {
  const r = document.createElement("iframe");
  r.style.cssText = "position:fixed;left:-3000px;top:0;width:1300px;height:900px;border:0";
  document.body.appendChild(r);
  await new Promise((fertig) => { r.onload = fertig; r.src = url; });
  await new Promise((w) => setTimeout(w, 1200));
  return r;
}

// Gespeichert in IndexedDB (localStorage ist fuer einige MB zu klein).
function db() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open("zm-fingerabdruck", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("staende");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function lies(name) {
  const d = await db();
  return new Promise((ok) => { const q = d.transaction("staende").objectStore("staende").get(name); q.onsuccess = () => ok(q.result ?? {}); q.onerror = () => ok({}); });
}
async function schreibe(name, wert) {
  const d = await db();
  return new Promise((ok, fehler) => { const t = d.transaction("staende", "readwrite"); t.objectStore("staende").put(wert, name); t.oncomplete = () => ok(true); t.onerror = () => fehler(t.error); });
}

// Mehrere Aufrufe mit Teilen der Seitenliste ergaenzen denselben Namen.
async function fingerabdruck(name, seiten = SEITEN) {
  const ergebnis = await lies(name);
  for (const url of seiten) {
    const rahmen = await ladeRahmen(url);
    const doc = rahmen.contentDocument, win = rahmen.contentWindow;
    const werte = {};
    for (const el of doc.body.querySelectorAll("*")) {
      if (["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE"].includes(el.tagName)) continue;
      if (el.closest(".statusleiste-stand, .build-version")) continue;
      const cs = win.getComputedStyle(el);
      if (cs.display === "none") continue;
      werte[pfad(el)] = EIGENSCHAFTEN.map((p) => cs.getPropertyValue(p)).join("|");
    }
    ergebnis[url] = werte;
    rahmen.remove();
    await new Promise((w) => setTimeout(w, 800));
  }
  await schreibe(name, ergebnis);
  return Object.fromEntries(seiten.map((u) => [u, Object.keys(ergebnis[u] ?? {}).length]));
}

async function vergleiche(a, b, hoechstens = 5) {
  const A = await lies(a), B = await lies(b);
  const bericht = {};
  for (const url of Object.keys(A)) {
    const x = A[url] ?? {}, y = B[url] ?? {};
    const abweichend = [];
    for (const k of Object.keys(x)) {
      if (!(k in y)) { abweichend.push([k, "fehlt nachher"]); continue; }
      if (x[k] !== y[k]) {
        const vx = x[k].split("|"), vy = y[k].split("|");
        abweichend.push([k, EIGENSCHAFTEN.filter((_, i) => vx[i] !== vy[i]).map((p, i) => `${p}: ${vx[EIGENSCHAFTEN.indexOf(p)]} -> ${vy[EIGENSCHAFTEN.indexOf(p)]}`).join("; ")]);
      }
    }
    for (const k of Object.keys(y)) if (!(k in x)) abweichend.push([k, "neu nachher"]);
    if (abweichend.length) bericht[url] = { anzahl: abweichend.length, beispiele: abweichend.slice(0, hoechstens) };
  }
  return bericht;
}

if (typeof window !== "undefined") Object.assign(window, { SEITEN, fingerabdruck, vergleiche });
