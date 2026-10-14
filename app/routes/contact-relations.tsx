import { AufgabenBaustein } from "~/components/aufgaben-baustein";
import { aufgabenRahmen, AUFGABEN_SPALTEN } from "~/lib/aufgaben.server";
import { KontaktAuswahl } from "~/components/kontakt-auswahl";
import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/contact-relations";
import { requireActiveUser } from "~/lib/auth.server";

type ActionResult = { error?: string; success?: string };

const relationshipTypes = [
  ["SPOUSE", "Ehepartner"],
  ["FAMILY_MEMBER", "Familienmitglied"],
  ["CO_OWNER", "Miteigentümer"],
  ["AUTHORIZED_REPRESENTATIVE", "Bevollmächtigter"],
  ["BENEFICIAL_OWNER", "Wirtschaftlich Berechtigter"],
  ["BUYER_GROUP", "Käufergemeinschaft"],
  ["HEIR_COMMUNITY", "Erbengemeinschaft"],
  ["REFERRAL_SOURCE", "Empfehlung durch"],
] as const;

const relationshipLabels = Object.fromEntries(relationshipTypes);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(
    request,
    context.cloudflare.env,
  );
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });
  const rahmen = aufgabenRahmen(supabase);

  const [
    { data: contact, error: contactError },
    { data: roles, error: rolesError },
    { data: assignments, error: assignmentError },
    { data: outgoing, error: outgoingError },
    { data: incoming, error: incomingError },
    { data: tasks, error: tasksError },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, contact_number, first_name, last_name")
      .eq("id", contactId)
      .maybeSingle(),
    supabase.from("contact_roles").select("id, key, name").order("name"),
    supabase
      .from("contact_role_assignments")
      .select("role_id")
      .eq("contact_id", contactId),
    supabase
      .from("contact_relationships")
      .select("id, contact_id, related_contact_id, relationship_type, notes, valid_from, valid_until, gegenueber:contacts!contact_relationships_related_contact_id_fkey(id, contact_number, first_name, last_name)")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
    supabase
      .from("contact_relationships")
      .select("id, contact_id, related_contact_id, relationship_type, notes, valid_from, valid_until, gegenueber:contacts!contact_relationships_contact_id_fkey(id, contact_number, first_name, last_name)")
      .eq("related_contact_id", contactId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select(AUFGABEN_SPALTEN)
      .eq("contact_id", contactId)
      .is("archived_at", null)
      .order("due_at", { ascending: true })
      .limit(50),
  ]);

  if (
    contactError ||
    rolesError ||
    assignmentError ||
    outgoingError ||
    incomingError ||
    tasksError
  ) {
    throw new Response("Kontakt-Arbeitsbereich konnte nicht geladen werden.", { status: 500 });
  }
  if (!contact) throw new Response("Kontakt nicht gefunden.", { status: 404 });

  const assignedRoleIds = new Set((assignments ?? []).map((item) => item.role_id));
  // Die Gegenueber kommen mit den Beziehungen (14.10.2026). Vorher aus einer
  // Liste der ersten 250 Kontakte -- wer dahinter lag, erschien nur als
  // "Kontakt" und war nicht waehlbar.
  const gegenueber = [...(outgoing ?? []), ...(incoming ?? [])].map((rel: any) => Array.isArray(rel.gegenueber) ? rel.gegenueber[0] : rel.gegenueber).filter(Boolean);
  const contactMap = Object.fromEntries(gegenueber.map((item: any) => [item.id, item]));

  return data(
    {
      contact,
      profile,
      roles: roles ?? [],
      assignedRoleIds: Array.from(assignedRoleIds),
      outgoing: outgoing ?? [],
      incoming: incoming ?? [],
      contactMap,
      tasks: tasks ?? [],
      ...(await rahmen),
    },
    { headers: responseHeaders() },
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(
    request,
    context.cloudflare.env,
  );
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });

  const formData = await request.formData();
  const intent = text(formData, "_intent");

  if (intent === "add_role") {
    const roleId = text(formData, "role_id");
    if (!roleId) return data<ActionResult>({ error: "Bitte Rolle auswählen." }, { status: 400, headers: responseHeaders() });

    const { error } = await supabase.from("contact_role_assignments").insert({
      contact_id: contactId,
      role_id: roleId,
      created_by: userId,
    });

    if (error) {
      const message = error.code === "23505" ? "Diese Rolle ist bereits zugewiesen." : "Rolle konnte nicht zugewiesen werden.";
      return data<ActionResult>({ error: message }, { status: 400, headers: responseHeaders() });
    }
    return redirect(`/crm/contacts/${contactId}/relations`, { headers: responseHeaders() });
  }

  if (intent === "remove_role") {
    const roleId = text(formData, "role_id");
    const { error } = await supabase
      .from("contact_role_assignments")
      .delete()
      .eq("contact_id", contactId)
      .eq("role_id", roleId);
    if (error) return data<ActionResult>({ error: "Rolle konnte nicht entfernt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/contacts/${contactId}/relations`, { headers: responseHeaders() });
  }

  if (intent === "add_relationship") {
    const relatedContactId = text(formData, "related_contact_id");
    const relationshipType = text(formData, "relationship_type");
    const notes = text(formData, "notes");
    const allowedTypes = new Set(relationshipTypes.map(([key]) => key));

    if (!relatedContactId || !allowedTypes.has(relationshipType as (typeof relationshipTypes)[number][0])) {
      return data<ActionResult>({ error: "Bitte Kontakt und Beziehungstyp auswählen." }, { status: 400, headers: responseHeaders() });
    }
    if (relatedContactId === contactId) {
      return data<ActionResult>({ error: "Ein Kontakt kann nicht mit sich selbst verknüpft werden." }, { status: 400, headers: responseHeaders() });
    }

    const { error } = await supabase.from("contact_relationships").insert({
      contact_id: contactId,
      related_contact_id: relatedContactId,
      relationship_type: relationshipType,
      notes: notes || null,
      created_by: userId,
    });

    if (error) {
      const message = error.code === "23505" ? "Diese Beziehung besteht bereits." : "Beziehung konnte nicht gespeichert werden.";
      return data<ActionResult>({ error: message }, { status: 400, headers: responseHeaders() });
    }
    return redirect(`/crm/contacts/${contactId}/relations`, { headers: responseHeaders() });
  }

  if (intent === "remove_relationship") {
    const relationshipId = text(formData, "relationship_id");
    const { error } = await supabase
      .from("contact_relationships")
      .delete()
      .eq("id", relationshipId)
      .or(`contact_id.eq.${contactId},related_contact_id.eq.${contactId}`);
    if (error) return data<ActionResult>({ error: "Beziehung konnte nicht entfernt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/contacts/${contactId}/relations`, { headers: responseHeaders() });
  }

  return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

export default function ContactRelations() {
  const { contact, profile, roles, assignedRoleIds, outgoing, incoming, contactMap, tasks, nutzer, darfAufgaben } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const assigned = new Set(assignedRoleIds);
  const availableRoles = roles.filter((role) => !assigned.has(role.id));

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to={`/crm/contacts/${contact.id}`}>← Übersicht</Link>
          <p className="eyebrow">{contact.contact_number} · CRM-Arbeitsbereich</p>
          <h1 className="editor-title">{contact.first_name} {contact.last_name}</h1>
        </div>
        <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>

      {result?.error ? <div className="form-error">{result.error}</div> : null}

      <div className="dashboard-grid">
        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">CRM</p><h2>Rollen</h2></div></div>
          <div className="data-list">
            {roles.filter((role) => assigned.has(role.id)).map((role) => (
              <div className="data-row" key={role.id}>
                <div><strong>{role.name}</strong><small>{role.key}</small></div>
                <Form method="post"><input type="hidden" name="_intent" value="remove_role" /><input type="hidden" name="role_id" value={role.id} /><button className="text-button" type="submit">Entfernen</button></Form>
              </div>
            ))}
            {assignedRoleIds.length === 0 ? <p className="empty-state">Noch keine Rollen zugewiesen.</p> : null}
          </div>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="add_role" />
            <label><span>Rolle hinzufügen</span><select name="role_id" required defaultValue=""><option value="" disabled>Bitte auswählen</option>{availableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <button className="secondary-button" type="submit">Rolle zuweisen</button>
          </Form>
        </section>

        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Beziehungen</p><h2>Personen</h2></div></div>
          <div className="data-list">
            {outgoing.map((rel) => {
              const related = contactMap[rel.related_contact_id];
              return <div className="data-row" key={`out-${rel.id}`}><div><strong>{related ? `${related.first_name} ${related.last_name}` : "Kontakt"}</strong><small>{relationshipLabels[rel.relationship_type] ?? rel.relationship_type} · ausgehend</small></div><Form method="post"><input type="hidden" name="_intent" value="remove_relationship" /><input type="hidden" name="relationship_id" value={rel.id} /><button className="text-button" type="submit">Entfernen</button></Form></div>;
            })}
            {incoming.map((rel) => {
              const related = contactMap[rel.contact_id];
              return <div className="data-row" key={`in-${rel.id}`}><div><strong>{related ? `${related.first_name} ${related.last_name}` : "Kontakt"}</strong><small>{relationshipLabels[rel.relationship_type] ?? rel.relationship_type} · eingehend</small></div><Form method="post"><input type="hidden" name="_intent" value="remove_relationship" /><input type="hidden" name="relationship_id" value={rel.id} /><button className="text-button" type="submit">Entfernen</button></Form></div>;
            })}
            {outgoing.length === 0 && incoming.length === 0 ? <p className="empty-state">Noch keine Personenbeziehungen.</p> : null}
          </div>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="add_relationship" />
            <KontaktAuswahl name="related_contact_id" beschriftung="Kontakt" pflicht ausschliessen={[contact.id]} />
            <label><span>Beziehung</span><select name="relationship_type" required defaultValue=""><option value="" disabled>Bitte auswählen</option>{relationshipTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><span>Notiz</span><input name="notes" /></label>
            <button className="secondary-button" type="submit">Beziehung hinzufügen</button>
          </Form>
        </section>
      </div>

      <AufgabenBaustein aufgaben={tasks as any} art="contact" id={contact.id} nutzer={nutzer} ich={profile.user_id} darfSchreiben={darfAufgaben} kontextName={`Kontakt ${contact.contact_number}`} />
    </main>
  );
}
