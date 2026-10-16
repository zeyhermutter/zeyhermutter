// Ergebnis eines Telefonats (P1, 16.10.2026). Steht in
// activity_events.metadata.ergebnis und im Titel des Verlaufseintrags.
// Freier Wert ohne CHECK-Bedingung, deshalb hier und nicht in labels.ts.
export const TELEFONAT_ERGEBNIS: Record<string, string> = {
  ERREICHT: "erreicht",
  NICHT_ERREICHT: "nicht erreicht",
  MAILBOX: "Mailbox",
  RUECKRUF: "Rückruf vereinbart",
};
