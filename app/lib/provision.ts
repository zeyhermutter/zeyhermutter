// Provision: Betrag netto, Zahlung brutto (19.10.2026, Entscheidung Sebastian).
//
// Vereinbarte und tatsaechliche Provision sind Nettobetraege. Der
// Zahlungseingang wird brutto erfasst -- so, wie er auf dem Konto ankommt --
// und gegen "Provision zzgl. Umsatzsteuer" geprueft (Datenbank:
// validate_commission, Spalten vat_rate und payment_basis). Provisionen mit
// Zahlung vor der Umstellung haben payment_basis = 'NET'.

type Zeile = { actual_amount?: unknown; expected_amount?: unknown; paid_amount?: unknown; vat_rate?: unknown; payment_basis?: string | null };

const rund = (n: number) => Math.round(n * 100) / 100;

export function ustSatz(z: Zeile): number {
  const n = Number(z.vat_rate ?? 19);
  return Number.isFinite(n) ? n : 19;
}

export function bruttoErfasst(z: Zeile): boolean {
  return z.payment_basis !== "NET";
}

/** Provision netto: tatsaechlich, sonst erwartet. */
export function provisionNetto(z: Zeile): number {
  const n = Number(z.actual_amount ?? z.expected_amount);
  return Number.isFinite(n) ? n : 0;
}

export function umsatzsteuer(z: Zeile): number {
  return rund(provisionNetto(z) * ustSatz(z) / 100);
}

/** Was insgesamt eingehen soll: brutto, bei alter Erfassung netto. */
export function zahlziel(z: Zeile): number {
  return bruttoErfasst(z) ? rund(provisionNetto(z) * (1 + ustSatz(z) / 100)) : provisionNetto(z);
}

/** Noch offen, in der Lesart der Zahlung (brutto bzw. alt netto). */
export function offenZahlung(z: Zeile): number {
  return Math.max(0, rund(zahlziel(z) - Number(z.paid_amount ?? 0)));
}

/** Noch offen, netto -- fuer Summen und Auswertungen. */
export function offenNetto(z: Zeile): number {
  const faktor = bruttoErfasst(z) ? 1 + ustSatz(z) / 100 : 1;
  return Math.max(0, rund(provisionNetto(z) - Number(z.paid_amount ?? 0) / faktor));
}
