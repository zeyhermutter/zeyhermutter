import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/contact-detail";
import { requireActiveUser } from "~/lib/auth.server";

type FieldChange = { old?: unknown; new?: unknown };
type ActionResult = { error?: string; conflict?: boolean };

const fieldLabels: Record<string, string> = {
  salutation: "Anrede",
  title: "Titel",
  first_name: "Vorname",
  last_name: "Nachname",
  email: "E-Mail",
  phone: "Telefon",
  mobile: "Mobil",
  birth_date: "Geburtsdatum",
  preferred_channel: "Bevorzugter Kontaktweg",
  language: "Sprache",
  internal_notes: "Interne Notiz",
  status: "Status",
  primary_responsible_user: "Verantwortlich",
  archived_at: "Archiviert am",
  archived_by: "Archiviert von",
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return "Datensatz";
  const stringValue = String(value);
  return stringValue.length > 120 ? `${stringValue.slice(0, 117)}…` : stringValue;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(
    request,
    context.cloudflare.env,
  );
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });

  const [{ data: contact, error: contactError }, { data: history, error: historyError }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, contact_number, salutation, title, first_name, last_name, email, phone, mobile, birth_date, preferred_channel, language, internal_notes, status, created_at, updated_at, version")
        .eq("id", contactId)
        .maybeSingle(),
      supabase
        .from("audit_events")
        .select("id, occurred_at, actor_display_name_snapshot, action, field_changes")
        .eq("entity_type", "CONTACT")
        .eq("entity_id", contactId)
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);

  if (contactError || historyError) {
    throw new Response("Kontakt konnte nicht geladen werden.", { status: 500 });
  }
  if (!contact) throw new Response("Kontakt nicht gefunden.", { status: 404 });

  const url = new URL(request.url);
  return data(
    { contact, history: history ?? [], profile, saved: url.searchParams.get("saved") === "1" },
    { headers: responseHeaders() },
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(
    request,
    context.cloudflare.env,
  );
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });

  const formData = await request.formData();
  const version = Number(text(formData, "version"));
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  const email = text(formData, "email");
  const phone = text(formData, "phone");
  const mobile = text(formData, "mobile");

  if (!Number.isInteger(version) || version < 1) {
    return data<ActionResult>({ error: "Ungültige Datensatzversion." }, { status: 400, headers: responseHeaders() });
  }
  if (!firstName || !lastName) {
    return data<ActionResult>({ error: "Vorname und Nachname sind Pflichtfelder." }, { status: 400, headers: responseHeaders() });
  }
  if (!email && !phone && !mobile) {
    return data<ActionResult>({ error: "Mindestens E-Mail, Telefon oder Mobilnummer ist erforderlich." }, { status: 400, headers: responseHeaders() });
  }

  if (email) {
    const { data: duplicate } = await supabase
      .from("contacts")
      .select("id, contact_number")
      .ilike("email", email)
      .neq("id", contactId)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (duplicate) {
      return data<ActionResult>({ error: `Diese E-Mail wird bereits bei ${duplicate.contact_number} verwendet.` }, { status: 409, headers: responseHeaders() });
    }
  }

  const { data: updated, error } = await supabase
    .from("contacts")
    .update({
      salutation: text(formData, "salutation") || null,
      title: text(formData, "title") || null,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      mobile: mobile || null,
      birth_date: text(formData, "birth_date") || null,
      preferred_channel: text(formData, "preferred_channel") || null,
      internal_notes: text(formData, "internal_notes") || null,
    })
    .eq("id", contactId)
    .eq("version", version)
    .select("id, version")
    .maybeSingle();

  if (error) {
    return data<ActionResult>({ error: "Änderungen konnten nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
  }
  if (!updated) {
    return data<ActionResult>(
      {
        conflict: true,
        error: "Dieser Kontakt wurde zwischenzeitlich geändert. Bitte aktuelle Version laden und deine Änderungen erneut prüfen.",
      },
      { status: 409, headers: responseHeaders() },
    );
  }

  return redirect(`/crm/contacts/${contactId}?saved=1`, { headers: responseHeaders() });
}

export default function ContactDetail() {
  const { contact, history, profile, saved } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to="/crm">← CRM</Link>
          <p className="eyebrow">{contact.contact_number}</p>
          <h1 className="editor-title">{contact.first_name} {contact.last_name}</h1>
          <p className="editor-meta">Version {contact.version} · zuletzt geändert {formatDate(contact.updated_at)}</p>
        </div>
        <div className="header-user"><span className="badge">STAGING</span><small>{profile.display_name}</small></div>
      </header>

      <div className="contact-layout">
        <Form method="post" className="editor-card">
          <input type="hidden" name="version" value={contact.version} />
          {saved ? <div className="form-success">Änderungen gespeichert.</div> : null}
          {result?.error ? <div className={result.conflict ? "form-warning" : "form-error"}>{result.error}</div> : null}
          {result?.conflict ? <Link className="secondary-button link-button inline-action" to={`/crm/contacts/${contact.id}`}>Aktuelle Version laden</Link> : null}

          <div className="form-grid">
            <label className="form-field"><span>Anrede</span><select name="salutation" defaultValue={contact.salutation ?? ""}><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option><option value="Divers">Divers</option></select></label>
            <label className="form-field"><span>Titel</span><input name="title" defaultValue={contact.title ?? ""} /></label>
            <label className="form-field"><span>Vorname *</span><input name="first_name" defaultValue={contact.first_name} required /></label>
            <label className="form-field"><span>Nachname *</span><input name="last_name" defaultValue={contact.last_name} required /></label>
            <label className="form-field"><span>E-Mail</span><input name="email" type="email" defaultValue={contact.email ?? ""} /></label>
            <label className="form-field"><span>Mobil</span><input name="mobile" type="tel" defaultValue={contact.mobile ?? ""} /></label>
            <label className="form-field"><span>Telefon</span><input name="phone" type="tel" defaultValue={contact.phone ?? ""} /></label>
            <label className="form-field"><span>Geburtsdatum</span><input name="birth_date" type="date" defaultValue={contact.birth_date ?? ""} /></label>
            <label className="form-field"><span>Bevorzugter Kontaktweg</span><select name="preferred_channel" defaultValue={contact.preferred_channel ?? ""}><option value="">—</option><option value="EMAIL">E-Mail</option><option value="MOBILE">Mobil</option><option value="PHONE">Telefon</option><option value="OTHER">Sonstiges</option></select></label>
          </div>

          <label className="form-field full-width"><span>Interne Notiz</span><textarea name="internal_notes" rows={6} defaultValue={contact.internal_notes ?? ""} /></label>
          <div className="form-actions"><Link className="secondary-button link-button" to="/crm">Zurück</Link><button className="primary-button" type="submit">Änderungen speichern</button></div>
        </Form>

        <aside className="history-card">
          <div className="card-head"><div><p className="eyebrow">Audit</p><h2>Historie</h2></div><span className="subtle">letzte 50</span></div>
          {history.length === 0 ? <p className="empty-state">Noch keine History-Einträge.</p> : (
            <div className="history-list">
              {history.map((event) => {
                const changes = (event.field_changes ?? {}) as Record<string, FieldChange>;
                const visibleChanges = event.action === "CREATE" ? [] : Object.entries(changes);
                return (
                  <article className="history-event" key={event.id}>
                    <div className="history-head"><strong>{event.action === "CREATE" ? "Kontakt angelegt" : event.action === "STATUS_CHANGE" ? "Status geändert" : "Kontakt geändert"}</strong><small>{formatDate(event.occurred_at)}</small></div>
                    <p>von {event.actor_display_name_snapshot ?? "System"}</p>
                    {visibleChanges.map(([field, change]) => (
                      <div className="history-change" key={field}>
                        <span>{fieldLabels[field] ?? field}</span>
                        <small>{valueLabel(change.old)} → {valueLabel(change.new)}</small>
                      </div>
                    ))}
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
