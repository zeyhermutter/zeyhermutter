// Herkunft eines Kontakts (20.10.2026, onOffice-Abgleich): dieselbe Liste wie
// bei Leads (lead_sources). Die erste Anfrage bzw. der erste Lead setzt sie
// automatisch, solange sie leer ist (Trigger kontakt_herkunft_setzen); hier
// laesst sie sich von Hand setzen oder korrigieren.

export type Herkunftsquelle = { id: string; key: string; label: string };

export function HerkunftFelder({ quellen, sourceId, detail }: { quellen: Herkunftsquelle[]; sourceId?: string | null; detail?: string | null }) {
  return (
    <>
      <label className="form-field"><span>Herkunft</span>
        <select name="source_id" defaultValue={sourceId ?? ""}>
          <option value="">— nicht bekannt —</option>
          {quellen.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
        </select>
      </label>
      <label className="form-field"><span>Herkunft genauer</span><input name="source_detail" defaultValue={detail ?? ""} placeholder="z. B. ImmobilienScout24 oder wer empfohlen hat" maxLength={200} /></label>
    </>
  );
}

/** Aktive Quellen fuer die Auswahl (RLS: lesbar fuer angemeldete Benutzer). */
export async function ladeHerkunftsquellen(supabase: any): Promise<Herkunftsquelle[]> {
  const { data } = await supabase.from("lead_sources").select("id,key,label").eq("active", true).order("sort_order");
  return (data ?? []) as Herkunftsquelle[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Werte aus dem Formular: ungueltige Kennung wird zu null. */
export function herkunftAusFormular(fd: FormData) {
  const id = String(fd.get("source_id") ?? "").trim();
  const detail = String(fd.get("source_detail") ?? "").trim().slice(0, 200);
  return { source_id: UUID.test(id) ? id : null, source_detail: detail || null };
}
