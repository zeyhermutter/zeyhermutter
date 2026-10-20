import { data, Form, Link, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/contact-new";
import { requireActiveUser } from "~/lib/auth.server";
import { HerkunftFelder, herkunftAusFormular, ladeHerkunftsquellen } from "~/components/herkunft-felder";
import { leseSignatur } from "~/lib/signatur-parser";
import { useState } from "react";

type Duplicate = {
  contact_id: string;
  contact_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  mobile: string | null;
  reasons: string[];
};

type ActionResult = {
  error?: string;
  fields?: Record<string, string>;
  duplicates?: Duplicate[];
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  return data({ herkunftsquellen: await ladeHerkunftsquellen(supabase) }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const formData = await request.formData();

  const fields = {
    first_name: text(formData, "first_name"),
    last_name: text(formData, "last_name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    mobile: text(formData, "mobile"),
    salutation: text(formData, "salutation"),
    preferred_channel: text(formData, "preferred_channel"),
    internal_notes: text(formData, "internal_notes"),
    street: text(formData, "street"),
    house_number: text(formData, "house_number"),
    postal_code: text(formData, "postal_code"),
    city: text(formData, "city"),
    source_id: text(formData, "source_id"),
    source_detail: text(formData, "source_detail"),
    birth_date: text(formData, "birth_date"),
  };

  if (!fields.first_name || !fields.last_name) {
    return data<ActionResult>({ error: "Vorname und Nachname sind Pflichtfelder.", fields }, { status: 400, headers: responseHeaders() });
  }
  if (!fields.email && !fields.phone && !fields.mobile) {
    return data<ActionResult>({ error: "Mindestens E-Mail, Telefon oder Mobilnummer ist erforderlich.", fields }, { status: 400, headers: responseHeaders() });
  }

  const hasAnyAddress = Boolean(fields.street || fields.house_number || fields.postal_code || fields.city);
  if (hasAnyAddress && (!fields.street || !fields.postal_code || !fields.city)) {
    return data<ActionResult>({ error: "Wenn eine Adresse erfasst wird, sind Straße, PLZ und Ort erforderlich.", fields }, { status: 400, headers: responseHeaders() });
  }

  const { data: duplicateRows, error: duplicateError } = await supabase.rpc("find_contact_duplicates", {
    p_first_name: fields.first_name,
    p_last_name: fields.last_name,
    p_email: fields.email || null,
    p_mobile: fields.mobile || null,
    p_street: fields.street || null,
    p_house_number: fields.house_number || null,
    p_postal_code: fields.postal_code || null,
    p_city: fields.city || null,
    p_exclude_contact_id: null,
  });

  if (duplicateError) {
    return data<ActionResult>({ error: "Duplikatprüfung konnte nicht durchgeführt werden. Kontakt wurde nicht gespeichert.", fields }, { status: 500, headers: responseHeaders() });
  }

  const duplicates = (duplicateRows ?? []) as Duplicate[];
  const forceDuplicate = text(formData, "force_duplicate") === "1";
  if (duplicates.length > 0 && !forceDuplicate) {
    return data<ActionResult>({ error: "Möglicher bestehender Kontakt gefunden. Bitte zuerst prüfen.", fields, duplicates }, { status: 409, headers: responseHeaders() });
  }

  const { data: contactId, error } = await supabase.rpc("create_contact_with_primary_address", {
    p_first_name: fields.first_name,
    p_last_name: fields.last_name,
    p_email: fields.email || null,
    p_phone: fields.phone || null,
    p_mobile: fields.mobile || null,
    p_salutation: fields.salutation || null,
    p_preferred_channel: fields.preferred_channel || null,
    p_internal_notes: fields.internal_notes || null,
    p_street: fields.street || null,
    p_house_number: fields.house_number || null,
    p_postal_code: fields.postal_code || null,
    p_city: fields.city || null,
    p_country: "DE",
  });

  if (error || !contactId) {
    return data<ActionResult>({ error: "Kontakt konnte nicht atomar gespeichert werden. Es wurden keine Teil-Datensätze übernommen.", fields }, { status: 400, headers: responseHeaders() });
  }

  // Herkunft und Geburtsdatum (20.10.2026) setzt die Anlage-Funktion nicht --
  // sie folgen direkt danach. Scheitert das, bleibt der Kontakt trotzdem.
  const herkunft = herkunftAusFormular(formData);
  const geburt = /^\d{4}-\d{2}-\d{2}$/.test(fields.birth_date) ? fields.birth_date : null;
  if (herkunft.source_id || herkunft.source_detail || geburt) {
    await supabase.from("contacts").update({ ...herkunft, ...(geburt ? { birth_date: geburt } : {}) }).eq("id", String(contactId));
  }

  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "";
  if (returnTo.startsWith("/properties/")) {
    const target = new URL(returnTo, "https://zeyhermutter.local");
    target.searchParams.set("newOwner", String(contactId));
    return redirect(`${target.pathname}${target.search}${target.hash}`, { headers: responseHeaders() });
  }
  return redirect(`/crm/contacts/${contactId}`, { headers: responseHeaders() });
}

function Field({ label, name, type = "text", defaultValue = "", required = false }: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return <label className="form-field"><span>{label}{required ? " *" : ""}</span><input name={name} type={type} defaultValue={defaultValue} required={required} /></label>;
}

const reasonLabel: Record<string, string> = {
  EMAIL: "gleiche E-Mail-Adresse",
  MOBILE: "gleiche Mobilnummer",
  NAME_ADDRESS: "gleicher Name und gleiche Anschrift",
};

/**
 * Kontakt aus einer E-Mail-Signatur (20.10.2026): Text einfügen, "Felder
 * füllen" -- gefüllt werden nur leere Felder, alles bleibt zum Prüfen stehen.
 */
function SignaturEinlesen({ formId }: { formId: string }) {
  const [text, setText] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const fuellen = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const v = leseSignatur(text);
    const ziele: [string, string | null, string][] = [
      ["salutation", v.anrede, "Anrede"], ["first_name", v.vorname, "Vorname"], ["last_name", v.nachname, "Nachname"],
      ["email", v.email, "E-Mail"], ["mobile", v.mobil, "Mobil"], ["phone", v.telefon, "Telefon"],
      ["street", v.strasse, "Straße"], ["house_number", v.hausnummer, "Hausnummer"], ["postal_code", v.plz, "PLZ"], ["city", v.ort, "Ort"],
    ];
    const gefuellt: string[] = [];
    for (const [name, wert, beschriftung] of ziele) {
      const feld = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (!feld || !wert || feld.value.trim()) continue;
      feld.value = wert;
      gefuellt.push(beschriftung);
    }
    setMeldung(gefuellt.length ? `Übernommen: ${gefuellt.join(", ")}. Bitte prüfen.` : "Nichts erkannt, oder die Felder waren schon ausgefüllt.");
  };
  return (
    <details className="kontakt-signatur">
      <summary>Aus E-Mail-Signatur übernehmen</summary>
      <p className="form-help">Signatur hier einfügen. Erkannt werden Name, E-Mail, Telefon, Mobil und Anschrift; gefüllt werden nur leere Felder.</p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="E-Mail-Signatur" />
      <div className="form-actions"><button className="secondary-button" type="button" onClick={fuellen} disabled={!text.trim()}>Felder füllen</button></div>
      {meldung ? <p className="form-help" role="status">{meldung}</p> : null}
    </details>
  );
}

export default function NewContact() {
  const { herkunftsquellen } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "";
  const fields = result?.fields ?? {};
  const duplicates = result?.duplicates ?? [];

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to={returnTo.startsWith("/properties/") ? returnTo : "/crm"}>← Zurück</Link><h1 className="editor-title">Kontakt anlegen</h1></div>
        <span className="badge">{__APP_ENV_LABEL__}</span>
      </header>

      <Form method="post" className="editor-card" id="kontakt-neu">
        <SignaturEinlesen formId="kontakt-neu" />
        {result?.error ? <div className={duplicates.length ? "form-warning" : "form-error"}>{result.error}</div> : null}
        {duplicates.length > 0 ? (
          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">Duplikatprüfung</p><h2>Bitte vorhandene Kontakte prüfen</h2></div></div>
            <div className="data-list">
              {duplicates.map((duplicate) => (
                <div className="data-row" key={duplicate.contact_id}>
                  <div><strong>{duplicate.first_name} {duplicate.last_name}</strong><small>{duplicate.contact_number} · {duplicate.reasons.map((reason) => reasonLabel[reason] ?? reason).join(", ")}</small></div>
                  <Link className="subtle-link" to={`/crm/contacts/${duplicate.contact_id}`}>Vorhandenen öffnen</Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <p className="required-hint">* Pflichtfeld · Bei E-Mail, Mobil und Telefon muss mindestens eines der drei Felder ausgefüllt sein.</p>
        <div className="form-grid">
          <label className="form-field"><span>Anrede</span><select name="salutation" defaultValue={fields.salutation ?? ""}><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option><option value="Divers">Divers</option></select></label>
          <div />
          <Field label="Vorname" name="first_name" defaultValue={fields.first_name} required />
          <Field label="Nachname" name="last_name" defaultValue={fields.last_name} required />
          <label className="form-field"><span>E-Mail *</span><input name="email" type="email" defaultValue={fields.email} /></label>
          <label className="form-field"><span>Mobil *</span><input name="mobile" type="tel" defaultValue={fields.mobile} /></label>
          <label className="form-field"><span>Telefon *</span><input name="phone" type="tel" defaultValue={fields.phone} /></label>
          <label className="form-field"><span>Bevorzugter Kontaktweg</span><select name="preferred_channel" defaultValue={fields.preferred_channel ?? ""}><option value="">—</option><option value="EMAIL">E-Mail</option><option value="MOBILE">Mobil</option><option value="PHONE">Telefon</option><option value="OTHER">Sonstiges</option></select></label>
          <label className="form-field"><span>Geburtsdatum</span><input name="birth_date" type="date" defaultValue={fields.birth_date} /></label>
          <div />
          <HerkunftFelder quellen={herkunftsquellen} sourceId={fields.source_id} detail={fields.source_detail} />
        </div>

        <div className="card-head"><div><p className="eyebrow">Optional</p><h2>Primäradresse</h2></div></div>
        <div className="form-grid">
          <Field label="Straße" name="street" defaultValue={fields.street} />
          <Field label="Hausnummer" name="house_number" defaultValue={fields.house_number} />
          <Field label="PLZ" name="postal_code" defaultValue={fields.postal_code} />
          <Field label="Ort" name="city" defaultValue={fields.city} />
        </div>

        <label className="form-field full-width"><span>Interne Notiz</span><textarea name="internal_notes" rows={5} defaultValue={fields.internal_notes} /></label>

        <div className="form-actions">
          <Link className="secondary-button link-button" to={returnTo.startsWith("/properties/") ? returnTo : "/crm"}>Abbrechen</Link>
          {duplicates.length > 0 ? <button className="primary-button" type="submit" name="force_duplicate" value="1">Trotzdem neu anlegen</button> : <button className="primary-button" type="submit">Kontakt speichern</button>}
        </div>
      </Form>
    </main>
  );
}
