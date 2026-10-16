import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/organization-detail";
import { requireActiveUser } from "~/lib/auth.server";
import { tag, zeitpunkt as formatDate } from "~/lib/format";
import { KontaktAuswahl } from "~/components/kontakt-auswahl";
import { ORGANISATIONSROLLE, beschrifte } from "~/lib/labels";

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

  // Ansprechpartner (P1, 16.10.2026): Wer bei dieser Firma zu wem gehoert,
  // stand bisher nur in den Kontaktakten (Reiter "Adressen & Firmen"). Von
  // der Organisation aus war niemand zu sehen.
  const [{ data: organization, error }, { data: history, error: historyError }, { data: personen, error: personenFehler }] = await Promise.all([
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
    supabase
      .from("contact_organization_relationships")
      .select("id, role, position, valid_until, contacts(id, contact_number, first_name, last_name, email, phone, mobile, archived_at)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
  ]);

  if (error || historyError) throw new Response("Organisation konnte nicht geladen werden.", { status: 500 });
  if (!organization) throw new Response("Organisation nicht gefunden.", { status: 404 });

  const url = new URL(request.url);
  const ansprechpartner = ((personen ?? []) as any[])
    .map((p) => ({ ...p, kontakt: Array.isArray(p.contacts) ? p.contacts[0] : p.contacts }))
    .filter((p) => p.kontakt && !p.kontakt.archived_at);
  return data({
    organization, history: history ?? [], profile, saved: url.searchParams.get("saved") === "1",
    ansprechpartner, ansprechpartnerFehlt: Boolean(personenFehler), zugeordnet: url.searchParams.get("ansprechpartner"),
  }, { headers: responseHeaders() });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const organizationId = params.organizationId;
  if (!organizationId) throw new Response("Organisation fehlt.", { status: 404 });

  const formData = await request.formData();
  const intent = text(formData, "_intent");

  // Dieselbe Verknuepfung wie im Reiter "Adressen & Firmen" der Kontaktakte,
  // nur von der anderen Seite.
  if (intent === "ansprechpartner_neu") {
    const contactId = text(formData, "contact_id");
    const role = text(formData, "role") || "ANSPRECHPARTNER";
    if (!contactId) return data<ActionResult>({ error: "Bitte einen Kontakt auswählen." }, { status: 400, headers: responseHeaders() });
    if (!(role in ORGANISATIONSROLLE)) return data<ActionResult>({ error: "Ungültige Rolle." }, { status: 400, headers: responseHeaders() });
    const { error } = await supabase.from("contact_organization_relationships").insert({
      contact_id: contactId, organization_id: organizationId, role, position: text(formData, "position") || null, created_by: userId,
    });
    if (error) return data<ActionResult>({ error: error.code === "23505" ? "Dieser Kontakt ist hier schon mit dieser Rolle eingetragen." : "Der Ansprechpartner konnte nicht zugeordnet werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/organizations/${organizationId}?ansprechpartner=neu#ansprechpartner`, { headers: responseHeaders() });
  }
  if (intent === "ansprechpartner_entfernen") {
    const { error } = await supabase.from("contact_organization_relationships").delete().eq("id", text(formData, "link_id")).eq("organization_id", organizationId);
    if (error) return data<ActionResult>({ error: "Die Zuordnung konnte nicht entfernt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/organizations/${organizationId}?ansprechpartner=entfernt#ansprechpartner`, { headers: responseHeaders() });
  }

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
  const { organization, history, profile, saved, ansprechpartner, ansprechpartnerFehlt, zugeordnet } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm/organizations">← Organisationen</Link><p className="eyebrow">{organization.organization_number}</p><h1 className="editor-title">{organization.name}</h1><p className="editor-meta">zuletzt geändert {formatDate(organization.updated_at)}</p></div>
        <div className="header-user"><Link className="subtle-link" to={`/crm/organizations/${organization.id}/partner`}>Partner & Compliance →</Link><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>

      <section className="data-card" id="ansprechpartner">
        <div className="card-head">
          <div><p className="eyebrow">Personen</p><h2>Ansprechpartner{ansprechpartner.length ? ` · ${ansprechpartner.length}` : ""}</h2></div>
        </div>
        {zugeordnet === "neu" ? <p className="form-success">Ansprechpartner zugeordnet.</p> : zugeordnet === "entfernt" ? <p className="form-success">Zuordnung entfernt. Der Kontakt selbst bleibt erhalten.</p> : null}
        {ansprechpartnerFehlt ? <p className="form-warning">Die Ansprechpartner konnten gerade nicht geladen werden.</p>
          : ansprechpartner.length === 0 ? <p className="empty-state">Noch niemand zugeordnet.</p>
          : <div className="data-list">{ansprechpartner.map((p: any) => {
              const k = p.kontakt; const tel = k.mobile ?? k.phone;
              return <div className="data-row" key={p.id}>
                <div><strong><Link to={`/crm/contacts/${k.id}`}>{`${k.first_name ?? ""} ${k.last_name ?? ""}`.trim() || k.contact_number}</Link></strong><small>{beschrifte(ORGANISATIONSROLLE, p.role)}{p.position ? ` · ${p.position}` : ""}{p.valid_until ? ` · bis ${tag(p.valid_until)}` : ""}</small></div>
                <div className="row-meta">
                  {tel ? <a href={`tel:${tel.replace(/[^+\d]/g, "")}`}>{tel}</a> : null}
                  {k.email ? <a href={`mailto:${k.email}`}>{k.email}</a> : null}
                  <Form method="post"><input type="hidden" name="_intent" value="ansprechpartner_entfernen" /><input type="hidden" name="link_id" value={p.id} /><button className="text-button" type="submit" title="Nur die Zuordnung, nicht den Kontakt">Zuordnung entfernen</button></Form>
                </div>
              </div>;
            })}</div>}
        <Form method="post" className="form-grid ansprechpartner-neu">
          <input type="hidden" name="_intent" value="ansprechpartner_neu" />
          <KontaktAuswahl name="contact_id" beschriftung="Kontakt" pflicht ausschliessen={ansprechpartner.map((p: any) => p.kontakt.id)} />
          <label className="form-field"><span>Rolle</span><select name="role" defaultValue="ANSPRECHPARTNER">{Object.entries(ORGANISATIONSROLLE).map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select></label>
          <label className="form-field"><span>Funktion</span><input name="position" placeholder="z. B. Hausverwaltung, Vorstand" /></label>
          <div className="form-actions"><button className="secondary-button" type="submit">Ansprechpartner zuordnen</button></div>
        </Form>
      </section>

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
