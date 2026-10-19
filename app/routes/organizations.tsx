import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/organizations";
import { requireActiveUser } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { seiteAus, seitenzahl, sicher, enthaelt, seiteZuWeit } from "~/lib/blaettern.server";
import { Seiten } from "~/components/seiten";
import "~/programm-liste.css";

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

  // Einstieg: gleich die erste Organisation (nach Namen) im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if (istEinstieg(request)) {
    const { data: erste } = await supabase.from("organizations").select("id").is("archived_at", null)
      .order("name", { ascending: true }).limit(1).maybeSingle();
    if (erste) throw redirect(`/crm/organizations/${erste.id}`, { headers: responseHeaders() });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? "ALL";
  const legalForm = url.searchParams.get("legal_form") ?? "ALL";
  const city = url.searchParams.get("city") ?? "ALL";

  // Blaettern ueber die Datenbank (19.10.2026, app/lib/blaettern.server.ts).
  // Die Auswahl fuer Rechtsform, Ort und Status kommt aus allen nicht
  // archivierten Organisationen (nur diese drei Spalten).
  const { page, from, to } = seiteAus(url);
  const suchtext = sicher(q);
  let abfrage = supabase
    .from("organizations")
    .select("id, organization_number, name, legal_form, email, phone, city, status, updated_at", { count: "exact" })
    .is("archived_at", null);
  if (status !== "ALL") abfrage = abfrage.eq("status", status);
  if (legalForm !== "ALL") abfrage = abfrage.eq("legal_form", legalForm);
  if (city !== "ALL") abfrage = abfrage.eq("city", city);
  if (suchtext) abfrage = abfrage.or(enthaelt(["organization_number", "name", "legal_form", "email", "phone", "city"], suchtext));

  const [{ data: rows, error, count }, auswahlRes] = await Promise.all([
    abfrage.order("updated_at", { ascending: false }).range(from, to),
    supabase.from("organizations").select("legal_form, city, status").is("archived_at", null).limit(10000),
  ]);

  seiteZuWeit(error,url,responseHeaders());if (error) throw new Response("Organisationen konnten nicht geladen werden.", { status: 500 });

  const alle = (auswahlRes.data ?? []) as { legal_form: string | null; city: string | null; status: string | null }[];
  const legalForms = Array.from(new Set(alle.map((o) => o.legal_form).filter((v): v is string => Boolean(v)))).sort((a, b) => String(a).localeCompare(String(b), "de"));
  const cities = Array.from(new Set(alle.map((o) => o.city).filter((v): v is string => Boolean(v)))).sort((a, b) => String(a).localeCompare(String(b), "de"));
  const statuses = Array.from(new Set(alle.map((o) => o.status).filter((v): v is string => Boolean(v)))).sort();

  return data(
    {
      organizations: rows ?? [],
      total: count ?? 0,
      page,
      pageCount: seitenzahl(count),
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
  const { organizations, total, page, pageCount, legalForms, cities, statuses, filters } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const fields = result?.fields ?? {};
  const [createOpen, setCreateOpen] = useState(Boolean(result?.error));

  useEffect(() => {
    if (result?.error) setCreateOpen(true);
  }, [result?.error]);

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen]);

  return (
    // Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026).
    // Vorher Seitenkopf, Filterkasten und Kartenzeilen. "+ Neue Organisation"
    // oeffnet weiter das Formular als Dialog.
    <main className="editor-shell programm-liste">
      <Form method="get" className="programm-liste-werkzeuge" role="search">
        <input type="hidden" name="ansicht" value="tabelle" />
        <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Name, Nummer, E-Mail, Telefon oder Ort …" autoComplete="off" /></label>
        <label><span className="sr-only">Status</span><select name="status" defaultValue={filters.status}><option value="ALL">Alle Status</option>{statuses.map((value) => <option key={value} value={value}>{STATUS_LABELS[value] ?? value}</option>)}</select></label>
        <label><span className="sr-only">Rechtsform</span><select name="legal_form" defaultValue={filters.legalForm}><option value="ALL">Alle Rechtsformen</option>{legalForms.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}</select></label>
        <label><span className="sr-only">Ort</span><select name="city" defaultValue={filters.city}><option value="ALL">Alle Orte</option>{cities.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}</select></label>
        <button className="secondary-button" type="submit">Filtern</button>
        <span className="programm-liste-zaehler">{total} {total === 1 ? "Organisation" : "Organisationen"}</span>
        <button className="programm-liste-neu" type="button" onClick={() => setCreateOpen(true)}>+ Neue Organisation</button>
      </Form>

      <div className="programm-tabelle-rahmen">
        {organizations.length === 0 ? <p className="programm-liste-leer">{filters.q || filters.status !== "ALL" || filters.legalForm !== "ALL" || filters.city !== "ALL" ? "Keine Organisation passt zu diesem Filter." : "Noch keine Organisation erfasst."}</p> : (
          <table className="programm-tabelle">
            <thead><tr><th scope="col">Nummer</th><th scope="col">Name</th><th scope="col">Rechtsform</th><th scope="col">Ort</th><th scope="col">E-Mail</th><th scope="col">Telefon</th><th scope="col">Status</th><th scope="col" className="rechts">Geändert</th></tr></thead>
            <tbody>
              {organizations.map((organization) => (
                <tr key={organization.id}>
                  <td className="zahl"><Link to={`/crm/organizations/${organization.id}`}>{organization.organization_number}</Link></td>
                  <td><Link to={`/crm/organizations/${organization.id}`}>{organization.name}</Link></td>
                  <td>{organization.legal_form ?? <span className="leise">—</span>}</td>
                  <td>{organization.city ?? <span className="leise">—</span>}</td>
                  <td>{organization.email ? <a href={`mailto:${organization.email}`}>{organization.email}</a> : <span className="leise">—</span>}</td>
                  <td className="zahl">{organization.phone ? <a href={`tel:${organization.phone.replace(/\s+/g, "")}`}>{organization.phone}</a> : <span className="leise">—</span>}</td>
                  <td>{STATUS_LABELS[organization.status] ?? organization.status}</td>
                  <td className="zahl rechts leise">{tag(organization.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Seiten page={page} pageCount={pageCount} />

      {createOpen ? (
        <div className="organization-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <section className="organization-create-modal" role="dialog" aria-modal="true" aria-labelledby="organization-create-title">
            <div className="organization-create-head">
              <div><p className="eyebrow">Neu</p><h2 id="organization-create-title">Organisation anlegen</h2></div>
              <button className="organization-create-close" type="button" aria-label="Modal schließen" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <Form method="post" className="auth-form">
              {result?.error ? <div className="form-error">{result.error}</div> : null}
              <label><span>Name *</span><input name="name" defaultValue={fields.name} required autoFocus /></label>
              <label><span>Rechtsform</span><input name="legal_form" defaultValue={fields.legal_form} placeholder="z. B. GmbH" /></label>
              <label><span>E-Mail</span><input name="email" type="email" defaultValue={fields.email} /></label>
              <label><span>Telefon</span><input name="phone" type="tel" defaultValue={fields.phone} /></label>
              <label><span>Website</span><input name="website" type="url" defaultValue={fields.website} /></label>
              <label><span>Ort</span><input name="city" defaultValue={fields.city} /></label>
              <div className="organization-create-actions">
                <button className="secondary-button" type="button" onClick={() => setCreateOpen(false)}>Abbrechen</button>
                <button className="primary-button" type="submit">Organisation speichern</button>
              </div>
            </Form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
