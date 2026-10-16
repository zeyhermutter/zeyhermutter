import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as TastenEreignis } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";
import "~/schnellsuche.css";

// Schnellsuche in der Titelleiste, mit Strg+K (Mac: ⌘K) von ueberall
// (P2-2, 16.10.2026). Vorbild: Linear und Attio.
//
// WARUM
//
// Bis hier fuehrte jede Suche auf eine eigene Trefferseite: tippen, Enter,
// Seite laden, Treffer anklicken. Fuer "schnell den Kontakt Muster oeffnen"
// sind das vier Schritte und ein Seitenwechsel. Jetzt erscheinen die ersten
// Treffer beim Tippen unter dem Feld; Pfeiltasten und Enter oeffnen einen.
//
// - Ohne JavaScript bleibt alles wie vorher: das Feld ist ein Formular auf
//   /crm/search.
// - Enter ohne gewaehlten Eintrag oeffnet die volle Trefferliste.
// - Ohne Suchbegriff stehen die haeufigsten Spruenge da ("Neuer Kontakt",
//   "Aufgaben" ...); mit Begriff nur die, deren Name passt.
// - Escape schliesst und gibt den Fokus zurueck.

type Treffer = { key: string; art: string; nummer: string; titel: string; unterzeile: string; pfad: string };
type Antwort = { q: string; treffer: Treffer[]; mehr: boolean; fehler: boolean };
type Eintrag = { key: string; art: string; titel: string; unterzeile?: string; nummer?: string; pfad: string };

const SPRUENGE: Eintrag[] = [
  { key: "neu-kontakt", art: "Anlegen", titel: "Neuer Kontakt", pfad: "/crm/contacts/new" },
  { key: "neu-immobilie", art: "Anlegen", titel: "Neue Immobilie", pfad: "/properties/new" },
  { key: "neu-lead", art: "Anlegen", titel: "Neuer Lead", pfad: "/leads/new" },
  { key: "neu-anfrage", art: "Anlegen", titel: "Neue Anfrage", pfad: "/inquiries/new" },
  { key: "neu-besichtigung", art: "Anlegen", titel: "Neue Besichtigung", pfad: "/viewings/new" },
  { key: "mein-tag", art: "Öffnen", titel: "Mein Tag", pfad: "/crm" },
  { key: "aufgaben", art: "Öffnen", titel: "Aufgaben", pfad: "/crm/tasks" },
  { key: "kalender", art: "Öffnen", titel: "Kalender", pfad: "/crm/calendar" },
];

const WARTEN_MS = 200;

export function Schnellsuche() {
  const [q, setQ] = useState("");
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const [mac, setMac] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const rahmen = useRef<HTMLFormElement>(null);
  const fetcher = useFetcher<Antwort>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const listeId = useId();

  // Strg+K / ⌘K von ueberall -- auch aus einem Eingabefeld heraus, wie in Linear.
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        feld.current?.focus();
        feld.current?.select();
        setOffen(true);
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  // Nach einem Seitenwechsel ist die Suche erledigt.
  useEffect(() => { setOffen(false); setQ(""); setAktiv(-1); }, [pathname]);

  const begriff = q.trim();
  useEffect(() => {
    if (begriff.length < 2) return;
    const t = window.setTimeout(() => fetcher.load(`/api/suche?q=${encodeURIComponent(begriff)}`), WARTEN_MS);
    return () => window.clearTimeout(t);
    // fetcher ist bei jedem Rendern ein neues Objekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begriff]);

  const antwort = fetcher.data && fetcher.data.q === begriff ? fetcher.data : null;
  const laedt = begriff.length >= 2 && !antwort;

  const eintraege = useMemo<Eintrag[]>(() => {
    const klein = begriff.toLocaleLowerCase("de-DE");
    const spruenge = klein ? SPRUENGE.filter((s) => s.titel.toLocaleLowerCase("de-DE").includes(klein)).slice(0, 3) : SPRUENGE;
    const treffer = (antwort?.treffer ?? []).map((t) => ({ key: t.key, art: t.art, titel: t.titel, unterzeile: t.unterzeile, nummer: t.nummer, pfad: t.pfad }));
    const alle = begriff.length >= 2
      ? [{ key: "alle", art: "Suche", titel: antwort?.mehr ? `Alle Treffer für „${begriff}“ — es gibt mehr` : `Alle Treffer für „${begriff}“`, pfad: `/crm/search?q=${encodeURIComponent(begriff)}` }]
      : [];
    return [...treffer, ...spruenge, ...alle];
  }, [antwort, begriff]);

  useEffect(() => { setAktiv(-1); }, [begriff]);

  // Klick ausserhalb schliesst.
  useEffect(() => {
    if (!offen) return;
    const weg = (e: MouseEvent) => { if (!rahmen.current?.contains(e.target as Node)) setOffen(false); };
    document.addEventListener("mousedown", weg);
    return () => document.removeEventListener("mousedown", weg);
  }, [offen]);

  const oeffne = (e: Eintrag) => { setOffen(false); navigate(e.pfad); };

  const tasten = (e: TastenEreignis<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOffen(true); setAktiv((i) => Math.min(eintraege.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAktiv((i) => Math.max(-1, i - 1)); }
    else if (e.key === "Escape") { e.preventDefault(); setOffen(false); feld.current?.blur(); }
    else if (e.key === "Enter" && offen && aktiv >= 0 && eintraege[aktiv]) { e.preventDefault(); oeffne(eintraege[aktiv]); }
    // Enter ohne Auswahl: das Formular schickt auf /crm/search.
  };

  const zeigen = offen;
  const optionId = (i: number) => `${listeId}-${i}`;

  return (
    <form ref={rahmen} className="titelleiste-suche schnellsuche" method="get" action="/crm/search" role="search"
      onSubmit={() => setOffen(false)}>
      <label>
        <span className="sr-only">Überall suchen (Strg+K)</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          ref={feld}
          type="search"
          name="q"
          value={q}
          onChange={(e) => { setQ(e.currentTarget.value); setOffen(true); }}
          onFocus={() => setOffen(true)}
          onKeyDown={tasten}
          placeholder="Objekt, Adresse, Nummer suchen …"
          autoComplete="off"
          role="combobox"
          aria-expanded={zeigen}
          aria-controls={listeId}
          aria-autocomplete="list"
          aria-activedescendant={zeigen && aktiv >= 0 ? optionId(aktiv) : undefined}
        />
        <kbd className="schnellsuche-taste" aria-hidden="true">{mac ? "⌘K" : "Strg K"}</kbd>
      </label>
      {zeigen ? (
        <div className="schnellsuche-liste" id={listeId} role="listbox" aria-label="Treffer und Sprünge">
          {laedt ? <p className="schnellsuche-hinweis" role="status">Suche …</p> : null}
          {antwort?.fehler ? <p className="schnellsuche-hinweis" role="status">Ein Teil der Suche konnte nicht geladen werden.</p> : null}
          {antwort && antwort.treffer.length === 0 ? <p className="schnellsuche-hinweis" role="status">Keine Treffer.</p> : null}
          {begriff.length === 1 ? <p className="schnellsuche-hinweis">Noch ein Zeichen …</p> : null}
          {eintraege.map((e, i) => (
            <a
              key={e.key}
              id={optionId(i)}
              role="option"
              aria-selected={i === aktiv}
              className={`schnellsuche-eintrag${i === aktiv ? " aktiv" : ""}`}
              href={e.pfad}
              onMouseEnter={() => setAktiv(i)}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={(ev) => { ev.preventDefault(); oeffne(e); }}
            >
              <span className="schnellsuche-art">{e.art}</span>
              <span className="schnellsuche-was">
                <strong>{e.titel}</strong>
                {e.nummer || e.unterzeile ? <small>{[e.nummer, e.unterzeile].filter((x) => x && x !== "—").join(" · ")}</small> : null}
              </span>
            </a>
          ))}
          <p className="schnellsuche-fuss" aria-hidden="true">↑↓ wählen · Enter öffnen · Esc schließen</p>
        </div>
      ) : null}
    </form>
  );
}
