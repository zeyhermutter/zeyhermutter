#!/usr/bin/env node
// Haelt fest, was der Anfragen-Assistent aus eingefuegtem Text liest (P2-5, 16.10.2026).
//
// Die Faelle sind ausgedachte Beispiele in der Form, die Portale ueblicherweise
// schicken (beschriftete Zeilen), und freie E-Mails. Echte Beispiele des
// Bueros gehoeren hier dazu, sobald es welche gibt -- anonymisiert.
//
// Wichtig ist auch, was NICHT erkannt werden darf: die Absenderadresse des
// Portals als E-Mail des Interessenten, ein Datum als Telefonnummer, ein
// geratener Name aus freiem Text.

import { leseAnfrage } from "../app/lib/anfrage-parser.ts";

const fehler = [];
const gleich = (fall, feld, ist, soll) => { if (JSON.stringify(ist) !== JSON.stringify(soll)) fehler.push(`${fall}: ${feld} ist ${JSON.stringify(ist)}, erwartet ${JSON.stringify(soll)}`); };

const scout = leseAnfrage(`Neue Kontaktanfrage zu Ihrem Objekt bei ImmobilienScout24
Scout-ID: 154832211
Objekt: Doppelhaushälfte An der Sonnenwiese, 85551 Kirchheim b. München

Anrede: Frau
Vorname: Erika
Nachname: Musterfrau
E-Mail: erika.musterfrau@web.de
Telefon: 0171 / 234 56 78

Nachricht:
Guten Tag,
ich interessiere mich für die Doppelhaushälfte und bitte um das Exposé.

Mit freundlichen Grüßen
Erika Musterfrau
---
Diese E-Mail wurde automatisch von ImmobilienScout24 (noreply@immobilienscout24.de) versendet.`);
gleich("Portal", "anrede", scout.anrede, "Frau");
gleich("Portal", "vorname", scout.vorname, "Erika");
gleich("Portal", "nachname", scout.nachname, "Musterfrau");
gleich("Portal", "email", scout.email, "erika.musterfrau@web.de");
gleich("Portal", "telefon", scout.telefon, "0171 / 234 56 78");
gleich("Portal", "portal", scout.portal, "ImmoScout24");
gleich("Portal", "kanal", scout.kanal, "PORTAL");
gleich("Portal", "portalObjektId", scout.portalObjektId, "154832211");
gleich("Portal", "postleitzahlen", scout.postleitzahlen, ["85551"]);
gleich("Portal", "nachricht", scout.nachricht, "Guten Tag,\nich interessiere mich für die Doppelhaushälfte und bitte um das Exposé.");

const frei = leseAnfrage(`Hallo Herr Zeyher,
bitte schicken Sie mir Unterlagen zu ZM-2026-0005.
Viele Grüße
Max Beispiel
max.beispiel@gmx.de
+49 89 1234567`);
gleich("Frei", "email", frei.email, "max.beispiel@gmx.de");
gleich("Frei", "telefon", frei.telefon, "+49 89 1234567");
gleich("Frei", "objektnummer", frei.objektnummer, "ZM-2026-0005");
gleich("Frei", "vorname (nicht raten)", frei.vorname, null);
gleich("Frei", "nachname (nicht raten)", frei.nachname, null);

const name = leseAnfrage(`Name: Herr Dr. Hans Huber
Mail: h.huber@example.com
Mobil: +49 (151) 2345-678
Ihre Nachricht: Exposé bitte.`);
gleich("Name in einer Zeile", "anrede", name.anrede, "Herr");
gleich("Name in einer Zeile", "vorname", name.vorname, "Hans");
gleich("Name in einer Zeile", "nachname", name.nachname, "Huber");
gleich("Name in einer Zeile", "nachricht", name.nachricht, "Exposé bitte.");

const nurPortal = leseAnfrage("Von: noreply@immowelt.de\nTermin am 01.10.2026 um 10 Uhr");
gleich("Portaladresse", "email", nurPortal.email, null);
gleich("Datum", "telefon", nurPortal.telefon, null);

if (fehler.length) { console.error("Anfragen-Assistent:\n  " + fehler.join("\n  ")); process.exit(1); }
console.log("Anfragen-Assistent: Portalformat, freie E-Mail, Name in einer Zeile; keine Portaladresse als Absender, kein Datum als Telefonnummer, kein geratener Name.");
