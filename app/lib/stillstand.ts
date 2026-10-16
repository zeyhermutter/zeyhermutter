// "Liegen geblieben" je Phase: Schwellen in Tagen (P2-1, 16.10.2026).
//
// Ein laufender Vorgang, an dem seit so vielen Tagen keine echte Aktivitaet
// erfasst ist und fuer den kein Schritt ab heute geplant ist, erscheint in
// "Mein Tag" unter "Stillstand".
//
// Startwerte von Sebastian am 16.10.2026 ("Vorschlag übernehmen"). Sie
// stehen bewusst erst hier im Code und nicht in einer Tabelle: Eine Tabelle,
// die man im CRM einstellen kann, braucht eine Datenbankmigration und kommt
// mit eigener Freigabe.
//
// ECHTE AKTIVITAET
//
// Nur was ein Mensch getan hat, setzt den Zaehler zurueck:
//   - ein Verlaufseintrag der Art Notiz, Telefonat, E-Mail oder Termin/Gespraech
//     (AKTIVITAET_ECHT), am Vorgang oder an seinem Kontakt
//   - eine erledigte Aufgabe am Vorgang
// Nicht: das Bearbeiten eines Feldes, automatische Eintraege (Website-Anfrage,
// Lead umgewandelt, Pflichtangaben), das Anlegen einer Aufgabe.
// Ohne jede Aktivitaet zaehlt der Tag, an dem der Vorgang entstand.

export const STILLSTAND_TAGE = {
  lead: { NEW: 2, CONTACTED: 7, QUALIFIED: 7, APPOINTMENT: 7, VALUATION: 14, OFFER: 14 } as Record<string, number>,
  inquiry: { CONTACTED: 3, QUALIFIED: 3, VIEWING_PLANNED: 3 } as Record<string, number>,
  property: { MARKETING: 14 } as Record<string, number>,
  project: { ACTIVE: 14 } as Record<string, number>,
};

/** Verlaufsarten, die ein Mensch erfasst (lead-detail, Kontakt, Telefonat, E-Mail). */
export const AKTIVITAET_ECHT = ["NOTE", "PHONE_CALL", "EMAIL", "MEETING"];

/** Die laengste Schwelle -- so weit zurueck muss man nach Aktivitaet suchen. */
export const STILLSTAND_LAENGSTE = Math.max(
  ...Object.values(STILLSTAND_TAGE).flatMap((t) => Object.values(t)),
);
