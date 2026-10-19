import { useLocation } from "react-router";
import { bereichAusPfad } from "~/lib/programmbereiche";

// Die Hauptueberschrift einer Programmliste (19.10.2026).
//
// Mit der einheitlichen Listenform (P2-8) fiel der alte Seitenkopf weg und
// mit ihm die h1 -- 29 Listen hatten keine. Sehende lesen den Ort in der
// Bereichsleiste ab; ein Bildschirmleser springt zur h1 und fand nichts.
// Der Text kommt aus app/lib/programmbereiche.ts, damit Leiste und
// Ueberschrift nie auseinanderlaufen. scripts/check-pakete-p-zwei.mjs
// verlangt in jeder Liste eine h1.
export function ListenUeberschrift({ titel }: { titel?: string }) {
  const { pathname } = useLocation();
  const { bereich, unterpunkt } = bereichAusPfad(pathname);
  return <h1 className="sr-only">{titel ?? unterpunkt?.beschriftung ?? bereich.beschriftung}</h1>;
}
