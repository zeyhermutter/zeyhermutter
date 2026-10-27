// Eigentuemerbericht (27.10.2026): was im Zeitraum fuer die Immobilie
// passiert ist -- Anfragen, Exposés, Besichtigungen, Rueckmeldungen,
// Angebote. Freigabe Sebastian: als PDF, das er selbst verschickt;
// Interessenten anonym ("Interessent 1, 2 ..."), Zitate nur, wenn er sie
// anhakt.
//
// berichtsdaten() laedt alles fuer die Auswahlseite, inhaltFesthalten() baut
// daraus den Stand, der in owner_reports.content gespeichert und gedruckt
// wird. Gedruckt wird nur dieser Stand -- spaetere Aenderungen in der Akte
// aendern einen festgehaltenen Bericht nicht.

import { FIRMA_SPALTEN, pflichtangaben, type Firma } from "~/lib/firma";

export type Zaehler = { anfragen: number; exposes: number; exposeOeffnungen: number; besichtigungen: number; geplant: number; angebote: number };
export type Zitat = { schluessel: string; wer: string; art: "gefallen" | "bedenken" | "anmerkung"; text: string; datum: string };
export type Angebot = { wer: string; betrag: number; status: string; datum: string };

export type BerichtInhalt = {
  objekt: { nummer: string; titel: string; adresse: string | null; art: string | null; vermarktung: string | null; preis: number | null; status: string };
  zeitraum: { von: string; bis: string };
  erstellt: string;
  kennzahlen: { zeitraum: Zaehler; gesamt: Zaehler };
  portale: { name: string; status: string; seit: string | null }[];
  stimmung: { anzahl: number; interesse: Record<string, number>; preis: Record<string, number>; gruende: Record<string, number> };
  zitate: Zitat[];
  angebote: Angebot[] | null;
  taetigkeiten: string;
  einschaetzung: string;
  firma: { name: string | null; zeile: string | null; telefon: string | null; email: string | null };
  eigentuemer: string[];
};

const tagStr = (d: Date) => d.toISOString().slice(0, 10);
const imZeitraum = (wert: string | null | undefined, von: string, bis: string) => Boolean(wert) && String(wert).slice(0, 10) >= von && String(wert).slice(0, 10) <= bis;
const zaehle = (liste: (string | null | undefined)[]) => liste.reduce<Record<string, number>>((m, k) => { if (k) m[k] = (m[k] ?? 0) + 1; return m; }, {});

export function standardZeitraum(letzterBis: string | null): { von: string; bis: string } {
  const heute = new Date();
  const bis = tagStr(heute);
  if (letzterBis && letzterBis < bis) {
    const [j, m, d] = letzterBis.split("-").map(Number);
    return { von: tagStr(new Date(Date.UTC(j, m - 1, d + 1))), bis };
  }
  const v = new Date(heute); v.setUTCDate(v.getUTCDate() - 13);
  return { von: tagStr(v), bis };
}

export async function berichtsdaten(supabase: any, propertyId: string, von: string, bis: string) {
  const [obj, besitzer, portale, anfragen, links, termine, angebote, frueher, firma] = await Promise.all([
    supabase.from("properties").select("id,property_number,internal_title,status,property_type,transaction_type,purchase_price,rent_cold,property_addresses(street,house_number,postal_code,city)").eq("id", propertyId).maybeSingle(),
    supabase.from("property_owners").select("contact_id,primary_contact,valid_until,contacts(id,salutation,first_name,last_name,email)").eq("property_id", propertyId),
    supabase.from("property_marketing_placements").select("channel_name,status,live_at,ended_at").eq("property_id", propertyId).order("live_at", { ascending: true }),
    supabase.from("inquiries").select("id,contact_id,received_at,created_at").eq("property_id", propertyId).is("archived_at", null),
    supabase.from("expose_links").select("id,contact_id,created_at,open_count").eq("property_id", propertyId),
    supabase.from("viewings").select("id,contact_id,starts_at,status").eq("property_id", propertyId).is("archived_at", null),
    supabase.from("purchase_offers").select("id,contact_id,amount,status,created_at,submitted_at").eq("property_id", propertyId).is("archived_at", null),
    supabase.from("owner_reports").select("id,report_number,period_from,period_to,created_at,sent_at").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(20),
    supabase.from("company_profile").select(FIRMA_SPALTEN).maybeSingle(),
  ]);
  const termineListe = (termine.data ?? []) as any[];
  const terminIds = termineListe.map((t) => t.id);
  const [rueck, kundenRueck] = terminIds.length ? await Promise.all([
    supabase.from("viewing_feedback").select("viewing_id,interest_level,positives,concerns,price_perception,decline_reason,updated_at").in("viewing_id", terminIds),
    supabase.from("viewing_feedback_links").select("id,viewing_id,contact_id,submitted_at,interest_level,liked,concerns,comment,price_perception,decline_reason").eq("property_id", propertyId).not("submitted_at", "is", null),
  ]) : [{ data: [] }, { data: [] }];

  return {
    objekt: obj.data as any,
    besitzer: ((besitzer.data ?? []) as any[]).filter((b) => !b.valid_until || b.valid_until >= tagStr(new Date())),
    portale: (portale.data ?? []) as any[],
    anfragen: (anfragen.data ?? []) as any[],
    links: (links.data ?? []) as any[],
    termine: termineListe,
    angebote: (angebote.data ?? []) as any[],
    angeboteFehler: Boolean(angebote.error),
    rueckmeldungen: (rueck.data ?? []) as any[],
    kundenRueckmeldungen: (kundenRueck.data ?? []) as any[],
    frueher: (frueher.data ?? []) as any[],
    firma: (firma.data ?? null) as Firma | null,
    von, bis,
  };
}

export type Berichtsdaten = Awaited<ReturnType<typeof berichtsdaten>>;

/** "Interessent 1, 2 ..." in der Reihenfolge des ersten Kontakts zum Objekt.
 *  Gezählt wird nur, wer im Bericht mit Namen-Ersatz auftauchen kann
 *  (durchgeführte Besichtigung, Angebot, beantworteter Link) -- sonst stünde
 *  dort "Interessent 2", ohne dass der Eigentümer je von "Interessent 1" liest
 *  (etwa nach abgesagten Terminen). */
function pseudonyme(d: Berichtsdaten) {
  const erste = new Map<string, string>();
  const merke = (id: string | null, wann: string | null) => {
    if (!id || !wann) return;
    const alt = erste.get(id);
    if (!alt || wann < alt) erste.set(id, wann);
  };
  d.termine.filter((t) => t.status === "COMPLETED").forEach((t) => merke(t.contact_id, t.starts_at));
  d.angebote.forEach((o) => merke(o.contact_id, o.created_at));
  d.links.forEach((l) => merke(l.contact_id, l.created_at));
  const reihe = [...erste.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id]) => id);
  const nr = new Map(reihe.map((id, i) => [id, `Interessent ${i + 1}`]));
  return (id: string | null | undefined) => (id && nr.get(id)) || "Interessent";
}

function zaehlerFuer(d: Berichtsdaten, filter: (wann: string | null | undefined) => boolean): Zaehler {
  const jetzt = new Date().toISOString();
  return {
    anfragen: d.anfragen.filter((a) => filter(a.received_at ?? a.created_at)).length,
    exposes: d.links.filter((l) => filter(l.created_at)).length,
    exposeOeffnungen: d.links.filter((l) => filter(l.created_at)).reduce((s, l) => s + (l.open_count ?? 0), 0),
    besichtigungen: d.termine.filter((t) => t.status === "COMPLETED" && filter(t.starts_at)).length,
    geplant: d.termine.filter((t) => (t.status === "PLANNED" || t.status === "CONFIRMED") && t.starts_at >= jetzt).length,
    angebote: d.angebote.filter((o) => o.status !== "DRAFT" && filter(o.created_at)).length,
  };
}

/** Zitate, die zur Auswahl stehen: Feedback des Maklers und Antworten am Link, aus Besichtigungen im Zeitraum. */
export function zitatKandidaten(d: Berichtsdaten): Zitat[] {
  const wer = pseudonyme(d);
  const terminImZeitraum = new Map(d.termine.filter((t) => imZeitraum(t.starts_at, d.von, d.bis)).map((t) => [t.id, t]));
  const aus: Zitat[] = [];
  for (const r of d.rueckmeldungen) {
    const t = terminImZeitraum.get(r.viewing_id);
    if (!t) continue;
    if (r.positives) aus.push({ schluessel: `m-${r.viewing_id}-g`, wer: wer(t.contact_id), art: "gefallen", text: r.positives, datum: t.starts_at });
    if (r.concerns) aus.push({ schluessel: `m-${r.viewing_id}-b`, wer: wer(t.contact_id), art: "bedenken", text: r.concerns, datum: t.starts_at });
  }
  for (const k of d.kundenRueckmeldungen) {
    const t = terminImZeitraum.get(k.viewing_id);
    if (!t) continue;
    if (k.liked) aus.push({ schluessel: `k-${k.id}-g`, wer: wer(k.contact_id), art: "gefallen", text: k.liked, datum: k.submitted_at });
    if (k.concerns) aus.push({ schluessel: `k-${k.id}-b`, wer: wer(k.contact_id), art: "bedenken", text: k.concerns, datum: k.submitted_at });
    if (k.comment) aus.push({ schluessel: `k-${k.id}-a`, wer: wer(k.contact_id), art: "anmerkung", text: k.comment, datum: k.submitted_at });
  }
  return aus;
}

export function taetigkeitenVorschlag(z: Zaehler): string {
  const zeilen = [
    z.anfragen ? `${z.anfragen} ${z.anfragen === 1 ? "Anfrage" : "Anfragen"} beantwortet` : null,
    z.exposes ? `${z.exposes} ${z.exposes === 1 ? "Exposé" : "Exposés"} verschickt` : null,
    z.besichtigungen ? `${z.besichtigungen} ${z.besichtigungen === 1 ? "Besichtigung" : "Besichtigungen"} durchgeführt` : null,
    z.angebote ? `${z.angebote} ${z.angebote === 1 ? "Angebot" : "Angebote"} entgegengenommen` : null,
  ].filter(Boolean);
  return zeilen.map((z) => `• ${z}`).join("\n");
}

export function inhaltFesthalten(d: Berichtsdaten, auswahl: { zitate: Set<string>; angeboteZeigen: boolean; taetigkeiten: string; einschaetzung: string }): BerichtInhalt {
  const p = d.objekt;
  const a = Array.isArray(p.property_addresses) ? p.property_addresses[0] : p.property_addresses;
  const wer = pseudonyme(d);
  const terminImZeitraum = new Set(d.termine.filter((t) => imZeitraum(t.starts_at, d.von, d.bis)).map((t) => t.id));
  // Je Besichtigung zaehlt das Feedback des Maklers; fehlt es, die Antwort am Link.
  const jeTermin = new Map<string, { interesse: string | null; preis: string | null; grund: string | null }>();
  for (const k of d.kundenRueckmeldungen) if (terminImZeitraum.has(k.viewing_id)) jeTermin.set(k.viewing_id, { interesse: k.interest_level, preis: k.price_perception, grund: k.decline_reason });
  for (const r of d.rueckmeldungen) if (terminImZeitraum.has(r.viewing_id)) jeTermin.set(r.viewing_id, { interesse: r.interest_level, preis: r.price_perception, grund: r.decline_reason });
  const stimmen = [...jeTermin.values()];
  const firma = d.firma;
  return {
    objekt: {
      nummer: p.property_number, titel: p.internal_title,
      adresse: a ? [[a.street, a.house_number].filter(Boolean).join(" "), [a.postal_code, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null,
      art: p.property_type ?? null, vermarktung: p.transaction_type ?? null,
      preis: p.transaction_type === "RENT" ? p.rent_cold ?? null : p.purchase_price ?? null, status: p.status,
    },
    zeitraum: { von: d.von, bis: d.bis },
    erstellt: new Date().toISOString(),
    kennzahlen: { zeitraum: zaehlerFuer(d, (w) => imZeitraum(w, d.von, d.bis)), gesamt: zaehlerFuer(d, () => true) },
    portale: d.portale.filter((x) => x.status !== "ENDED" || imZeitraum(x.ended_at, d.von, d.bis)).map((x) => ({ name: x.channel_name, status: x.status, seit: x.live_at })),
    stimmung: {
      anzahl: stimmen.length,
      interesse: zaehle(stimmen.map((s) => s.interesse)),
      preis: zaehle(stimmen.map((s) => s.preis)),
      gruende: zaehle(stimmen.map((s) => s.grund)),
    },
    zitate: zitatKandidaten(d).filter((z) => auswahl.zitate.has(z.schluessel)),
    angebote: auswahl.angeboteZeigen
      ? d.angebote.filter((o) => o.status !== "DRAFT" && imZeitraum(o.created_at, d.von, d.bis)).map((o) => ({ wer: wer(o.contact_id), betrag: Number(o.amount), status: o.status, datum: o.created_at }))
      : null,
    taetigkeiten: auswahl.taetigkeiten.slice(0, 4000),
    einschaetzung: auswahl.einschaetzung.slice(0, 4000),
    firma: { name: firma ? (firma.brand_name || firma.legal_name) : null, zeile: pflichtangaben(firma), telefon: firma?.phone ?? null, email: firma?.email ?? null },
    eigentuemer: d.besitzer.map((b) => {
      const c = Array.isArray(b.contacts) ? b.contacts[0] : b.contacts;
      return c ? [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") : null;
    }).filter(Boolean) as string[],
  };
}
