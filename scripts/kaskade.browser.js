// Kaskaden-Nachrechnung fuer das helle Thema (Paket C, 26.10.2026).
//
// Laeuft NICHT im Build, sondern im angemeldeten Browser auf BETA (wie
// scripts/stil-fingerabdruck.browser.js). Frage: Darf bei einer Regel des
// hellen Themas das "!important" entfallen, ohne dass sich irgendwo etwas
// aendert?
//
// Fuer jede Regel des hellen Themas mit "!important" und jede Einzel-
// eigenschaft (Langform, z. B. background-color) sucht das Werkzeug auf allen
// Seiten -- auch mit geoeffneten Dialogen, Popups und <details> -- jedes
// Element, das die Regel trifft, und dazu jede andere Regel, die dieselbe
// Eigenschaft am selben Element setzt. Zustaende (:hover, :focus, :disabled,
// [open] ...) werden dabei ignoriert, d. h. jede Regel zaehlt so, als waere ihr
// Zustand gerade aktiv. Paarweise gilt dann:
//
//   vorher gewinnt die helle Regel (mit !important) gegen die andere, wenn
//   die andere kein !important hat oder schwaecher ist (Spezifitaet, dann
//   Reihenfolge); nachher (ohne !important) nur noch, wenn die andere kein
//   !important hat UND schwaecher ist.
//
// Ein Konflikt ist jedes Paar, bei dem der Sieger wechselt UND die Werte
// verschieden sind. Dazu zaehlt auch ein Inline-Stil ohne !important.
// Paarweise ist strenger als noetig (konservativ): Was hier frei ist, aendert
// sich in keinem Zustand.
//
//   await kaskade(LICHT)   // LICHT: Liste normalisierter Selektoren
//   kaskadeBericht()       // je Regel: Treffer und Konflikte
//
// Nachweis bleibt danach der Fingerabdruck vorher/nachher.

const ZUSTAENDE = "hover|focus|focus-visible|focus-within|active|visited|link|any-link|disabled|enabled|checked|indeterminate|invalid|valid|user-invalid|user-valid|required|optional|placeholder-shown|read-only|read-write|target|autofill|-webkit-autofill|default|in-range|out-of-range|popover-open|modal|open";
const RE_NOT = new RegExp(`:not\\(\\s*:(?:${ZUSTAENDE})\\s*\\)`, "g");
const RE_ZST = new RegExp(`:(?:${ZUSTAENDE})(?![\\w-])`, "g");
const RE_ATTR_ZST = /\[(?:open|aria-expanded(?:="true")?|data-state(?:="[^"]*")?)\]/g;

const normSel = (s) => s.replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1").replace(/'/g, '"').trim();

function teile(sel) {
  const out = []; let tiefe = 0, start = 0, zit = null;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (zit) { if (c === zit) zit = null; continue; }
    if (c === '"' || c === "'") zit = c;
    else if (c === "(" || c === "[") tiefe++;
    else if (c === ")" || c === "]") tiefe--;
    else if (c === "," && tiefe === 0) { out.push(sel.slice(start, i).trim()); start = i + 1; }
  }
  out.push(sel.slice(start).trim());
  return out.filter(Boolean);
}

function klammerEnde(s, i) { // s[i] === "(" oder "["
  const auf = s[i], zu = auf === "(" ? ")" : "]"; let t = 0, zit = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (zit) { if (c === zit) zit = null; continue; }
    if (c === '"' || c === "'") zit = c;
    else if (c === auf) t++;
    else if (c === zu && --t === 0) return j + 1;
  }
  return s.length;
}

function spez(s) {
  let a = 0, b = 0, c = 0, i = 0;
  const name = () => { const st = i; while (i < s.length && /[\w-]/.test(s[i])) i++; return s.slice(st, i); };
  while (i < s.length) {
    const ch = s[i];
    if (ch === "#") { i++; name(); a++; }
    else if (ch === ".") { i++; name(); b++; }
    else if (ch === "[") { i = klammerEnde(s, i); b++; }
    else if (ch === ":") {
      if (s[i + 1] === ":") { i += 2; name(); if (s[i] === "(") i = klammerEnde(s, i); c++; continue; }
      i++; const n = name().toLowerCase();
      if (s[i] === "(") {
        const ende = klammerEnde(s, i), innen = s.slice(i + 1, ende - 1); i = ende;
        if (n === "where") continue;
        if (["not", "is", "has", "matches", "-webkit-any"].includes(n)) {
          const m = Math.max(0, ...teile(innen).map(spez)); a += Math.floor(m / 1e6); b += Math.floor(m / 1e3) % 1e3; c += m % 1e3; continue;
        }
        b++; continue;
      }
      if (["before", "after", "first-line", "first-letter"].includes(n)) c++; else b++;
    }
    else if (/[a-zA-Z*_\\-]/.test(ch)) { const n = ch === "*" ? (i++, "*") : name(); if (n !== "*" && n) c++; if (!n) i++; }
    else i++;
  }
  return a * 1e6 + b * 1e3 + c;
}

function ohneZustand(s) {
  let t = s.replace(RE_NOT, "").replace(RE_ZST, "").replace(RE_ATTR_ZST, "");
  t = t.replace(/:(?:is|where)\(\s*(?:,\s*)*\)/g, "").replace(/\(\s*,\s*/g, "(").replace(/\s*,\s*,/g, ",").replace(/\s*,\s*\)/g, ")");
  t = t.trim();
  if (!t || /[>+~]$/.test(t)) t += "*";
  return t;
}

const istPseudoElement = (s) => /::|:(?:before|after|first-line|first-letter)(?![\w-])/.test(s);

function regelnVon(doc) {
  const out = []; let i = 0;
  const lauf = (liste, href) => {
    for (const r of liste) {
      if (r.type === 1) {
        const zweige = teile(r.selectorText).filter((z) => !istPseudoElement(z)).map((z) => ({ z, ohne: ohneZustand(z), sp: spez(z) }));
        out.push({ r, i: i++, href: href ?? "inline", sel: normSel(r.selectorText), props: new Set([...r.style]), zweige });
      } else if (r.cssRules) {
        if (r.media && /^\s*print\s*$/.test(r.media.mediaText)) continue;
        lauf(r.cssRules, href);
      }
    }
  };
  for (const s of doc.styleSheets) { try { lauf(s.cssRules, s.href); } catch {} }
  return out;
}

function trefferSpez(regel, el) {
  let best = -1;
  for (const z of regel.zweige) { try { if (el.matches(z.ohne) && z.sp > best) best = z.sp; } catch { regel.kaputt = z.ohne; } }
  return best;
}

const wert = (regel, p) => regel.r.style.getPropertyValue(p) || `(Kurzform) ${regel.r.cssText.slice(0, 120)}`;

function analysiere(doc, licht, seite, ergebnis) {
  const alle = regelnVon(doc);
  const lichtRegeln = alle.filter((x) => licht.has(x.sel));
  const proProp = new Map();
  for (const x of alle) for (const p of x.props) { if (!proProp.has(p)) proProp.set(p, []); proProp.get(p).push(x); }
  for (const L of lichtRegeln) {
    const eintrag = (ergebnis[L.sel] ??= { treffer: 0, seiten: [], konflikte: {} });
    const wichtig = [...L.props].filter((p) => L.r.style.getPropertyPriority(p) === "important");
    const elemente = new Set();
    for (const z of L.zweige) { try { doc.querySelectorAll(z.ohne).forEach((e) => elemente.add(e)); } catch {} }
    if (!elemente.size) continue;
    eintrag.treffer += elemente.size; if (!eintrag.seiten.includes(seite)) eintrag.seiten.push(seite);
    for (const el of elemente) {
      const spL = trefferSpez(L, el);
      for (const p of wichtig) {
        const vL = L.r.style.getPropertyValue(p);
        for (const C of proProp.get(p) ?? []) {
          if (C === L) continue;
          const spC = trefferSpez(C, el); if (spC < 0) continue;
          const vC = wert(C, p); if (vC === vL) continue;
          const impC = C.r.style.getPropertyPriority(p) === "important";
          const cStaerker = spC > spL || (spC === spL && C.i > L.i);
          if ((!impC && cStaerker) || (impC && !cStaerker)) {
            const k = `${p} | ${C.sel.slice(0, 160)} | ${vC.slice(0, 80)}${impC ? " !important" : ""}${licht.has(C.sel) ? " [hell]" : ""}`;
            (eintrag.konflikte[k] ??= []).includes(seite) || eintrag.konflikte[k].push(seite);
          }
        }
        const inl = el.style.getPropertyValue(p);
        if (inl && inl !== vL && el.style.getPropertyPriority(p) !== "important") {
          const k = `${p} | inline | ${inl}`; (eintrag.konflikte[k] ??= []).includes(seite) || eintrag.konflikte[k].push(seite);
        }
      }
    }
  }
  return lichtRegeln.length;
}

async function rahmen(url) {
  const r = document.createElement("iframe");
  r.style.cssText = "position:fixed;left:-3000px;top:0;width:1300px;height:900px;border:0";
  document.body.appendChild(r);
  await new Promise((ok) => { r.onload = ok; r.src = url; });
  try { r.contentWindow.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16); } catch {}
  await new Promise((w) => setTimeout(w, 1500));
  return r;
}

// Seiten plus Zustaende, die erst nach einem Klick existieren.
const KASKADE_SEITEN = [
  ...(typeof SEITEN !== "undefined" ? SEITEN.map((url) => ({ url })) : []),
  { url: "/crm/tasks", klick: ".task-open-button" },
  { url: "/crm/organizations?ansicht=tabelle", klickText: "Neue Organisation" },
  { url: "/crm", klick: ".property-overview-map button, .property-map button, [class*='property-map'] button" },
  { url: "/leads/b6589283-6c5b-4d89-a440-bf718d199533/sales-readiness" },
  { url: "/crm/sales-readiness" },
  { url: "/properties/ff87c37e-3d5d-4dac-b1b8-770d299f0181/interests" },
];

async function kaskade(lichtListe, seiten = KASKADE_SEITEN) {
  const licht = new Set(lichtListe.map(normSel));
  window.__kaskade ??= { ergebnis: {}, fertig: [], fehler: [] };
  for (const s of seiten) {
    const name = s.url + (s.klick || s.klickText ? " [offen]" : "");
    try {
      const r = await rahmen(s.url);
      const d = r.contentDocument;
      d.querySelectorAll("details").forEach((x) => x.setAttribute("open", ""));
      if (s.klick) d.querySelector(s.klick)?.click();
      if (s.klickText) [...d.querySelectorAll("button,a")].find((b) => b.textContent.includes(s.klickText))?.click();
      if (s.klick || s.klickText) await new Promise((w) => setTimeout(w, 600));
      const n = analysiere(d, licht, name, window.__kaskade.ergebnis);
      window.__kaskade.fertig.push(`${name} (${n})`);
      r.remove();
    } catch (e) { window.__kaskade.fehler.push(`${name}: ${e}`); }
  }
  return window.__kaskade.fertig.length;
}

function kaskadeBericht() {
  return Object.fromEntries(Object.entries(window.__kaskade?.ergebnis ?? {}).map(([sel, e]) => [sel.slice(0, 140), { treffer: e.treffer, seiten: e.seiten.length, konflikte: Object.keys(e.konflikte) }]));
}

if (typeof window !== "undefined") Object.assign(window, { kaskade, kaskadeBericht, KASKADE_SEITEN, spez, ohneZustand, teile, normSel });
