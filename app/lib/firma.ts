// Firmenangaben an einer Stelle (19.10.2026).
//
// Die Angaben traegt das Buero unter Verwaltung › Firma & Fristen ein. Das
// CRM setzt sie nur zusammen -- in der Exposé-Fusszeile (eigene Kopie in
// supabase/functions/generate-property-expose) und im E-Mail-Platzhalter
// {{firma_pflichtangaben}}. Es prueft nicht, ob die Angaben rechtlich
// vollstaendig sind; es zeigt nur, welche Felder leer sind.

export type Firma = {
  id: string;
  legal_name: string | null;
  brand_name: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  registered_seat: string | null;
  register_court: string | null;
  register_number: string | null;
  managing_directors: string | null;
  tax_number: string | null;
  vat_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  version: number;
};

export const FIRMA_SPALTEN = "id,legal_name,brand_name,street,postal_code,city,registered_seat,register_court,register_number,managing_directors,tax_number,vat_id,phone,email,website,version";

const leer = (v: string | null | undefined) => !v || !v.trim();

/**
 * Personengesellschaft (26.10.2026: das Buero tritt bis zur UG-Gruendung als
 * GbR auf). Dort vertreten die Gesellschafter, nicht Geschaeftsfuehrer, und
 * eine nicht eingetragene GbR hat weder Registergericht noch -nummer.
 */
export function istPersonengesellschaft(legalName: string | null | undefined): boolean {
  return /\b(e?GbR|OHG|PartG)\b/.test(legalName ?? "");
}
export function vertretungsBezeichnung(legalName: string | null | undefined): string {
  return istPersonengesellschaft(legalName) ? "Gesellschafter" : "Geschäftsführer";
}

/** Die Felder, die das Dokument vom 19.10.2026 fuer Geschaeftspost nennt. */
export const KERNFELDER: { feld: keyof Firma; name: string }[] = [
  { feld: "legal_name", name: "Vollständige Firma" },
  { feld: "street", name: "Straße und Hausnummer" },
  { feld: "postal_code", name: "Postleitzahl" },
  { feld: "city", name: "Ort" },
  { feld: "registered_seat", name: "Sitz der Gesellschaft" },
  { feld: "register_court", name: "Registergericht" },
  { feld: "register_number", name: "Registernummer" },
  { feld: "managing_directors", name: "Geschäftsführer bzw. Gesellschafter" },
];

export function fehlendeAngaben(f: Firma | null): string[] {
  if (!f) return KERNFELDER.map((k) => k.name);
  // Nicht eingetragene GbR: kein Register (eGbR, OHG, PartG sind eingetragen).
  const ohneRegister = /\bGbR\b/.test(f.legal_name ?? "") && !/\beGbR\b/.test(f.legal_name ?? "");
  return KERNFELDER
    .filter((k) => !(ohneRegister && (k.feld === "register_court" || k.feld === "register_number")))
    .filter((k) => leer(f[k.feld] as string | null))
    .map((k) => (k.feld === "managing_directors" ? vertretungsBezeichnung(f.legal_name) : k.name));
}

/**
 * Eine Zeile mit den eingetragenen Angaben, z. B. fuer E-Mail-Fusszeilen.
 * Leere Felder fallen weg; ist gar nichts eingetragen, kommt null.
 */
export function pflichtangaben(f: Firma | null): string | null {
  if (!f) return null;
  const anschrift = [f.street, [f.postal_code, f.city].filter((x) => !leer(x)).join(" ")].filter((x) => !leer(x)).join(", ");
  const teile = [
    f.legal_name,
    anschrift || null,
    leer(f.registered_seat) ? null : `Sitz: ${f.registered_seat}`,
    leer(f.register_court) && leer(f.register_number) ? null : `Registergericht: ${[f.register_court, f.register_number].filter((x) => !leer(x)).join(", ")}`,
    leer(f.managing_directors) ? null : `${vertretungsBezeichnung(f.legal_name)}: ${f.managing_directors}`,
    leer(f.vat_id) ? null : `USt-IdNr.: ${f.vat_id}`,
  ].filter((x): x is string => !leer(x));
  return teile.length ? teile.join(" · ") : null;
}
