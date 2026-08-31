import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/organizations";
import { requireActiveUser } from "~/lib/auth.server";

type ActionResult = { error?: string; fields?: Record<string, string> };

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(
    request,
    context.cloudflare.env,
  );

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") ?? "ALL";
  const legalForm = url.searchParams.get("legal_form") ?? "ALL";
  const city = url.searchParams.get("city") ?? "ALL";

  const { data: rows, error } = await supabase
    .from("organizations")
    .select("id, organization_number, name, legal_form, email, phone, city, status, updated_at")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Response("Organisationen konnten nicht geladen werden.", { status: 500 });

  const organizations = rows ?? [];
  const legalForms = Array.from(new Set(organizations.map((organization) => organization.legal_form).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "de"));
  const cities = Array.from(new Set(organizations.map((organization) => organization.city).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "de"));
  const statuses = Array.from(new Set(organizations.map((organization) => organization.status).filter(Boolean))).sort();

  const filtered = organizations.filter((organization) => {
    if (status !== "ALL" && organization.status !== status) return false;
    if (legalForm !== "ALL" && organization.legal_form !== legalForm) return false;
    if (city !== "ALL" && organization.city !== city) return false;
    if (q) {
      const haystack = [
        organization.organization_number,
        organization.name,
        organization.legal_form,
        organization.email,
        organization.phone,
        organization.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return data(
    {
      organizations: filtered,
      legalForms,
      cities,
      statuses,
      filters: { q, status, legalForm, city },
      profile,
    },
    { headers: responseHeaders() },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(
    request,
    context.cloudflare.env,
  );
  const formData = await request.formData();

  const fields = {
    name: text(formData, "name"),
    legal_form: text(formData, "legal_form"),
    website: text(formData, "website"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    city: text(formData, "city"),
  };

  if (!fields.name) {
    return data<ActionResult>({ error: "Name der Organisation ist erforderlich.", fields }, { status: 400, headers: responseHeaders() });
  }

  const { data: duplicate } = await supabase
    .from("organizations")
    .select("id, organization_number, name")
    .ilike("name", fields.name)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  if (duplicate) {
    return data<ActionResult>({ error: `Mögliche bestehende Organisation gefunden (${duplicate.organization_number}).`, fields }, { status: 409, headers: responseHeaders() });
  }

  const { data: created, error } = await supabase
    .from("organizations")
    .insert({
      name: fields.name,
      legal_form: fields.legal_form || null,
      website: fields.website || null,
      email: fields.email || null,
      phone: fields.phone || null,
      city: fields.city || null,
      country: "DE",
      primary_responsible_user: userId,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return data<ActionResult>({ error: "Organisation konnte nicht gespeichert werden.", fields }, { status: 400, headers: responseHeaders() });
  }

  return redirect(`/crm/organizations/${created.id}`, { headers: responseHeaders() });
}

export default function Organizations() {
  const { organizations, legalForms, cities, statuses, filters, profile } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const fields = result?.fields ?? {};

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Modul 01 · CRM</p><h1 className="editor-title">Organisationen</h1></div>
        <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>

      <div className="dashboard-grid">
        <div className="organization-directory-stack">
          <section className="data-card">
            <Form method="get" className="organization-filter-grid">
              <label>
                <span>Suche</span>
                <input name="q" defaultValue={filters.q} placeholder="Name, Nummer, E-Mail, Telefon oder Ort" />
              </label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue={filters.status}>
                  <option value="ALL">Alle</option>
                  {statuses.map((value) => <option key={value} value={value}>{STATUS_LABELS[value] ?? value}</option>)}
                </select>
              </label>
              <label>
                <span>Rechtsform</span>
                <select name="legal_form" defaultValue={filters.legalForm}>
                  <option value="ALL">Alle</option>
                  {legalForms.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
                </select>
              </label>
              <label>
                <span>Ort</span>
                <select name="city" defaultValue={filters.city}>
                  <option value="ALL">Alle</option>
                  {cities.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
                </select>
              </label>
            </Form>
          </section>

          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">Firmen & Partner</p><h2>Verzeichnis</h2></div><span className="subtle">{organizations.length}</span></div>
            {organizations.length === 0 ? <p className="empty-state">Keine Organisationen für diese Filter gefunden.</p> : (
              <div className="data-list">
                {organizations.map((organization) => (
                  <Link className="data-row data-row-link" to={`/crm/organizations/${organization.id}`} key={organization.id}>
                    <div><strong>{organization.name}</strong><small>{organization.organization_number}{organization.legal_form ? ` · ${organization.legal_form}` : ""}</small></div>
                    <div className="row-meta"><span>{organization.city ?? organization.email ?? "—"}</span><small>{STATUS_LABELS[organization.status] ?? organization.status}</small></div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Neu</p><h2>Organisation anlegen</h2></div></div>
          <Form method="post" className="auth-form">
            {result?.error ? <div className="form-error">{result.error}</div> : null}
            <label><span>Name *</span><input name="name" defaultValue={fields.name} required /></label>
            <label><span>Rechtsform</span><input name="legal_form" defaultValue={fields.legal_form} placeholder="z. B. GmbH" /></label>
            <label><span>E-Mail</span><input name="email" type="email" defaultValue={fields.email} /></label>
            <label><span>Telefon</span><input name="phone" type="tel" defaultValue={fields.phone} /></label>
            <label><span>Website</span><input name="website" type="url" defaultValue={fields.website} /></label>
            <label><span>Ort</span><input name="city" defaultValue={fields.city} /></label>
            <button className="primary-button" type="submit">Organisation speichern</button>
          </Form>
        </section>
      </div>
    </main>
  );
}
