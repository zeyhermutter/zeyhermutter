// Ein Formular, dessen Auswahllisten nicht geladen haben, ist stumm kaputt.
//
// Die Anlegemasken holen ihre Auswahlen — Kontakte, Immobilien, Benutzer —
// in einem Promise.all ohne Fehlerpruefung. Faellt eine Abfrage aus, steht im
// Auswahlfeld nur "Auswählen…", das Feld ist aber Pflicht. Der Benutzer kommt
// nicht weiter und erfaehrt nicht, warum: es sieht aus, als gaebe es keine
// Kontakte.
//
// Diese Zeile sagt es ihm.

export function Ladehinweis({ fehler }: { fehler?: string[] | null }) {
  if (!fehler?.length) return null;
  return (
    <div className="form-warning">
      <strong>Ein Teil der Auswahllisten konnte nicht geladen werden.</strong>
      <p>
        In den Auswahlfeldern fehlen dadurch Einträge, ohne dass es auffällt. Bitte die Seite
        neu laden, bevor hier etwas angelegt wird.
      </p>
    </div>
  );
}
