import { useEffect, useRef } from "react";
import { useFetchers, useNavigation } from "react-router";

// Wartezustand beim Absenden -- fuer alle Formulare an einer Stelle
// (19.10.2026).
//
// Vorher zeigten 4 von rund 130 Formularen, dass gerade gespeichert wird.
// Bei allen anderen blieb der Knopf unveraendert; wer bei langsamer Antwort
// noch einmal klickte, schickte das Formular zweimal (zwei Aufgaben, zwei
// Notizen).
//
// Jetzt merkt sich dieser Baustein beim Absenden eines POST-Formulars den
// Knopf, der es ausgeloest hat, und markiert ihn, bis die Antwort da ist:
// aria-busy fuer Bildschirmleser, data-wartet fuer das Aussehen (blasser,
// Sanduhr, kein zweiter Klick). Der Knopf wird bewusst nicht "disabled" --
// ein gesperrter Knopf wuerde seinen eigenen Namen/Wert nicht mehr senden.
export function AbsendenWarten() {
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const knopf = useRef<HTMLElement | null>(null);
  const begonnen = useRef(false);

  const freigeben = () => {
    const k = knopf.current;
    if (k) { k.removeAttribute("aria-busy"); delete k.dataset.wartet; }
    knopf.current = null;
    begonnen.current = false;
  };

  useEffect(() => {
    const beiAbsenden = (e: Event) => {
      const formular = e.target;
      if (!(formular instanceof HTMLFormElement)) return;
      if ((formular.getAttribute("method") ?? "get").toLowerCase() !== "post") return;
      const ausloeser = (e as SubmitEvent).submitter
        ?? formular.querySelector<HTMLElement>('button[type="submit"], button:not([type])');
      if (!ausloeser) return;
      freigeben();
      knopf.current = ausloeser;
      ausloeser.setAttribute("aria-busy", "true");
      ausloeser.dataset.wartet = "1";
      // Startet gar keine Anfrage (etwa weil ein Skript das Absenden abfaengt),
      // gibt der Knopf sich nach kurzer Zeit selbst wieder frei.
      window.setTimeout(() => { if (!begonnen.current && knopf.current === ausloeser) freigeben(); }, 1500);
    };
    document.addEventListener("submit", beiAbsenden);
    return () => document.removeEventListener("submit", beiAbsenden);
  }, []);

  const beschaeftigt = navigation.state !== "idle" || fetchers.some((f) => f.state !== "idle");
  useEffect(() => {
    if (beschaeftigt) { if (knopf.current) begonnen.current = true; return; }
    if (begonnen.current) freigeben();
  }, [beschaeftigt]);

  return null;
}
