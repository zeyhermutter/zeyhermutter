import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/inquiry-assistent";
import { leseAnfrage, type AnfrageVorschlag } from "~/lib/anfrage-parser";
import { requirePermission } from "~/lib/auth.server";
import { ANFRAGEKANAL } from "~/lib/labels";
import { crmDateAtTimeToIso, crmToday } from "~/lib/local-time";
import { plusTage } from "~/lib/mein-tag.server";
import "~/inquiry.css";
import "~/anfrage-assistent.css";

// Anfragen-Assistent (P2-5, 16.10.2026): "Anfrage einfügen".
//
// Vorher: Portal- oder E-Mail-Anfrage lesen, Kontakt suchen, nicht gefunden,
// Kontakt anlegen (eigene Seite), zurück, Anfrage anlegen, Objekt aus einer
// Liste wählen, Nachricht hineinkopieren -- zwei Formulare, mehrere
// Seitenwechsel, alles abgeschrieben.
//
// Jetzt: Text einfügen → "Auswerten" schlägt Kontaktdaten, einen vorhandenen
// Kontakt (Dublettenprüfung wie beim Kontakt anlegen) und das Objekt vor →
// prüfen → "Anfrage anlegen" legt bei Bedarf den Kontakt an, die Anfrage und
// auf Wunsch eine Wiedervorlage, und führt direkt zu "E-Mail schreiben".
//
// Ohne KI. Nichts wird gespeichert, bevor "Anfrage anlegen" gedrückt ist; jedes
// erkannte Feld steht zum Prüfen da. Die Regeln stehen in
// app/lib/anfrage-parser.ts, die Prüffälle in scripts/check-anfrage-parser.mjs.

type Kandidat = { id: string; nummer: string; name: string; email: string | null; gruende: string[] };
type ObjektKandidat = { id: string; nummer: string; titel: string; ort: string | null; grund: string };
type Auswertung = { schritt: "vorschlag"; roh: string; v: AnfrageVorschlag; kontakte: Kandidat[]; objekte: ObjektKandidat[]; fehler?: string; dubletten?: boolean };
type Ergebnis = Auswertung | { schritt: "eingabe"; roh: string; fehler: string };

const WIEDERVORLAGE_TAGE = 3;
const GRUND: Record<string, string> = { EMAIL: "gleiche E-Mail", MOBILE: "gleiche Mobilnummer", NAME_ADDRESS: "gleicher Name und Anschrift", NAME: "gleicher Name" };

function text(fd: FormData, k: string) { return String(fd.get(k) ?? "").trim(); }
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? v[0] ?? null : v ?? null; }
const istMobil = (nr: string) => /^(?:\+49|0049|0)\s*1[5-7]/.test(nr.replace(/[\s/()-]/g, ""));

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, userId } = await requirePermission(request, context.cloudflare.env, "inquiry.write");
  const [{ data: profile }, { data: objekte }] = await Promise.all([
    supabase.from("profiles").select("user_id,display_name").eq("status", "ACTIVE").order("display_name"),
    supabase.from("properties").select("id,property_number,internal_title,status").not("status", "in", "(ARCHIVED,SOLD,LOST,WITHDRAWN)").order("property_number"),
  ]);
  return data({ profile: profile ?? [], objekte: objekte ?? [], ich: userId }, { headers: responseHeaders() });
}

async function kandidaten(supabase: any, v: AnfrageVorschlag): Promise<{ kontakte: Kandidat[]; objekte: ObjektKandidat[] }> {
  const mobil = v.telefon && istMobil(v.telefon) ? v.telefon : null;
  const [dub, perNummer, perPlz] = await Promise.all([
    (v.email || mobil || (v.vorname && v.nachname))
      ? supabase.rpc("find_contact_duplicates", { p_first_name: v.vorname ?? "", p_last_name: v.nachname ?? "", p_email: v.email, p_mobile: mobil, p_street: null, p_house_number: null, p_postal_code: null, p_city: null, p_exclude_contact_id: null })
      : Promise.resolve({ data: [] }),
    v.objektnummer ? supabase.from("properties").select("id,property_number,internal_title,property_addresses(postal_code,city)").eq("property_number", v.objektnummer).limit(1) : Promise.resolve({ data: [] }),
    v.postleitzahlen.length ? supabase.from("property_addresses").select("postal_code,city,properties!inner(id,property_number,internal_title,status)").in("postal_code", v.postleitzahlen).not("properties.status", "in", "(ARCHIVED,SOLD,LOST,WITHDRAWN)").limit(10) : Promise.resolve({ data: [] }),
  ]);
  const kontakte: Kandidat[] = ((dub.data ?? []) as any[]).map((k) => ({
    id: k.contact_id, nummer: k.contact_number, name: [k.first_name, k.last_name].filter(Boolean).join(" "), email: k.email, gruende: (k.reasons ?? []).map((g: string) => GRUND[g] ?? g),
  }));
  const objekte: ObjektKandidat[] = [];
  for (const p of (perNummer.data ?? []) as any[]) {
    const a = one(p.property_addresses) as any;
    objekte.push({ id: p.id, nummer: p.property_number, titel: p.internal_title, ort: a ? `${a.postal_code} ${a.city}` : null, grund: "Objektnummer im Text" });
  }
  for (const a of (perPlz.data ?? []) as any[]) {
    const p = one(a.properties) as any;
    if (p && !objekte.some((o) => o.id === p.id)) objekte.push({ id: p.id, nummer: p.property_number, titel: p.internal_title, ort: `${a.postal_code} ${a.city}`, grund: `Postleitzahl ${a.postal_code} im Text` });
  }
  return { kontakte, objekte };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requirePermission(request, context.cloudflare.env, "inquiry.write");
  const fd = await request.formData();
  const absicht = text(fd, "_intent");
  const roh = String(fd.get("roh") ?? "").slice(0, 20000);

  if (absicht === "auswerten") {
    if (roh.trim().length < 10) return data<Ergebnis>({ schritt: "eingabe", roh, fehler: "Bitte den Text der Anfrage einfügen." }, { status: 400, headers: responseHeaders() });
    const v = leseAnfrage(roh);
    const { kontakte, objekte } = await kandidaten(supabase, v);
    return data<Ergebnis>({ schritt: "vorschlag", roh, v, kontakte, objekte }, { headers: responseHeaders() });
  }

  if (absicht !== "anlegen") return data<Ergebnis>({ schritt: "eingabe", roh, fehler: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });

  // Was der Benutzer geprüft und ggf. geändert hat -- nicht der erste Vorschlag.
  const v: AnfrageVorschlag = {
    ...leseAnfrage(roh),
    anrede: text(fd, "anrede") || null, vorname: text(fd, "vorname") || null, nachname: text(fd, "nachname") || null,
    email: text(fd, "email") || null, telefon: text(fd, "telefon") || null, nachricht: String(fd.get("nachricht") ?? "").trim() || null,
  };
  const zurueck = async (fehler: string, dubletten = false) => {
    const k = await kandidaten(supabase, v);
    return data<Ergebnis>({ schritt: "vorschlag", roh, v, ...k, fehler, dubletten }, { status: 400, headers: responseHeaders() });
  };

  let kontaktId = text(fd, "kontakt");
  if (!kontaktId) return zurueck("Bitte wählen: vorhandener Kontakt oder neuer Kontakt.");
  if (kontaktId === "neu") {
    if (!v.vorname || !v.nachname) return zurueck("Für einen neuen Kontakt bitte Vor- und Nachnamen angeben.");
    if (!v.email && !v.telefon) return zurueck("Für einen neuen Kontakt bitte E-Mail oder Telefon angeben.");
    // Dieselbe Dublettenprüfung wie beim Kontakt anlegen, unmittelbar vor dem Speichern.
    const mobil = v.telefon && istMobil(v.telefon) ? v.telefon : null;
    const { data: dubletten, error: dubFehler } = await supabase.rpc("find_contact_duplicates", { p_first_name: v.vorname, p_last_name: v.nachname, p_email: v.email, p_mobile: mobil, p_street: null, p_house_number: null, p_postal_code: null, p_city: null, p_exclude_contact_id: null });
    if (dubFehler) return zurueck("Die Dublettenprüfung konnte nicht laufen. Es wurde nichts gespeichert.");
    if ((dubletten ?? []).length && text(fd, "trotzdem_neu") !== "1") return zurueck("Es gibt bereits einen passenden Kontakt. Bitte ihn wählen – oder ausdrücklich „trotzdem neu anlegen“ bestätigen.", true);
    const { data: neu, error } = await supabase.rpc("create_contact_with_primary_address", {
      p_first_name: v.vorname, p_last_name: v.nachname, p_email: v.email,
      p_phone: v.telefon && !istMobil(v.telefon) ? v.telefon : null, p_mobile: mobil,
      p_salutation: v.anrede, p_preferred_channel: null, p_internal_notes: null,
      p_street: null, p_house_number: null, p_postal_code: null, p_city: null, p_country: "DE",
    });
    if (error || !neu) return zurueck("Der Kontakt konnte nicht angelegt werden. Es wurde nichts gespeichert.");
    kontaktId = String(neu);
  }

  const kanal = text(fd, "channel");
  const objektId = text(fd, "property_id") || null;
  const { data: anfrage, error: anfrageFehler } = await supabase.from("inquiries").insert({
    contact_id: kontaktId, property_id: objektId,
    channel: kanal in ANFRAGEKANAL ? kanal : "OTHER",
    source_label: text(fd, "source_label").slice(0, 200) || null,
    message: v.nachricht?.slice(0, 8000) ?? null,
    primary_responsible_user: text(fd, "primary_responsible_user") || userId,
    created_by: userId, updated_by: userId,
  }).select("id,inquiry_number").single();
  if (anfrageFehler || !anfrage) {
    // Ein neu angelegter Kontakt bleibt bestehen -- er wird im Fehlertext genannt, nicht still verworfen.
    return zurueck(text(fd, "kontakt") === "neu"
      ? "Der Kontakt wurde angelegt, die Anfrage aber nicht. Bitte „vorhandener Kontakt“ wählen und erneut anlegen."
      : "Die Anfrage konnte nicht angelegt werden.");
  }

  let hinweis = "";
  if (text(fd, "wiedervorlage") === "1") {
    const faellig = crmDateAtTimeToIso(plusTage(crmToday(), WIEDERVORLAGE_TAGE), "09:00");
    const name = [v.vorname, v.nachname].filter(Boolean).join(" ");
    const { error } = await supabase.from("tasks").insert({
      title: `Anfrage nachfassen: ${name || anfrage.inquiry_number}`.slice(0, 300),
      status: "OPEN", priority: "NORMAL", due_at: faellig,
      responsible_user: text(fd, "primary_responsible_user") || userId,
      contact_id: kontaktId, inquiry_id: anfrage.id, property_id: objektId,
      created_by: userId, updated_by: userId,
    });
    if (error) hinweis = "&wiedervorlage=fehler";
  }

  const ziel = text(fd, "danach") === "email" ? `/crm/email?inquiry_id=${anfrage.id}${hinweis}` : `/inquiries/${anfrage.id}${hinweis ? `?${hinweis.slice(1)}` : ""}`;
  return redirect(ziel, { headers: responseHeaders() });
}

function Erkannt({ feld, v }: { feld: string; v: AnfrageVorschlag }) {
  const wert = (v as any)[feld];
  if (!wert) return <small className="assistent-marke leer">nicht erkannt</small>;
  return v.ausZeile.includes(feld) ? <small className="assistent-marke sicher">aus beschrifteter Zeile</small> : <small className="assistent-marke pruefen">bitte prüfen</small>;
}

export default function InquiryAssistent() {
  const { profile, objekte, ich } = useLoaderData<typeof loader>();
  const e = useActionData<typeof action>() as Ergebnis | undefined;
  const nav = useNavigation();
  const laeuft = nav.state !== "idle";

  if (!e || e.schritt === "eingabe") {
    return (
      <main className="editor-shell anfrage-assistent">
        <header className="editor-header"><div><Link className="back-link" to="/inquiries">← Anfragen</Link><h1 className="editor-title">Anfrage einfügen</h1><p className="editor-meta">Text einer Portal- oder E-Mail-Anfrage einfügen. Der Assistent schlägt Kontakt, Objekt und Nachricht vor; gespeichert wird erst nach Ihrer Prüfung.</p></div></header>
        {e?.fehler ? <p className="form-error">{e.fehler}</p> : null}
        <Form method="post" className="data-card assistent-eingabe">
          <input type="hidden" name="_intent" value="auswerten" />
          <label className="form-field"><span>Text der Anfrage</span><textarea name="roh" rows={14} defaultValue={e?.roh ?? ""} required placeholder="Den gesamten Text der E-Mail hier einfügen – mit Namen, E-Mail, Telefon und Nachricht." /></label>
          <div className="inline-actions"><button className="primary-button" type="submit" disabled={laeuft}>{laeuft ? "Wird ausgewertet …" : "Auswerten"}</button><Link className="secondary-button link-button" to="/inquiries/new">Ohne Text anlegen</Link></div>
          <p className="form-help">Erkannt werden beschriftete Zeilen wie „Vorname:“, „E-Mail:“, „Telefon:“, „Nachricht:“, außerdem E-Mail-Adressen, Telefonnummern, Objektnummern (ZM-2026-…) und Postleitzahlen. Ohne KI; nichts verlässt das CRM.</p>
        </Form>
      </main>
    );
  }

  const { v, kontakte, objekte: vorschlagObjekte } = e;
  const vorgewaehlterKontakt = kontakte.length === 1 && kontakte[0].gruende.some((g) => g !== "gleicher Name") ? kontakte[0].id : kontakte.length ? "" : "neu";
  const quelle = [v.portal, v.portalObjektId ? `Objekt-ID ${v.portalObjektId}` : null].filter(Boolean).join(" · ");

  return (
    <main className="editor-shell anfrage-assistent">
      <header className="editor-header"><div><Link className="back-link" to="/inquiries">← Anfragen</Link><h1 className="editor-title">Anfrage prüfen</h1><p className="editor-meta">Vorschlag aus dem eingefügten Text. Bitte jedes Feld prüfen – gespeichert wird erst mit „Anfrage anlegen“.</p></div></header>
      {e.fehler ? <p className="form-error">{e.fehler}</p> : null}

      <Form method="post" className="assistent-raster">
        <input type="hidden" name="_intent" value="anlegen" />
        <input type="hidden" name="roh" value={e.roh} />

        <section className="data-card" aria-label="Kontakt">
          <div className="card-head"><div><h2>Kontakt</h2></div></div>
          {kontakte.length ? (
            <fieldset className="assistent-wahl">
              <legend>Vorhandene Kontakte, die passen könnten</legend>
              {kontakte.map((k) => (
                <label key={k.id}><input type="radio" name="kontakt" value={k.id} defaultChecked={vorgewaehlterKontakt === k.id} required /> <span><strong>{k.name}</strong> · {k.nummer}{k.email ? ` · ${k.email}` : ""}<small>{k.gruende.join(", ")}</small></span> <Link className="subtle-link" to={`/crm/contacts/${k.id}`} target="_blank" rel="noreferrer">ansehen ↗</Link></label>
              ))}
              <label><input type="radio" name="kontakt" value="neu" defaultChecked={vorgewaehlterKontakt === "neu"} required /> <span><strong>Neuen Kontakt anlegen</strong><small>mit den Angaben unten</small></span></label>
              {e.dubletten ? <label className="checkbox-row"><input type="checkbox" name="trotzdem_neu" value="1" /><span>Ich habe die Treffer geprüft – trotzdem neu anlegen</span></label> : null}
            </fieldset>
          ) : <><input type="hidden" name="kontakt" value="neu" /><p className="form-help">Kein passender Kontakt gefunden (geprüft: E-Mail, Mobilnummer, Name). Es wird ein neuer angelegt.</p></>}
          <div className="assistent-felder">
            <label className="form-field"><span>Anrede <Erkannt feld="anrede" v={v} /></span><select name="anrede" defaultValue={v.anrede ?? ""}><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option></select></label>
            <label className="form-field"><span>Vorname <Erkannt feld="vorname" v={v} /></span><input name="vorname" defaultValue={v.vorname ?? ""} /></label>
            <label className="form-field"><span>Nachname <Erkannt feld="nachname" v={v} /></span><input name="nachname" defaultValue={v.nachname ?? ""} /></label>
            <label className="form-field"><span>E-Mail <Erkannt feld="email" v={v} /></span><input name="email" type="email" defaultValue={v.email ?? ""} /></label>
            <label className="form-field"><span>Telefon <Erkannt feld="telefon" v={v} /></span><input name="telefon" defaultValue={v.telefon ?? ""} /></label>
          </div>
          <p className="form-help">Bei einem vorhandenen Kontakt werden diese Angaben nicht übernommen – die Akte bleibt, wie sie ist.</p>
        </section>

        <section className="data-card" aria-label="Anfrage">
          <div className="card-head"><div><h2>Anfrage</h2></div></div>
          <div className="assistent-felder">
            <label className="form-field"><span>Objekt {vorschlagObjekte.length ? <small className="assistent-marke pruefen">{vorschlagObjekte[0].grund}</small> : <small className="assistent-marke leer">nicht erkannt</small>}</span>
              <select name="property_id" defaultValue={vorschlagObjekte.length === 1 ? vorschlagObjekte[0].id : ""}>
                <option value="">Keine konkrete Immobilie</option>
                {vorschlagObjekte.length ? <optgroup label="Vorschlag">{vorschlagObjekte.map((o) => <option key={o.id} value={o.id}>{o.nummer} · {o.titel}{o.ort ? ` · ${o.ort}` : ""}</option>)}</optgroup> : null}
                <optgroup label="Alle laufenden Objekte">{(objekte as any[]).filter((o) => !vorschlagObjekte.some((x) => x.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.property_number} · {o.internal_title}</option>)}</optgroup>
              </select>
            </label>
            <label className="form-field"><span>Eingangskanal</span><select name="channel" defaultValue={v.kanal}>{Object.entries(ANFRAGEKANAL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="form-field"><span>Quelle / Portal {v.portal ? <small className="assistent-marke pruefen">erkannt: {v.portal}</small> : null}</span><input name="source_label" defaultValue={quelle} placeholder="z. B. ImmoScout24" /></label>
            <label className="form-field"><span>Verantwortlich</span><select name="primary_responsible_user" defaultValue={ich}>{(profile as any[]).map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>
          </div>
          <label className="form-field"><span>Nachricht <Erkannt feld="nachricht" v={v} /></span><textarea name="nachricht" rows={8} defaultValue={v.nachricht ?? e.roh.trim().slice(0, 8000)} /></label>
          {!v.nachricht ? <p className="form-help">Keine Zeile „Nachricht:“ gefunden – vorbelegt ist der ganze Text. Bitte kürzen.</p> : null}
          <label className="checkbox-row"><input type="checkbox" name="wiedervorlage" value="1" defaultChecked /><span>Wiedervorlage „Anfrage nachfassen“ in {WIEDERVORLAGE_TAGE} Tagen</span></label>
          <fieldset className="assistent-wahl">
            <legend>Danach</legend>
            <label><input type="radio" name="danach" value="email" defaultChecked /> <span>E-Mail schreiben (Antwort oder Exposé)</span></label>
            <label><input type="radio" name="danach" value="anfrage" /> <span>Anfrage öffnen</span></label>
          </fieldset>
        </section>

        <div className="inline-actions assistent-aktionen">
          <button className="primary-button" type="submit" disabled={laeuft}>{laeuft ? "Wird angelegt …" : "Anfrage anlegen"}</button>
          <Link className="secondary-button link-button" to="/inquiries/assistent">Neu beginnen</Link>
        </div>
      </Form>
    </main>
  );
}
