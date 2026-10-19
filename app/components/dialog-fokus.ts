import { useEffect, type RefObject } from "react";

// Tastaturbedienung fuer Dialoge (19.10.2026).
//
// Vorher konnte man mit Tab aus einem offenen Dialog heraus in die Seite
// dahinter springen, die mit aria-modal als verdeckt gilt -- der Fokus war
// dann unsichtbar. Nach dem Schliessen stand er am Seitenanfang statt auf
// dem Knopf, der den Dialog geoeffnet hatte.
//
// Jetzt:
// - beim Oeffnen kommt der Fokus in den Dialog (ein Feld mit autoFocus
//   behaelt ihn), sonst auf das erste bedienbare Element;
// - Tab und Umschalt+Tab laufen im Kreis innerhalb des Dialogs;
// - beim Schliessen geht der Fokus dorthin zurueck, wo er vorher war;
// - optional schliesst Escape (wo der Dialog das noch nicht selbst tut).

const BEDIENBAR = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

// Wo der Fokus zuletzt ausserhalb eines Dialogs stand. Gebraucht, weil ein
// Feld mit autoFocus den Fokus schon beim Zeichnen in den Dialog holt -- dann
// waere "das aktive Element beim Oeffnen" bereits das Feld im Dialog.
let zuletztAussen: HTMLElement | null = null;
let beobachtet = false;
function beobachteFokus() {
  if (beobachtet || typeof document === "undefined") return;
  beobachtet = true;
  document.addEventListener("focusin", (e) => {
    const ziel = e.target;
    if (ziel instanceof HTMLElement && !ziel.closest('[aria-modal="true"]')) zuletztAussen = ziel;
  });
}

export function useDialogFokus(
  ref: RefObject<HTMLElement | null>,
  offen: boolean,
  beiEscape?: () => void,
) {
  useEffect(() => { beobachteFokus(); }, []);
  useEffect(() => {
    if (!offen) return;
    const dialog = ref.current;
    if (!dialog) return;
    const aktivBeimOeffnen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const vorher = aktivBeimOeffnen && !dialog.contains(aktivBeimOeffnen) ? aktivBeimOeffnen : zuletztAussen;
    const bedienbar = () => Array.from(dialog.querySelectorAll<HTMLElement>(BEDIENBAR))
      .filter((el) => el.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) (bedienbar()[0] ?? dialog).focus();

    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape" && beiEscape) { beiEscape(); return; }
      if (e.key !== "Tab") return;
      const liste = bedienbar();
      if (liste.length === 0) { e.preventDefault(); dialog.focus(); return; }
      const erstes = liste[0], letztes = liste[liste.length - 1];
      const aktiv = document.activeElement;
      if (e.shiftKey && (aktiv === erstes || !dialog.contains(aktiv))) { e.preventDefault(); letztes.focus(); }
      else if (!e.shiftKey && (aktiv === letztes || !dialog.contains(aktiv))) { e.preventDefault(); erstes.focus(); }
    };
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("keydown", taste);
      if (vorher && document.contains(vorher)) vorher.focus();
    };
    // beiEscape absichtlich nicht in den Abhaengigkeiten: eine neue Funktion je
    // Zeichnen wuerde den Fokus sonst bei jedem Tastendruck neu setzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen, ref]);
}
