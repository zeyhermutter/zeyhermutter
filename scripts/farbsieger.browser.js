// Farbsieger (Paket C, Schritt 5, 28.10.2026).
//
// Laeuft NICHT im Build, sondern im angemeldeten Browser auf BETA (wie
// scripts/kaskade.browser.js, dessen Hilfsfunktionen spez, teile, ohneZustand
// und normSel vorher geladen sein muessen).
//
// Frage: Welche Farbangaben der Stylesheets gewinnen nirgends?
//
// Fuer jede Regel aus KANDIDATEN (normalisierte Selektoren aus der Inventur
// der Quell-CSS; null = alle Regeln) und jede Farb-Langform (color, background-color, background-
// image, border-*-color, outline-color, box-shadow ...) sucht das Werkzeug auf
// allen Seiten jedes Element, das die Regel treffen KANN -- Zustaende wie
// :hover oder [open] werden dafuer weggelassen, also so gezaehlt, als waeren
// sie aktiv. Eine Angabe ist an einem Element "geschlagen", wenn dort eine
// BEDINGUNGSLOSE Regel (kein Zustand, kein @media, kein Pseudo-Element)
// dieselbe Langform setzt und staerker ist (!important, dann Spezifitaet,
// dann Reihenfolge). Bedingungslose Regeln gelten in jedem Zustand und jeder
// Breite; was sie schlagen, kann nie sichtbar werden.
//
// "tot" heisst: auf allen Seiten getroffen, an jedem getroffenen Element
// geschlagen. Nie getroffene Regeln sind NICHT tot, sondern "nie gesehen" --
// sie bleiben, es sei denn, ihre Klassen kommen im Code nicht mehr vor.
//
//   await farbsieger(KANDIDATEN, seiten)   // seiten: [{url, klick?, klickText?}]
//   farbBericht()                           // { "sel||prop": {treffer, geschlagen, seiten} }

const FARB_PROPS = /^(color|background-color|background-image|border-(top|right|bottom|left)-color|outline-color|box-shadow|text-decoration-color|accent-color|caret-color|fill|stroke|column-rule-color|text-shadow)$/;

function regelnMitBedingung(doc) {
  const out = []; let i = 0;
  const lauf = (liste, inMedia) => {
    for (const r of liste) {
      if (r.type === 1) {
        const zweige = teile(r.selectorText).map((z) => {
          const pseudo = /::|:(?:before|after|first-line|first-letter|placeholder|selection|marker)(?![\w-])/.test(z);
          const ohne = ohneZustand(z);
          return { z, ohne, sp: spez(z), bedingungslos: !inMedia && !pseudo && normSel(ohne) === normSel(z), pseudo };
        });
        out.push({ r, i: i++, sel: normSel(r.selectorText), props: [...r.style], zweige, inMedia });
      } else if (r.cssRules) {
        if (r.media && /^\s*print\s*$/.test(r.media.mediaText)) continue;
        lauf(r.cssRules, inMedia || Boolean(r.media || r.conditionText));
      }
    }
  };
  for (const s of doc.styleSheets) { try { lauf(s.cssRules, false); } catch {} }
  return out;
}

function spezAm(regel, el, nurBedingungslos) {
  let best = -1;
  for (const z of regel.zweige) {
    if (z.pseudo) continue;
    if (nurBedingungslos && !z.bedingungslos) continue;
    try { if (el.matches(nurBedingungslos ? z.z : z.ohne) && z.sp > best) best = z.sp; } catch {}
  }
  return best;
}

function farbAnalyse(doc, kandidaten, seite, erg) {
  const alle = regelnMitBedingung(doc);
  const proProp = new Map();
  for (const x of alle) for (const p of x.props) { if (!proProp.has(p)) proProp.set(p, []); proProp.get(p).push(x); }
  let n = 0;
  for (const D of alle) {
    if (kandidaten && !kandidaten.has(D.sel)) continue;
    const props = D.props.filter((p) => FARB_PROPS.test(p));
    if (!props.length) continue;
    const elemente = new Set();
    for (const z of D.zweige) { if (z.pseudo) continue; try { doc.querySelectorAll(z.ohne).forEach((e) => elemente.add(e)); } catch {} }
    if (!elemente.size) continue;
    n++;
    for (const p of props) {
      const k = `${D.sel}||${p}`;
      const e = (erg[k] ??= { treffer: 0, geschlagen: 0, seiten: [], sieger: {} });
      if (!e.seiten.includes(seite)) e.seiten.push(seite);
      const impD = D.r.style.getPropertyPriority(p) === "important";
      for (const el of elemente) {
        e.treffer++;
        const spD = spezAm(D, el, false);
        let geschlagen = false;
        for (const C of proProp.get(p) ?? []) {
          if (C === D) continue;
          const spC = spezAm(C, el, true); if (spC < 0) continue;
          const impC = C.r.style.getPropertyPriority(p) === "important";
          const staerker = (impC && !impD) || (impC === impD && (spC > spD || (spC === spD && C.i > D.i)));
          if (staerker) { geschlagen = true; const s = C.sel.slice(0, 90); e.sieger[s] = (e.sieger[s] ?? 0) + 1; break; }
        }
        if (geschlagen) e.geschlagen++;
      }
    }
  }
  return n;
}

async function farbsieger(kandidatenListe, seiten) {
  const kandidaten = kandidatenListe ? new Set(kandidatenListe.map(normSel)) : null; // null: alle Regeln
  window.__farbe ??= { erg: {}, fertig: [], fehler: [] };
  for (const s of seiten) {
    const name = s.url + (s.klick || s.klickText ? " [offen]" : "");
    try {
      const r = await rahmen(s.url);
      const d = r.contentDocument;
      d.querySelectorAll("details").forEach((x) => x.setAttribute("open", ""));
      if (s.klick) d.querySelector(s.klick)?.click();
      if (s.klickText) [...d.querySelectorAll("button,a")].find((b) => b.textContent.includes(s.klickText))?.click();
      if (s.klick || s.klickText) await new Promise((w) => setTimeout(w, 600));
      const n = farbAnalyse(d, kandidaten, name, window.__farbe.erg);
      window.__farbe.fertig.push(`${name} (${n})`);
      r.remove();
    } catch (e) { window.__farbe.fehler.push(`${name}: ${e}`); }
  }
  return window.__farbe.fertig.length;
}

function farbBericht() {
  return Object.fromEntries(Object.entries(window.__farbe?.erg ?? {}).map(([k, e]) => [k, { treffer: e.treffer, geschlagen: e.geschlagen, seiten: e.seiten.length, tot: e.treffer > 0 && e.treffer === e.geschlagen }]));
}

if (typeof window !== "undefined") Object.assign(window, { farbsieger, farbBericht, farbAnalyse, regelnMitBedingung });
