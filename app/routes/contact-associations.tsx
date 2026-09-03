import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/contact-associations";
import { requireActiveUser } from "~/lib/auth.server";

type ActionResult = { error?: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const orgRoles = [
  "MITARBEITER",
  "GESCHAEFTSFUEHRER",
  "GESELLSCHAFTER",
  "ANSPRECHPARTNER",
  "BEVOLLMÄCHTIGTER",
  "SONSTIGES",
] as const;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });

  const [
    { data: contact, error: contactError },
    { data: organizations, error: organizationsError },
    { data: links, error: linksError },
    { data: addresses, error: addressesError },
  ] = await Promise.all([
    supabase.from("contacts").select("id, contact_number, first_name, last_name").eq("id", contactId).maybeSingle(),
    supabase.from("organizations").select("id, organization_number, name, legal_form").is("archived_at", null).order("name").limit(250),
    supabase.from("contact_organization_relationships").select("id, organization_id, role, position, valid_from, valid_until").eq("contact_id", contactId).order("created_at", { ascending: false }),
    supabase.from("contact_addresses").select("id, address_type, street, house_number, postal_code, city, country, is_primary, archived_at, version").eq("contact_id", contactId).order("is_primary", { ascending: false }).order("created_at", { ascending: false }),
  ]);

  if (contactError || organizationsError || linksError || addressesError) {
    throw new Response("Verknüpfungen konnten nicht geladen werden.", { status: 500 });
  }
  if (!contact) throw new Response("Kontakt nicht gefunden.", { status: 404 });

  const { data: canReadDisclosures } = await supabase.rpc("current_user_has_permission", { p_permission: "disclosure.read" });
  let disclosures: any[] = [];
  if (canReadDisclosures === true) {
    const result = await supabase
      .from("property_disclosures")
      .select("id, disclosure_number, property_id, disclosed_at, channel, acknowledgement_kind, acknowledged_at, prior_knowledge_declared, prior_knowledge_source, resale_prohibition_notice_given, archived_at, properties(id, property_number, internal_title, status)")
      .eq("contact_id", contactId)
      .order("disclosed_at", { ascending: false })
      .limit(200);
    if (!result.error) disclosures = result.data ?? [];
  }

  const organizationMap = Object.fromEntries((organizations ?? []).map((item) => [item.id, item]));
  const activeAddresses = (addresses ?? []).filter((item) => !item.archived_at);

  return data(
    { contact, profile, organizations: organizations ?? [], links: links ?? [], organizationMap, addresses: activeAddresses, disclosures, canReadDisclosures: canReadDisclosures === true },
    { headers: responseHeaders() },
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });
  const formData = await request.formData();
  const intent = text(formData, "_intent");

  if (intent === "add_organization") {
    const organizationId = text(formData, "organization_id");
    const role = text(formData, "role") || "ANSPRECHPARTNER";
    const position = text(formData, "position");
    if (!organizationId) return data<ActionResult>({ error: "Bitte Organisation auswählen." }, { status: 400, headers: responseHeaders() });

    const { error } = await supabase.from("contact_organization_relationships").insert({
      contact_id: contactId,
      organization_id: organizationId,
      role,
      position: position || null,
      created_by: userId,
    });
    if (error) {
      return data<ActionResult>({ error: error.code === "23505" ? "Diese Firmenzuordnung besteht bereits." : "Firmenzuordnung konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    }
    return redirect(`/crm/contacts/${contactId}/associations`, { headers: responseHeaders() });
  }

  if (intent === "remove_organization") {
    const linkId = text(formData, "link_id");
    const { error } = await supabase.from("contact_organization_relationships").delete().eq("id", linkId).eq("contact_id", contactId);
    if (error) return data<ActionResult>({ error: "Firmenzuordnung konnte nicht entfernt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/contacts/${contactId}/associations`, { headers: responseHeaders() });
  }

  if (intent === "add_address") {
    const street = text(formData, "street");
    const houseNumber = text(formData, "house_number");
    const postalCode = text(formData, "postal_code");
    const city = text(formData, "city");
    const addressType = text(formData, "address_type") || "OTHER";
    if (!street || !postalCode || !city) {
      return data<ActionResult>({ error: "Straße, PLZ und Ort sind für eine Adresse erforderlich." }, { status: 400, headers: responseHeaders() });
    }

    const { count } = await supabase.from("contact_addresses").select("id", { count: "exact", head: true }).eq("contact_id", contactId).is("archived_at", null);
    const { error } = await supabase.from("contact_addresses").insert({
      contact_id: contactId,
      address_type: addressType,
      street,
      house_number: houseNumber || null,
      postal_code: postalCode,
      city,
      country: "DE",
      is_primary: (count ?? 0) === 0,
      created_by: userId,
      updated_by: userId,
    });
    if (error) return data<ActionResult>({ error: "Adresse konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/contacts/${contactId}/associations`, { headers: responseHeaders() });
  }

  if (intent === "archive_address") {
    const addressId = text(formData, "address_id");
    const version = Number(text(formData, "version"));
    const { data: updated, error } = await supabase
      .from("contact_addresses")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", addressId)
      .eq("contact_id", contactId)
      .eq("version", version)
      .select("id")
      .maybeSingle();
    if (error) return data<ActionResult>({ error: "Adresse konnte nicht archiviert werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Adresse wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(`/crm/contacts/${contactId}/associations`, { headers: responseHeaders() });
  }

  return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

export default function ContactAssociations() {
  const { contact, profile, organizations, links, organizationMap, addresses, disclosures, canReadDisclosures } = useLoaderData<typeof loader>();
  const firstIds = new Set<string>();
  {
    const earliest = new Map<string, any>();
    for (const item of disclosures as any[]) {
      if (item.archived_at) continue;
      const current = earliest.get(item.property_id);
      if (!current || new Date(item.disclosed_at) < new Date(current.disclosed_at)) earliest.set(item.property_id, item);
    }
    for (const item of earliest.values()) firstIds.add(item.id);
  }
  const fmt = (value: string | null) => (value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value)) : "—");
  const result = useActionData<typeof action>();

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to={`/crm/contacts/${contact.id}/relations`}>← Arbeitsbereich</Link>
          <p className="eyebrow">{contact.contact_number} · Verknüpfungen</p>
          <h1 className="editor-title">{contact.first_name} {contact.last_name}</h1>
        </div>
        <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>

      {result?.error ? <div className="form-error">{result.error}</div> : null}

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Interessentenschutz</p><h2>Nachgewiesene Objekte</h2></div><span className="subtle">{canReadDisclosures ? `${disclosures.filter((item: any) => !item.archived_at).length} Nachweise` : "Keine Berechtigung"}</span></div>
        {canReadDisclosures ? (
          <div className="data-list">
            {disclosures.map((item: any) => {
              const property = Array.isArray(item.properties) ? item.properties[0] : item.properties;
              return (
                <Link className="data-row data-row-link" to={`/properties/${item.property_id}/interests#objektnachweise`} key={item.id}>
                  <div><strong>{property?.property_number ?? "Objekt"} · {property?.internal_title ?? ""}</strong><small>{item.disclosure_number}{item.archived_at ? " · archiviert" : ""}</small></div>
                  <div className="row-meta"><span>{fmt(item.disclosed_at)}</span><small>{firstIds.has(item.id) ? "Erstnachweis" : "Weiterer Nachweis"}</small></div>
                  <div className="row-meta"><span>{item.acknowledgement_kind === "NONE" ? "Ohne Empfangsbestätigung" : `Bestätigt ${fmt(item.acknowledged_at)}`}</span><small>{item.prior_knowledge_declared ? `Vorkenntnis: ${item.prior_knowledge_source}` : "Keine Vorkenntnis erklärt"}</small></div>
                  <span className="subtle-link">Objekt öffnen →</span>
                </Link>
              );
            })}
            {disclosures.length === 0 ? <p className="empty-state">Diesem Kontakt wurde noch kein Objekt nachgewiesen.</p> : null}
          </div>
        ) : <p className="empty-state">Keine Berechtigung zum Anzeigen von Objektnachweisen.</p>}
      </section>

      <div className="dashboard-grid">
        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Firmen</p><h2>Organisationen</h2></div></div>
          <div className="data-list">
            {links.map((link) => {
              const organization = organizationMap[link.organization_id];
              return (
                <div className="data-row" key={link.id}>
                  <div><strong>{organization?.name ?? "Organisation"}</strong><small>{link.role}{link.position ? ` · ${link.position}` : ""}</small></div>
                  <Form method="post"><input type="hidden" name="_intent" value="remove_organization" /><input type="hidden" name="link_id" value={link.id} /><button className="text-button" type="submit">Entfernen</button></Form>
                </div>
              );
            })}
            {links.length === 0 ? <p className="empty-state">Noch keine Organisation verknüpft.</p> : null}
          </div>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="add_organization" />
            <label><span>Organisation</span><select name="organization_id" required defaultValue=""><option value="" disabled>Bitte auswählen</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.organization_number}</option>)}</select></label>
            <label><span>Rolle</span><select name="role" defaultValue="ANSPRECHPARTNER">{orgRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
            <label><span>Position/Funktion</span><input name="position" placeholder="z. B. Geschäftsführer" /></label>
            <button className="secondary-button" type="submit">Organisation verknüpfen</button>
          </Form>
        </section>

        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Anschrift</p><h2>Adressen</h2></div></div>
          <div className="data-list">
            {addresses.map((address) => (
              <div className="data-row" key={address.id}>
                <div><strong>{address.street} {address.house_number ?? ""}</strong><small>{address.postal_code} {address.city} · {address.address_type}{address.is_primary ? " · Primär" : ""}</small></div>
                <Form method="post"><input type="hidden" name="_intent" value="archive_address" /><input type="hidden" name="address_id" value={address.id} /><input type="hidden" name="version" value={address.version} /><button className="text-button" type="submit">Archivieren</button></Form>
              </div>
            ))}
            {addresses.length === 0 ? <p className="empty-state">Noch keine Adresse hinterlegt.</p> : null}
          </div>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="add_address" />
            <label><span>Adresstyp</span><select name="address_type" defaultValue="PRIMARY"><option value="PRIMARY">Primär</option><option value="PRIVATE">Privat</option><option value="BUSINESS">Geschäftlich</option><option value="CORRESPONDENCE">Korrespondenz</option><option value="OTHER">Sonstige</option></select></label>
            <label><span>Straße *</span><input name="street" required /></label>
            <label><span>Hausnummer</span><input name="house_number" /></label>
            <label><span>PLZ *</span><input name="postal_code" required /></label>
            <label><span>Ort *</span><input name="city" required /></label>
            <button className="secondary-button" type="submit">Adresse hinzufügen</button>
          </Form>
        </section>
      </div>
    </main>
  );
}
