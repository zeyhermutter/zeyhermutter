import type { ReactNode } from "react";
import { Arbeitsplatz, ArbeitsplatzKopf } from "~/components/arbeitsplatz";

// Der Arbeitsplatz, solange es noch keinen Datensatz gibt.
//
// WARUM
//
// Eine Listenseite leitet ohne Parameter in den ersten Datensatz um --
// Liste links, Akte rechts. Gibt es noch keinen (Reservierungen, Kampagnen
// auf BETA am 13.10.2026), blieb die Seite eine Tabelle mit "0 Eintraegen",
// und der Bereich sah anders aus als alle anderen. Jetzt steht auch dann der
// Arbeitsplatz da: links die leere Liste, rechts statt einer Akte das, womit
// man den ersten Datensatz anlegt.

export function LeererArbeitsplatz({ listenName, einzahl, mehrzahl, suchePlatzhalter, neu, volleListe, titel, children }: {
  listenName: string;
  einzahl: string;
  mehrzahl: string;
  suchePlatzhalter: string;
  neu?: { pfad: string; beschriftung: string };
  volleListe: string;
  /** Kopf rechts, etwa "Noch keine Reservierung". */
  titel: string;
  children: ReactNode;
}) {
  return (
    <Arbeitsplatz
      listenName={listenName}
      einzahl={einzahl}
      mehrzahl={mehrzahl}
      zeilen={[]}
      aktiveId={undefined}
      suchePlatzhalter={suchePlatzhalter}
      neu={neu}
      volleListe={volleListe}
      kopf={<ArbeitsplatzKopf nummer="Neu" titel={titel} />}
      reiter={null}
      seitenkopf="ausblenden"
    >
      <main className="editor-shell leere-akte">{children}</main>
    </Arbeitsplatz>
  );
}
