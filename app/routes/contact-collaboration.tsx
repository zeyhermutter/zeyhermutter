import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/contact-collaboration";
import { requireActiveUser } from "~/lib/auth.server";

type ActionResult = { error?: string };

const activityTypes = [
  ["NOTE", "Notiz"],
  ["PHONE_CALL", "Telefonat"],
  ["EMAIL", "E-Mail"],
  ["MEETING", "Termin/Gespräch"],
] as const;

const activityLabels = Object.fromEntries(activityTypes);

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

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });

  const [
    { data: contact, error: contactError },
    { data: activities, error: activityError },
    { data: comments, error: commentError },
    { data: profiles, error: profileError },
  ] = await Promise.all([
    supabase.from("contacts").select("id, contact_number, first_name, last_name").eq("id", contactId).maybeSingle(),
    supabase.from("activity_events").select("id, activity_type, title, description, actor_user_id, occurred_at").eq("contact_id", contactId).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("comments").select("id, body, author_user_id, created_at, updated_at, archived_at").eq("entity_type", "CONTACT").eq("entity_id", contactId).is("archived_at", null).order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("user_id, display_name, status").eq("status", "ACTIVE").order("display_name"),
  ]);

  if (contactError || activityError || commentError || profileError) {
    throw new Response("Aktivitäten konnten nicht geladen werden.", { status: 500 });
  }
  if (!contact) throw new Response("Kontakt nicht gefunden.", { status: 404 });

  const profileMap = Object.fromEntries((profiles ?? []).map((item) => [item.user_id, item.display_name]));
  const commentIds = (comments ?? []).map((item) => item.id);
  let mentions: Array<{ comment_id: string; mentioned_user_id: string }> = [];
  if (commentIds.length > 0) {
    const { data: mentionRows, error: mentionError } = await supabase
      .from("comment_mentions")
      .select("comment_id, mentioned_user_id")
      .in("comment_id", commentIds);
    if (mentionError) throw new Response("Mentions konnten nicht geladen werden.", { status: 500 });
    mentions = mentionRows ?? [];
  }

  const mentionsByComment = mentions.reduce<Record<string, string[]>>((acc, mention) => {
    (acc[mention.comment_id] ??= []).push(mention.mentioned_user_id);
    return acc;
  }, {});

  return data(
    { contact, activities: activities ?? [], comments: comments ?? [], profiles: profiles ?? [], profileMap, mentionsByComment, profile },
    { headers: responseHeaders() },
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const contactId = params.contactId;
  if (!contactId) throw new Response("Kontakt fehlt.", { status: 404 });
  const formData = await request.formData();
  const intent = text(formData, "_intent");

  if (intent === "add_activity") {
    const activityType = text(formData, "activity_type");
    const title = text(formData, "title");
    const description = text(formData, "description");
    const allowedTypes = new Set(activityTypes.map(([key]) => key));
    if (!allowedTypes.has(activityType as (typeof activityTypes)[number][0]) || !title) {
      return data<ActionResult>({ error: "Aktivitätstyp und Titel sind erforderlich." }, { status: 400, headers: responseHeaders() });
    }

    const { error } = await supabase.from("activity_events").insert({
      activity_type: activityType,
      title,
      description: description || null,
      actor_user_id: userId,
      contact_id: contactId,
    });
    if (error) return data<ActionResult>({ error: "Aktivität konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/contacts/${contactId}/collaboration`, { headers: responseHeaders() });
  }

  if (intent === "add_comment") {
    const body = text(formData, "body");
    const mentionedUserIds = formData.getAll("mention_user_id").map(String).filter(Boolean);
    if (!body) return data<ActionResult>({ error: "Kommentar darf nicht leer sein." }, { status: 400, headers: responseHeaders() });

    const { error } = await supabase.rpc("create_contact_comment", {
      p_contact_id: contactId,
      p_body: body,
      p_mentioned_user_ids: mentionedUserIds,
    });
    if (error) return data<ActionResult>({ error: "Kommentar oder Mention konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/contacts/${contactId}/collaboration`, { headers: responseHeaders() });
  }

  return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

export default function ContactCollaboration() {
  const { contact, activities, comments, profiles, profileMap, mentionsByComment, profile } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const mentionableUsers = profiles.filter((item) => item.user_id !== profile.user_id);

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to={`/crm/contacts/${contact.id}/relations`}>← Arbeitsbereich</Link>
          <p className="eyebrow">{contact.contact_number} · Zusammenarbeit</p>
          <h1 className="editor-title">{contact.first_name} {contact.last_name}</h1>
        </div>
        <div className="header-user"><span className="badge">STAGING</span><small>{profile.display_name}</small></div>
      </header>

      {result?.error ? <div className="form-error">{result.error}</div> : null}

      <div className="dashboard-grid">
        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Activity History</p><h2>Aktivitäten</h2></div></div>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="add_activity" />
            <label><span>Typ</span><select name="activity_type" defaultValue="NOTE">{activityTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><span>Titel *</span><input name="title" required placeholder="z. B. Rückruf mit Eigentümer" /></label>
            <label><span>Details</span><textarea name="description" rows={4} /></label>
            <button className="secondary-button" type="submit">Aktivität speichern</button>
          </Form>
          <div className="history-list">
            {activities.map((activity) => (
              <article className="history-event" key={activity.id}>
                <div className="history-head"><strong>{activity.title ?? activityLabels[activity.activity_type] ?? activity.activity_type}</strong><small>{formatDate(activity.occurred_at)}</small></div>
                <p>{activityLabels[activity.activity_type] ?? activity.activity_type} · {activity.actor_user_id ? (profileMap[activity.actor_user_id] ?? "Benutzer") : "System"}</p>
                {activity.description ? <div className="history-change"><small>{activity.description}</small></div> : null}
              </article>
            ))}
            {activities.length === 0 ? <p className="empty-state">Noch keine fachlichen Aktivitäten.</p> : null}
          </div>
        </section>

        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Team</p><h2>Kommentare & @Mentions</h2></div></div>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="add_comment" />
            <label><span>Kommentar *</span><textarea name="body" rows={5} required placeholder="Interne Abstimmung …" /></label>
            {mentionableUsers.length > 0 ? (
              <label><span>Team erwähnen</span><select name="mention_user_id" multiple size={Math.min(4, mentionableUsers.length)}>{mentionableUsers.map((item) => <option key={item.user_id} value={item.user_id}>@{item.display_name}</option>)}</select></label>
            ) : <p className="empty-state">Sobald ein weiterer aktiver Benutzer vorhanden ist, kann er hier per @Mention benachrichtigt werden.</p>}
            <button className="secondary-button" type="submit">Kommentar speichern</button>
          </Form>
          <div className="history-list">
            {comments.map((comment) => {
              const mentioned = mentionsByComment[comment.id] ?? [];
              return (
                <article className="history-event" key={comment.id}>
                  <div className="history-head"><strong>{profileMap[comment.author_user_id] ?? "Benutzer"}</strong><small>{formatDate(comment.created_at)}</small></div>
                  <div className="history-change"><small>{comment.body}</small></div>
                  {mentioned.length > 0 ? <p>{mentioned.map((id) => `@${profileMap[id] ?? "Benutzer"}`).join(" · ")}</p> : null}
                </article>
              );
            })}
            {comments.length === 0 ? <p className="empty-state">Noch keine internen Kommentare.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
