import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/email-compose";
import { requireActiveUser } from "~/lib/auth.server";
import "~/communication.css";

type ContextType = "CONTACT" | "LEAD" | "INQUIRY";
type ContextRef = { type: ContextType; id: string };
type EmailContext = {
  type: ContextType;
  id: string;
  number: string;
  contactId: string;
  contactName: string;
  email: string | null;
  sourcePath: string;
  sourceLabel: string;
};
type ActionResult = { error?: string };
type ActivityMetadata = { direction?: string; capture?: string; channel?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

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

function berlinLocalToIso(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const target = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  let guess = target;
  for (let i = 0; i < 2; i += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    guess = target - (shown - guess);
  }
  return new Date(guess).toISOString();
}

function berlinInputNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function resolveContext(url: URL): ContextRef | null {
  const candidates: ContextRef[] = [];
  const contactId = url.searchParams.get("contact_id");
  const leadId = url.searchParams.get("lead_id");
  const inquiryId = url.searchParams.get("inquiry_id");
  if (contactId) candidates.push({ type: "CONTACT", id: contactId });
  if (leadId) candidates.push({ type: "LEAD", id: leadId });
  if (inquiryId) candidates.push({ type: "INQUIRY", id: inquiryId });
  if (candidates.length > 1) throw new Response("Bitte genau einen CRM-Bezug für die E-Mail öffnen.", { status: 400 });
  const ref = candidates[0] ?? null;
  if (ref && !UUID_RE.test(ref.id)) throw new Response("Ungültiger CRM-Bezug.", { status: 400 });
  return ref;
}

function resolveFormContext(formData: FormData): ContextRef | null {
  const type = text(formData, "context_type") as ContextType;
  const id = text(formData, "context_id");
  if (!(["CONTACT", "LEAD", "INQUIRY"] as string[]).includes(type) || !UUID_RE.test(id)) return null;
  return { type, id };
}

async function loadContext(supabase: any, ref: ContextRef): Promise<EmailContext | null> {
  if (ref.type === "CONTACT") {
    const { data: row, error } = await supabase
      .from("contacts")
      .select("id,contact_number,first_name,last_name,email")
      .eq("id", ref.id)
      .maybeSingle();
    if (error) throw new Response("Kontakt konnte nicht geladen werden.", { status: 500 });
    if (!row) return null;
    return {
      type: ref.type,
      id: row.id,
      number: row.contact_number,
      contactId: row.id,
      contactName: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email,
      sourcePath: `/crm/contacts/${row.id}`,
      sourceLabel: "Kontakt",
    };
  }

  if (ref.type === "LEAD") {
    const { data: row, error } = await supabase
      .from("leads")
      .select("id,lead_number,contact_id,contacts!inner(first_name,last_name,email)")
      .eq("id", ref.id)
      .maybeSingle();
    if (error) throw new Response("Lead konnte nicht geladen werden.", { status: 500 });
    if (!row) return null;
    const contact = one(row.contacts) as { first_name: string; last_name: string; email: string | null } | null;
    if (!contact) return null;
    return {
      type: ref.type,
      id: row.id,
      number: row.lead_number,
      contactId: row.contact_id,
      contactName: `${contact.first_name} ${contact.last_name}`.trim(),
      email: contact.email,
      sourcePath: `/leads/${row.id}`,
      sourceLabel: "Verkäufer-Lead",
    };
  }

  const { data: row, error } = await supabase
    .from("inquiries")
    .select("id,inquiry_number,contact_id,contacts!inner(first_name,last_name,email)")
    .eq("id", ref.id)
    .maybeSingle();
  if (error) throw new Response("Anfrage konnte nicht geladen werden.", { status: 500 });
  if (!row) return null;
  const contact = one(row.contacts) as { first_name: string; last_name: string; email: string | null } | null;
  if (!contact) return null;
  return {
    type: ref.type,
    id: row.id,
    number: row.inquiry_number,
    contactId: row.contact_id,
    contactName: `${contact.first_name} ${contact.last_name}`.trim(),
    email: contact.email,
    sourcePath: `/inquiries/${row.id}`,
    sourceLabel: "Anfrage",
  };
}

function permissionFor(type: ContextType) {
  if (type === "LEAD") return "lead.write";
  if (type === "INQUIRY") return "inquiry.write";
  return "contact.write";
}

function contextQuery(context: EmailContext) {
  const key = context.type === "CONTACT" ? "contact_id" : context.type === "LEAD" ? "lead_id" : "inquiry_id";
  return `?${key}=${encodeURIComponent(context.id)}`;
}

function directionLabel(metadata: unknown) {
  const row = metadata && typeof metadata === "object" ? metadata as ActivityMetadata : {};
  if (row.direction === "SENT") return "Gesendet";
  if (row.direction === "RECEIVED") return "Empfangen";
  return "E-Mail";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const ref = resolveContext(url);
  if (!ref) {
    return data({ context: null, activities: [], profileMap: {}, canWrite: false, profile, nowLocal: berlinInputNow() }, { headers: responseHeaders() });
  }

  const emailContext = await loadContext(supabase, ref);
  if (!emailContext) throw new Response("CRM-Bezug nicht gefunden oder nicht lesbar.", { status: 404, headers: responseHeaders() });

  let activityQuery = supabase
    .from("activity_events")
    .select("id,title,description,actor_user_id,occurred_at,metadata")
    .eq("activity_type", "EMAIL")
    .order("occurred_at", { ascending: false })
    .limit(100);
  activityQuery = ref.type === "CONTACT"
    ? activityQuery.eq("contact_id", ref.id)
    : ref.type === "LEAD"
      ? activityQuery.eq("lead_id", ref.id)
      : activityQuery.eq("inquiry_id", ref.id);

  const [{ data: activities, error: activityError }, { data: profiles, error: profileError }, { data: canWrite, error: permissionError }] = await Promise.all([
    activityQuery,
    supabase.from("profiles").select("user_id,display_name"),
    supabase.rpc("current_user_has_permission", { p_permission: permissionFor(ref.type) }),
  ]);
  if (activityError || profileError || permissionError) {
    throw new Response("E-Mail-Arbeitsbereich konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
  }

  const profileMap = Object.fromEntries((profiles ?? []).map((item: any) => [item.user_id, item.display_name]));
  return data({ context: emailContext, activities: activities ?? [], profileMap, canWrite: canWrite === true, profile, nowLocal: berlinInputNow() }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const formData = await request.formData();
  if (text(formData, "_intent") !== "log_email") {
    return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
  }

  const ref = resolveFormContext(formData);
  if (!ref) return data<ActionResult>({ error: "Ungültiger CRM-Bezug." }, { status: 400, headers: responseHeaders() });
  const emailContext = await loadContext(supabase, ref);
  if (!emailContext) return data<ActionResult>({ error: "CRM-Bezug nicht gefunden." }, { status: 404, headers: responseHeaders() });

  const { data: canWrite } = await supabase.rpc("current_user_has_permission", { p_permission: permissionFor(ref.type) });
  if (canWrite !== true) return data<ActionResult>({ error: "Keine Berechtigung, E-Mail-Aktivitäten für diesen Datensatz zu dokumentieren." }, { status: 403, headers: responseHeaders() });

  const direction = text(formData, "direction");
  if (direction !== "SENT" && direction !== "RECEIVED") {
    return data<ActionResult>({ error: "Bitte Gesendet oder Empfangen auswählen." }, { status: 400, headers: responseHeaders() });
  }
  const title = text(formData, "title");
  if (!title) return data<ActionResult>({ error: "Betreff bzw. Titel ist erforderlich." }, { status: 400, headers: responseHeaders() });
  const localOccurredAt = text(formData, "occurred_at");
  const occurredAt = localOccurredAt ? berlinLocalToIso(localOccurredAt) : new Date().toISOString();
  if (!occurredAt) return data<ActionResult>({ error: "Ungültiger E-Mail-Zeitpunkt." }, { status: 400, headers: responseHeaders() });

  const insert: Record<string, unknown> = {
    activity_type: "EMAIL",
    title,
    description: text(formData, "description") || null,
    actor_user_id: userId,
    contact_id: emailContext.contactId,
    occurred_at: occurredAt,
    metadata: { channel: "EMAIL", direction, capture: "MANUAL" },
  };
  if (ref.type === "LEAD") insert.lead_id = ref.id;
  if (ref.type === "INQUIRY") insert.inquiry_id = ref.id;

  const { error } = await supabase.from("activity_events").insert(insert);
  if (error) return data<ActionResult>({ error: "E-Mail-Aktivität konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
  return redirect(`/crm/email${contextQuery(emailContext)}`, { headers: responseHeaders() });
}

export default function EmailCompose() {
  const { context, activities, profileMap, canWrite, profile, nowLocal } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return <main className="communication-shell">
    <header className="communication-header">
      <div>
        <p className="eyebrow">Arbeitsplatz · Integration</p>
        <h1>E-Mail</h1>
        <p>Externe E-Mail-Kommunikation wird am bestehenden CRM-Bezug dokumentiert. Ein automatischer Postfach-Sync ist auf BETA derzeit nicht konfiguriert.</p>
      </div>
      <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
    </header>

    {result?.error ? <div className="form-error">{result.error}</div> : null}

    <div className="communication-grid">
      <div className="communication-stack">
        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Integrationsstatus</p><h2>Providerunabhängiger Arbeitsablauf</h2></div></div>
          <div className="communication-status">
            <div><span>Mail-Provider</span><strong>Nicht verbunden</strong></div>
            <div><span>Verfügbar</span><strong>Mailprogramm öffnen + CRM-Activity</strong></div>
          </div>
          <p className="communication-note">Das Öffnen des Mailprogramms wird nicht automatisch als Versand gewertet. Nur tatsächlich gesendete oder empfangene E-Mails werden anschließend bewusst als Activity dokumentiert.</p>
        </section>

        {context ? <>
          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">CRM-Bezug</p><h2>{context.sourceLabel} · {context.number}</h2></div><Link className="subtle-link" to={context.sourcePath}>Datensatz öffnen →</Link></div>
            <div className="communication-context-summary">
              <div><span>Kontakt</span><strong>{context.contactName}</strong></div>
              <div><span>E-Mail</span><strong>{context.email ?? "Nicht hinterlegt"}</strong></div>
            </div>
            <div className="communication-actions">
              {context.email ? <a className="primary-button link-button" href={`mailto:${encodeURIComponent(context.email)}`}>E-Mail im Mailprogramm öffnen</a> : <span className="subtle">Keine E-Mail-Adresse vorhanden.</span>}
            </div>
          </section>

          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">Kommunikationshistorie</p><h2>E-Mail-Aktivitäten</h2></div><span className="subtle">letzte 100</span></div>
            <div className="communication-history">
              {activities.map((activity: any) => <article key={activity.id}>
                <div className="communication-history-head"><strong>{activity.title ?? "E-Mail"}</strong><small>{formatDate(activity.occurred_at)}</small></div>
                <span className="communication-direction">{directionLabel(activity.metadata)} · {activity.actor_user_id ? (profileMap[activity.actor_user_id] ?? "Benutzer") : "System"}</span>
                {activity.description ? <p>{activity.description}</p> : null}
              </article>)}
              {activities.length === 0 ? <p className="empty-state">Noch keine E-Mail-Aktivität für diesen CRM-Bezug dokumentiert.</p> : null}
            </div>
          </section>
        </> : <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Kontext erforderlich</p><h2>E-Mail aus dem CRM öffnen</h2></div></div>
          <p className="communication-note">Öffne einen Kontakt, Verkäufer-Lead oder eine Anfrage. Der Eintrag „E-Mail“ in der Sidebar übernimmt den aktuellen CRM-Bezug automatisch.</p>
          <div className="communication-empty-links"><Link className="secondary-button link-button" to="/crm">CRM öffnen</Link><Link className="secondary-button link-button" to="/leads">Verkäufer-Leads</Link><Link className="secondary-button link-button" to="/inquiries">Anfragen</Link></div>
        </section>}
      </div>

      <aside className="communication-stack">
        {context && canWrite ? <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Activity dokumentieren</p><h2>E-Mail erfassen</h2></div></div>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="log_email" />
            <input type="hidden" name="context_type" value={context.type} />
            <input type="hidden" name="context_id" value={context.id} />
            <label><span>Richtung *</span><select name="direction" defaultValue="SENT"><option value="SENT">Gesendet</option><option value="RECEIVED">Empfangen</option></select></label>
            <label><span>Zeitpunkt *</span><input type="datetime-local" name="occurred_at" defaultValue={nowLocal} required /></label>
            <label><span>Betreff / Titel *</span><input name="title" required placeholder="Betreff der E-Mail" /></label>
            <label><span>Interne Dokumentation</span><textarea name="description" rows={5} placeholder="Kurze Zusammenfassung, Zusagen oder nächster Schritt" /></label>
            <button className="secondary-button" type="submit">Als E-Mail-Activity speichern</button>
          </Form>
        </section> : context ? <section className="data-card"><div className="card-head"><div><p className="eyebrow">Berechtigung</p><h2>Nur Lesen</h2></div></div><p className="communication-note">Du kannst die vorhandene Kommunikationshistorie lesen, aber für diesen CRM-Bezug keine neue Activity dokumentieren.</p></section> : null}

        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Kalender</p><h2>CRM-Termine</h2></div></div>
          <p className="communication-note">Besichtigungen, Wiedervorlagen, Eigentümer-/Bewertungstermine und Notartermine werden aus ihren bestehenden CRM-Datensätzen zusammengeführt.</p>
          <div className="communication-actions" style={{ marginTop: 14 }}><Link className="secondary-button link-button" to="/crm/calendar">Kalender öffnen →</Link></div>
        </section>
      </aside>
    </div>
  </main>;
}
