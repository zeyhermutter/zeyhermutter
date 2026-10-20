// WhatsApp-Knopf (20.10.2026, onOffice-Abgleich).
//
// Der Knopf oeffnet WhatsApp (App oder WhatsApp Web) ueber wa.me mit der
// Nummer des Kontakts und einem vorbereiteten Gruss. Abgeschickt wird in
// WhatsApp selbst -- das CRM verschickt nichts. Beim Klick entsteht ein
// Verlaufseintrag "WhatsApp geöffnet" (activity_events, Typ WHATSAPP); wie
// beim Mailprogramm heisst Oeffnen nicht Senden, deshalb zaehlt er nicht als
// Kontakt fuer die Ampel (AKTIVITAET_ECHT).

/** Nummer fuer wa.me: nur Ziffern, mit Laendervorwahl; deutsche Nummern ohne Vorwahl bekommen 49. */
export function whatsappNummer(roh: string | null | undefined): string | null {
  if (!roh) return null;
  let n = roh.trim().replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = `49${n.slice(1)}`;
  n = n.replace(/\D/g, "");
  return n.length >= 8 && n.length <= 15 ? n : null;
}

/** Deutsche Mobilnummern beginnen mit 015, 016 oder 017. */
export function istMobilnummer(roh: string | null | undefined) {
  const n = whatsappNummer(roh);
  return Boolean(n && /^491[567]/.test(n));
}

export function whatsappGruss(k: { salutation?: string | null; first_name?: string | null; last_name?: string | null }) {
  const anrede = k.salutation === "Herr" ? `Guten Tag Herr ${k.last_name ?? ""}` : k.salutation === "Frau" ? `Guten Tag Frau ${k.last_name ?? ""}` : `Guten Tag ${[k.first_name, k.last_name].filter(Boolean).join(" ")}`;
  return `${anrede.trim()},\n\n`;
}

export function whatsappLink(nummer: string, text: string) {
  return `https://wa.me/${nummer}?text=${encodeURIComponent(text)}`;
}
