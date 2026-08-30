import { data, Form, Link, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/contact-new";
import { requireActiveUser } from "~/lib/auth.server";

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
  const { responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  return data({}, { headers: responseHeaders() });
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

export default function NewContact() {
  const result = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "";
  const fields = result?.fields ?? {};
  const duplicates = result?.duplicates ?? [];

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to={returnTo.startsWith("/properties/") ? returnTo : "/crm"}>← Zurück</Link><p className="eyebrow">Modul 01 · CRM</p><h1 className="editor-title">Kontakt anlegen</h1></div>
        <span className="badge">STAGING</span>
      </header>

      <Form method="post" className="editor-card">
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
