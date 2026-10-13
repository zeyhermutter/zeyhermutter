import { Aufklapper } from "~/components/aufklapper";

/** Hinweis, der auf jeder Reservierungsseite steht -- Liste, Akte, leer. */
export function ReservierungHinweis(){
  return <>
    <p className="form-warning"><strong>Erfassung, keine rechtliche Bewertung.</strong> Reservierungsentgelte sind rechtlich heikel. Das System erfasst ein tatsächlich vereinbartes Entgelt nur, schlägt keines vor, berechnet nichts und sagt nichts darüber, ob es zulässig ist.</p>
    <Aufklapper knopf="Vor produktiver Nutzung: anwaltlich abzunehmen">
      <ul className="programm-erklaerung">
        <li>Ob und unter welchen Voraussetzungen ein Reservierungsentgelt überhaupt vereinbart werden darf.</li>
        <li>Welche Form eine Reservierungsvereinbarung braucht und was sie regeln darf.</li>
        <li>Welche Wirkung eine Reservierung gegenüber anderen Interessenten hat.</li>
        <li>Wie ein vereinnahmtes Entgelt bei Nichtzustandekommen des Kaufs zu behandeln ist.</li>
      </ul>
    </Aufklapper>
  </>;
}
