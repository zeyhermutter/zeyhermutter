import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/organization-detail";
import { requireActiveUser } from "~/lib/auth.server";

type ActionResult = { error?: string; conflict?: boolean };
type FieldChange = { old?: unknown; new?: unknown };

const fieldLabels: Record<string, string> = {
  name: "Name",
  legal_form: "Rechtsform",
  website: "Website",
  email: "E-Mail",
  phone: "Telefon",
  street: "Straße",
  house_number: "Hausnummer",
  postal_code: "PLZ",
  city: "Ort",
  country: "Land",
  notes: "Notizen",
  status: "Status",
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return "Datensatz";
  const stringValue = String(value);
  return stringValue.length > 100 ? `${stringValue.slice(0, 97)}…` : stringValue;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const organizationId = params.organizationId;
  if (!organizationId) throw new Response("Organisation fehlt.", { status: 404 });

  const [{ data: organization, error }, { data: history, error: historyError }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, organization_number, name, legal_form, website, email, phone, street, house_number, postal_code, city, country, notes, status, updated_at, version")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("audit_events")
      .select("id, occurred_at, actor_display_name_snapshot, action, field_changes")
      .eq("entity_type", "ORGANIZATION")
      .eq("entity_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  if (error || historyError) throw new Response("Organisation konnte nicht geladen werden.", { status: 500 });
  if (!organization) throw new Response("Organisation nicht gefunden.", { status: 404 });

  const url = new URL(request.url);
  return data({ organization, history: history ?? [], profile, saved: url.searchParams.get("saved") === "1" }, { headers: responseHeaders() });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const organizationId = params.organizationId;
  if (!organizationId) throw new Response("Organisation fehlt.", { status: 404 });

  const formData = await request.formData();
  const version = Number(text(formData, "version"));
  const name = text(formData, "name");

  if (!Number.isInteger(version) || version < 1) return data<ActionResult>({ error: "Ungültige Datensatzversion." }, { status: 400, headers: responseHeaders() });
  if (!name) return data<ActionResult>({ error: "Name ist ein Pflichtfeld." }, { status: 400, headers: responseHeaders() });

  const { data: updated, error } = await supabase
    .from("organizations")
    .update({
      name,
      legal_form: text(formData, "legal_form") || null,
      website: text(formData, "website") || null,
      email: text(formData, "email") || null,
      phone: text(formData, "phone") || null,
      street: text(formData, "street") || null,
      house_number: text(formData, "house_number") || null,
      postal_code: text(formData, "postal_code") || null,
      city: text(formData, "city") || null,
      country: text(formData, "country") || "DE",
      notes: text(formData, "notes") || null,
    })
    .eq("id", organizationId)
    .eq("version", version)
    .select("id, version")
    .maybeSingle();

  if (error) return data<ActionResult>({ error: "Änderungen konnten nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
  if (!updated) return data<ActionResult>({ error: "Die Organisation wurde zwischenzeitlich geändert. Bitte neu laden.", conflict: true }, { status: 409, headers: responseHeaders() });

  return redirect(`/crm/organizations/${organizationId}?saved=1`, { headers: responseHeaders() });
}

export default function OrganizationDetail() {
  const { organization, history, profile, saved } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm/organizations">← Organisationen</Link><p className="eyebrow">{organization.organization_number}</p><h1 className="editor-title">{organization.name}</h1><p className="editor-meta">Version {organization.version} · zuletzt geändert {formatDate(organization.updated_at)}</p></div>
        <div className="header-user"><Link className="subtle-link" to={`/crm/organizations/${organization.id}/partner`}>Partner & Compliance →</Link><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>

      <div className="contact-layout">
        <Form method="post" className="editor-card">
          <input type="hidden" name="version" value={organization.version} />
          {saved ? <div className="form-success">Änderungen gespeichert.</div> : null}
          {result?.error ? <div className={result.conflict ? "form-warning" : "form-error"}>{result.error}</div> : null}
          {result?.conflict ? <Link className="secondary-button link-button inline-action" to={`/crm/organizations/${organization.id}`}>Aktuelle Version laden</Link> : null}

          <div className="form-grid">
            <label className="form-field"><span>Name *</span><input name="name" defaultValue={organization.name} required /></label>
            <label className="form-field"><span>Rechtsform</span><input name="legal_form" defaultValue={organization.legal_form ?? ""} /></label>
            <label className="form-field"><span>E-Mail</span><input name="email" type="email" defaultValue={organization.email ?? ""} /></label>
            <label className="form-field"><span>Telefon</span><input name="phone" type="tel" defaultValue={organization.phone ?? ""} /></label>
            <label className="form-field"><span>Website</span><input name="website" type="url" defaultValue={organization.website ?? ""} /></label>
            <label className="form-field"><span>Straße</span><input name="street" defaultValue={organization.street ?? ""} /></label>
            <label className="form-field"><span>Hausnummer</span><input name="house_number" defaultValue={organization.house_number ?? ""} /></label>
            <label className="form-field"><span>PLZ</span><input name="postal_code" defaultValue={organization.postal_code ?? ""} /></label>
            <label className="form-field"><span>Ort</span><input name="city" defaultValue={organization.city ?? ""} /></label>
            <label className="form-field"><span>Land</span><input name="country" defaultValue={organization.country ?? "DE"} /></label>
          </div>
          <label className="form-field full-width"><span>Interne Notizen</span><textarea name="notes" rows={6} defaultValue={organization.notes ?? ""} /></label>
          <div className="form-actions"><Link className="secondary-button link-button" to="/crm/organizations">Zurück</Link><button className="primary-button" type="submit">Änderungen speichern</button></div>
        </Form>

        <aside className="history-card">
          <div className="card-head"><div><p className="eyebrow">Audit</p><h2>Historie</h2></div><span className="subtle">letzte 50</span></div>
          {history.length === 0 ? <p className="empty-state">Noch keine History-Einträge.</p> : (
            <div className="history-list">
              {history.map((event) => {
                const changes = (event.field_changes ?? {}) as Record<string, FieldChange>;
                const visibleChanges = event.action === "CREATE" ? [] : Object.entries(changes);
                return <article className="history-event" key={event.id}><div className="history-head"><strong>{event.action === "CREATE" ? "Organisation angelegt" : "Organisation geändert"}</strong><small>{formatDate(event.occurred_at)}</small></div><p>von {event.actor_display_name_snapshot ?? "System"}</p>{visibleChanges.map(([field, change]) => <div className="history-change" key={field}><span>{fieldLabels[field] ?? field}</span><small>{valueLabel(change.old)} → {valueLabel(change.new)}</small></div>)}</article>;
              })}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
