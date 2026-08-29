import { data, Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/contact-new";
import { requireActiveUser } from "~/lib/auth.server";

type ActionResult = {
  error?: string;
  fields?: Record<string, string>;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  return data({}, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(
    request,
    context.cloudflare.env,
  );
  const formData = await request.formData();

  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  const email = text(formData, "email");
  const phone = text(formData, "phone");
  const mobile = text(formData, "mobile");
  const salutation = text(formData, "salutation");
  const preferredChannel = text(formData, "preferred_channel");
  const internalNotes = text(formData, "internal_notes");

  const fields = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    mobile,
    salutation,
    preferred_channel: preferredChannel,
    internal_notes: internalNotes,
  };

  if (!firstName || !lastName) {
    return data<ActionResult>(
      { error: "Vorname und Nachname sind Pflichtfelder.", fields },
      { status: 400, headers: responseHeaders() },
    );
  }

  if (!email && !phone && !mobile) {
    return data<ActionResult>(
      { error: "Mindestens E-Mail, Telefon oder Mobilnummer ist erforderlich.", fields },
      { status: 400, headers: responseHeaders() },
    );
  }

  if (email) {
    const { data: duplicate } = await supabase
      .from("contacts")
      .select("id, contact_number, first_name, last_name")
      .ilike("email", email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return data<ActionResult>(
        { error: `Möglicher bestehender Kontakt gefunden (${duplicate.contact_number}).`, fields },
        { status: 409, headers: responseHeaders() },
      );
    }
  }

  if (mobile) {
    const { data: duplicate } = await supabase
      .from("contacts")
      .select("id, contact_number, first_name, last_name")
      .eq("mobile", mobile)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return data<ActionResult>(
        { error: `Möglicher bestehender Kontakt gefunden (${duplicate.contact_number}).`, fields },
        { status: 409, headers: responseHeaders() },
      );
    }
  }

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      mobile: mobile || null,
      salutation: salutation || null,
      preferred_channel: preferredChannel || null,
      internal_notes: internalNotes || null,
      primary_responsible_user: userId,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return data<ActionResult>(
      { error: "Kontakt konnte nicht gespeichert werden. Bitte Eingaben prüfen.", fields },
      { status: 400, headers: responseHeaders() },
    );
  }

  return redirect(`/crm/contacts/${created.id}`, { headers: responseHeaders() });
}

function Field({ label, name, type = "text", defaultValue = "", required = false }: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="form-field">
      <span>{label}{required ? " *" : ""}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} />
    </label>
  );
}

export default function NewContact() {
  const result = useActionData<typeof action>();
  const fields = result?.fields ?? {};

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to="/crm">← CRM</Link>
          <p className="eyebrow">Modul 01 · CRM</p>
          <h1 className="editor-title">Kontakt anlegen</h1>
        </div>
        <span className="badge">STAGING</span>
      </header>

      <Form method="post" className="editor-card">
        {result?.error ? <div className="form-error">{result.error}</div> : null}

        <div className="form-grid">
          <label className="form-field">
            <span>Anrede</span>
            <select name="salutation" defaultValue={fields.salutation ?? ""}>
              <option value="">—</option>
              <option value="Herr">Herr</option>
              <option value="Frau">Frau</option>
              <option value="Divers">Divers</option>
            </select>
          </label>
          <div />
          <Field label="Vorname" name="first_name" defaultValue={fields.first_name} required />
          <Field label="Nachname" name="last_name" defaultValue={fields.last_name} required />
          <Field label="E-Mail" name="email" type="email" defaultValue={fields.email} />
          <Field label="Mobil" name="mobile" type="tel" defaultValue={fields.mobile} />
          <Field label="Telefon" name="phone" type="tel" defaultValue={fields.phone} />
          <label className="form-field">
            <span>Bevorzugter Kontaktweg</span>
            <select name="preferred_channel" defaultValue={fields.preferred_channel ?? ""}>
              <option value="">—</option>
              <option value="EMAIL">E-Mail</option>
              <option value="MOBILE">Mobil</option>
              <option value="PHONE">Telefon</option>
              <option value="OTHER">Sonstiges</option>
            </select>
          </label>
        </div>

        <label className="form-field full-width">
          <span>Interne Notiz</span>
          <textarea name="internal_notes" rows={5} defaultValue={fields.internal_notes} />
        </label>

        <div className="form-actions">
          <Link className="secondary-button link-button" to="/crm">Abbrechen</Link>
          <button className="primary-button" type="submit">Kontakt speichern</button>
        </div>
      </Form>
    </main>
  );
}
