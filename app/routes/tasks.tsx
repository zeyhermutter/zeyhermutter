import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/tasks";
import { TaskCreateModal } from "~/components/task-create-modal";
import { TaskModal } from "~/components/task-modal";
import { requireActiveUser } from "~/lib/auth.server";
import { zeitpunkt as formatDate } from "~/lib/format";
import { AUFGABENPRIORITAET as PRIORITY } from "~/lib/labels";
import "~/inquiry.css";
import "~/programm-liste.css";
import { crmDateAtTimeToIso } from "~/lib/local-time";

type ActionResult = { error?: string };
const STATUS: Record<string, string> = { OPEN: "Offen", IN_PROGRESS: "In Bearbeitung", DONE: "Erledigt", CANCELLED: "Abgebrochen" };

function text(fd: FormData, k: string) { return String(fd.get(k) ?? "").trim(); }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile, userId } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url), status = url.searchParams.get("status") ?? "OPEN";
  // Wessen Aufgaben: wie auf "Mein Tag" -- Meins, je Kollege ein Knopf, Alle.
  // Eine unbekannte Kennung faellt auf Meins zurueck.
  const von = url.searchParams.get("von") ?? "meins";
  let query = supabase.from("tasks").select("id,task_number,title,description,status,priority,due_at,contact_id,property_id,lead_id,inquiry_id,search_profile_id,viewing_id,responsible_user,created_by,version").is("archived_at", null).order("due_at", { ascending: true }).limit(200);
  if (status === "OPEN") query = query.in("status", ["OPEN", "IN_PROGRESS"]);
  else if (status !== "ALL") query = query.eq("status", status);
  const { data: aktive } = await supabase.from("profiles").select("user_id,display_name").eq("status", "ACTIVE").order("display_name");
  const kollegen = ((aktive ?? []) as { user_id: string; display_name: string | null }[])
    .filter((p) => p.user_id !== userId)
    .map((p) => ({ id: p.user_id, name: (p.display_name ?? "").trim().split(/\s+/)[0] || "Kollege" }));
  const ansicht = von === "alle" ? "alle" : kollegen.some((k) => k.id === von) ? von : "meins";
  if (ansicht !== "alle") query = query.eq("responsible_user", ansicht === "meins" ? userId : ansicht);

  const [{ data: tasks, error: taskError }, { data: profiles, error: profileError }, { data: properties, error: propertyError }, { data: leads, error: leadError }, { data: inquiries, error: inquiryError }, { data: searchProfiles, error: searchProfileError }, { data: viewings, error: viewingError }, { data: canWrite }] = await Promise.all([
    query,
    supabase.from("profiles").select("user_id,display_name,status").eq("status", "ACTIVE").order("display_name"),
    supabase.from("properties").select("id,property_number,internal_title,status").neq("status", "ARCHIVED").order("updated_at", { ascending: false }).limit(500),
    supabase.from("leads").select("id,lead_number,status,contact_id,property_city,contacts!inner(first_name,last_name)").is("archived_at", null).order("updated_at", { ascending: false }).limit(500),
    supabase.from("inquiries").select("id,inquiry_number,status,contact_id,property_id").is("archived_at", null).order("updated_at", { ascending: false }).limit(500),
    supabase.from("search_profiles").select("id,search_profile_number,title,status,contact_id").is("archived_at", null).order("updated_at", { ascending: false }).limit(500),
    supabase.from("viewings").select("id,viewing_number,status,starts_at,contact_id,property_id,inquiry_id,search_profile_id").is("archived_at", null).order("starts_at", { ascending: false }).limit(500),
    supabase.rpc("current_user_has_permission", { p_permission: "task.write" }),
  ]);

  if (taskError || profileError || propertyError || leadError || inquiryError || searchProfileError || viewingError) throw new Response("Aufgaben konnten nicht geladen werden.", { status: 500 });
  const taskIds = (tasks ?? []).map((task: any) => task.id);
  const watcherPromise = taskIds.length ? supabase.from("task_watchers").select("task_id,user_id,created_at").in("task_id", taskIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null } as any);
  const commentPromise = taskIds.length ? supabase.from("comments").select("id,entity_id,body,author_user_id,created_at").eq("entity_type", "TASK").in("entity_id", taskIds).is("archived_at", null).order("created_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null } as any);
  // Kontakte nur fuer die angezeigten Aufgaben (14.10.2026). Vorher kamen
  // Namen aus einer Liste der ersten 500 Kontakte -- eine Aufgabe zu einem
  // Kontakt dahinter stand ohne Namen da. Gewaehlt wird beim Anlegen ueber
  // die Suche (KontaktAuswahl).
  const kontaktIds = Array.from(new Set((tasks ?? []).map((task: any) => task.contact_id).filter(Boolean)));
  const contactPromise = kontaktIds.length ? supabase.from("contacts").select("id,contact_number,first_name,last_name").in("id", kontaktIds) : Promise.resolve({ data: [], error: null } as any);
  const [{ data: watchers, error: watcherError }, { data: comments, error: commentError }, { data: contacts, error: contactError }] = await Promise.all([watcherPromise, commentPromise, contactPromise]);
  if (contactError) throw new Response("Aufgaben konnten nicht geladen werden.", { status: 500 });
  if (watcherError || commentError) throw new Response("Aufgaben-Zusammenarbeit konnte nicht geladen werden.", { status: 500 });

  const map = (arr: any[], key: string) => Object.fromEntries(arr.map((x) => [x[key], x]));
  const group = (arr: any[], key: string) => arr.reduce((acc: Record<string, any[]>, item: any) => { (acc[item[key]] ??= []).push(item); return acc; }, {});
  return data({ tasks: tasks ?? [], profiles: profiles ?? [], properties: properties ?? [], leads: leads ?? [], inquiries: inquiries ?? [], searchProfiles: searchProfiles ?? [], viewings: viewings ?? [], contactMap: map(contacts ?? [], "id"), profileMap: Object.fromEntries((profiles ?? []).map((x: any) => [x.user_id, x.display_name])), propertyMap: map(properties ?? [], "id"), leadMap: map(leads ?? [], "id"), inquiryMap: map(inquiries ?? [], "id"), searchProfileMap: map(searchProfiles ?? [], "id"), viewingMap: map(viewings ?? [], "id"), watchersByTask: group(watchers ?? [], "task_id"), commentsByTask: group(comments ?? [], "entity_id"), profile, status, ansicht, kollegen, canWrite: canWrite === true }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const fd = await request.formData(), intent = text(fd, "_intent");
  // Zurueck in dieselbe Ansicht: Status und Umfang (Meins/Kollege/Alle) bleiben.
  const back = `/crm/tasks${new URL(request.url).search}`;
  async function validAssignee(candidate: string) {
    const target = candidate || userId;
    const { data: a } = await supabase.from("profiles").select("user_id").eq("user_id", target).eq("status", "ACTIVE").maybeSingle();
    return a?.user_id ?? null;
  }
  async function validUser(candidate: string) {
    if (!candidate) return null;
    const { data: a } = await supabase.from("profiles").select("user_id").eq("user_id", candidate).eq("status", "ACTIVE").maybeSingle();
    return a?.user_id ?? null;
  }

  if (intent === "create") {
    const title = text(fd, "title"), description = text(fd, "description"), priority = text(fd, "priority") || "NORMAL", dueDate = text(fd, "due_date"), responsibleUser = await validAssignee(text(fd, "responsible_user"));
    if (!title || !dueDate) return data<ActionResult>({ error: "Titel und Fälligkeitsdatum sind erforderlich." }, { status: 400, headers: responseHeaders() });
    if (!responsibleUser) return data<ActionResult>({ error: "Der ausgewählte Verantwortliche ist nicht aktiv." }, { status: 400, headers: responseHeaders() });
    const { error } = await supabase.from("tasks").insert({ title, description: description || null, priority, due_at: crmDateAtTimeToIso(dueDate), responsible_user: responsibleUser, contact_id: text(fd, "contact_id") || null, property_id: text(fd, "property_id") || null, lead_id: text(fd, "lead_id") || null, inquiry_id: text(fd, "inquiry_id") || null, search_profile_id: text(fd, "search_profile_id") || null, viewing_id: text(fd, "viewing_id") || null, created_by: userId, updated_by: userId });
    if (error) return data<ActionResult>({ error: "Aufgabe konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    return redirect("/crm/tasks", { headers: responseHeaders() });
  }

  if (intent === "assign") {
    const taskId = text(fd, "task_id"), version = Number(text(fd, "version")), responsibleUser = await validAssignee(text(fd, "responsible_user"));
    if (!responsibleUser) return data<ActionResult>({ error: "Der ausgewählte Verantwortliche ist nicht aktiv." }, { status: 400, headers: responseHeaders() });
    const { data: updated, error } = await supabase.from("tasks").update({ responsible_user: responsibleUser }).eq("id", taskId).eq("version", version).select("id").maybeSingle();
    if (error) return data<ActionResult>({ error: "Aufgabe konnte nicht neu zugewiesen werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Die Aufgabe wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(back, { headers: responseHeaders() });
  }

  if (intent === "task_due") {
    const taskId = text(fd, "task_id"), version = Number(text(fd, "task_version")), dueDate = text(fd, "due_date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !crmDateAtTimeToIso(dueDate)) return data<ActionResult>({ error: "Bitte ein gültiges Fälligkeitsdatum angeben." }, { status: 400, headers: responseHeaders() });
    const { data: updated, error } = await supabase.from("tasks").update({ due_at: crmDateAtTimeToIso(dueDate) }).eq("id", taskId).eq("version", version).select("id").maybeSingle();
    if (error) return data<ActionResult>({ error: "Fälligkeit konnte nicht geändert werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Die Aufgabe wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(back, { headers: responseHeaders() });
  }

  if (intent === "task_watcher_add") {
    const taskId = text(fd, "task_id"), watcherUser = await validUser(text(fd, "watcher_user_id"));
    if (!watcherUser) return data<ActionResult>({ error: "Der ausgewählte Beobachter ist nicht aktiv." }, { status: 400, headers: responseHeaders() });
    const { data: task } = await supabase.from("tasks").select("responsible_user").eq("id", taskId).is("archived_at", null).maybeSingle();
    if (!task) return data<ActionResult>({ error: "Aufgabe nicht gefunden." }, { status: 404, headers: responseHeaders() });
    if (task.responsible_user === watcherUser) return data<ActionResult>({ error: "Der Verantwortliche wird nicht zusätzlich als Beobachter geführt." }, { status: 400, headers: responseHeaders() });
    const { error } = await supabase.from("task_watchers").insert({ task_id: taskId, user_id: watcherUser, created_by: userId });
    if (error && !error.message.toLowerCase().includes("duplicate")) return data<ActionResult>({ error: "Beobachter konnte nicht hinzugefügt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(back, { headers: responseHeaders() });
  }

  if (intent === "task_watcher_remove") {
    const taskId = text(fd, "task_id"), watcherUser = text(fd, "watcher_user_id");
    const { error } = await supabase.from("task_watchers").delete().eq("task_id", taskId).eq("user_id", watcherUser);
    if (error) return data<ActionResult>({ error: "Beobachter konnte nicht entfernt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(back, { headers: responseHeaders() });
  }

  if (intent === "task_comment") {
    const taskId = text(fd, "task_id"), body = text(fd, "body"), mentions = fd.getAll("mention_user_id").map(String);
    if (!body) return data<ActionResult>({ error: "Kommentar darf nicht leer sein." }, { status: 400, headers: responseHeaders() });
    const { error } = await supabase.rpc("create_task_comment", { p_task_id: taskId, p_body: body, p_mentioned_user_ids: mentions });
    if (error) return data<ActionResult>({ error: "Kommentar konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    return redirect(back, { headers: responseHeaders() });
  }

  if (intent === "task_status") {
    const next = text(fd, "task_status");
    if (!Object.hasOwn(STATUS, next)) return data<ActionResult>({ error: "Ungültiger Aufgabenstatus." }, { status: 400, headers: responseHeaders() });
    const update: any = { status: next, completed_at: next === "DONE" ? new Date().toISOString() : null };
    const { data: updated, error } = await supabase.from("tasks").update(update).eq("id", text(fd, "task_id")).eq("version", Number(text(fd, "task_version"))).select("id").maybeSingle();
    if (error) return data<ActionResult>({ error: "Aufgabe konnte nicht aktualisiert werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Die Aufgabe wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(back, { headers: responseHeaders() });
  }

  if (["start", "complete", "cancel", "reopen", "archive"].includes(intent)) {
    const taskId = text(fd, "task_id"), version = Number(text(fd, "version")), update: Record<string, unknown> = {};
    if (intent === "start") update.status = "IN_PROGRESS";
    if (intent === "complete") { update.status = "DONE"; update.completed_at = new Date().toISOString(); }
    if (intent === "cancel") update.status = "CANCELLED";
    if (intent === "reopen") { update.status = "OPEN"; update.completed_at = null; }
    if (intent === "archive") update.archived_at = new Date().toISOString();
    const { data: updated, error } = await supabase.from("tasks").update(update).eq("id", taskId).eq("version", version).select("id").maybeSingle();
    if (error) return data<ActionResult>({ error: "Aufgabe konnte nicht aktualisiert werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Die Aufgabe wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(back, { headers: responseHeaders() });
  }

  return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

export default function Tasks() {
  const { tasks, profiles, properties, leads, inquiries, searchProfiles, viewings, contactMap, profileMap, propertyMap, leadMap, inquiryMap, searchProfileMap, viewingMap, watchersByTask, commentsByTask, profile, status, ansicht, kollegen, canWrite } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const leadOptions = leads.map((x: any) => ({ id: x.id, label: x.lead_number }));
  const propertyOptions = properties.map((x: any) => ({ id: x.id, label: `${x.property_number} · ${x.internal_title}` }));
  const searchProfileOptions = searchProfiles.map((x: any) => ({ id: x.id, label: `${x.search_profile_number} · ${x.title}` }));
  const inquiryOptions = inquiries.map((x: any) => ({ id: x.id, label: x.inquiry_number }));
  const viewingOptions = viewings.map((x: any) => ({ id: x.id, label: `${x.viewing_number} · ${formatDate(x.starts_at)}` }));

  const umfang = [
    { schluessel: "meins", name: "Meins" },
    ...kollegen.map((k: { id: string; name: string }) => ({ schluessel: k.id, name: k.name })),
    { schluessel: "alle", name: "Alle" },
  ];
  const mitUmfang = (schluessel: string) => {
    const p = new URLSearchParams();
    if (status !== "OPEN") p.set("status", status);
    if (schluessel !== "meins") p.set("von", schluessel);
    const q = p.toString();
    return q ? `/crm/tasks?${q}` : "/crm/tasks";
  };

  // Eine Programmliste wie die Kontaktliste (12.10.2026): oben die
  // Werkzeugleiste, darunter eine Zeile je Aufgabe. Vorher eine Karte mit
  // Unterzeilen, "ÜBERFÄLLIG" als Text und einem Zuordnen-Knopf je Aufgabe.
  // Zuordnen geht jetzt direkt in der Spalte "Verantwortlich".
  return <main className="editor-shell programm-liste">
    {result?.error ? <div className="form-error">{result.error}</div> : null}
    <div className="programm-liste-werkzeuge">
      <nav className="programm-umfang" aria-label="Wessen Aufgaben">
        {umfang.map((u) => <Link key={u.schluessel} className={ansicht === u.schluessel ? "aktiv" : ""} aria-current={ansicht === u.schluessel ? "page" : undefined} to={mitUmfang(u.schluessel)}>{u.name}</Link>)}
      </nav>
      <Form method="get">
        {ansicht !== "meins" ? <input type="hidden" name="von" value={ansicht}/> : null}
        <label><span className="sr-only">Status</span><select name="status" defaultValue={status} onChange={(e) => e.currentTarget.form?.requestSubmit()}><option value="OPEN">Offen</option><option value="ALL">Alle</option><option value="DONE">Erledigt</option><option value="CANCELLED">Abgebrochen</option></select></label>
      </Form>
      <span className="programm-liste-zaehler">{tasks.length} {tasks.length === 1 ? "Aufgabe" : "Aufgaben"}</span>
      {canWrite?<TaskCreateModal profiles={profiles} currentUserId={profile.user_id} leads={leadOptions} properties={propertyOptions} searchProfiles={searchProfileOptions} inquiries={inquiryOptions} viewings={viewingOptions}/>:null}
    </div>
    <div className="programm-tabelle-rahmen">
      {tasks.length === 0 ? <p className="programm-liste-leer">Keine Aufgaben in dieser Ansicht.</p> : <table className="programm-tabelle aufgaben-tabelle">
        <thead><tr><th>Fällig</th><th>Aufgabe</th><th>Bezug</th><th>Verantwortlich</th><th>Priorität</th><th>Status</th><th><span className="sr-only">Öffnen</span></th></tr></thead>
        <tbody>
        {tasks.map((task: any) => {
          const contact = task.contact_id ? contactMap[task.contact_id] : null, property = task.property_id ? propertyMap[task.property_id] : null, lead = task.lead_id ? leadMap[task.lead_id] : null, inquiry = task.inquiry_id ? inquiryMap[task.inquiry_id] : null, sp = task.search_profile_id ? searchProfileMap[task.search_profile_id] : null, viewing = task.viewing_id ? viewingMap[task.viewing_id] : null;
          const overdue = ["OPEN", "IN_PROGRESS"].includes(task.status) && task.due_at && new Date(task.due_at).getTime() < Date.now();
          const contextLabel = viewing ? `Besichtigung · ${viewing.viewing_number}${inquiry ? ` · ${inquiry.inquiry_number}` : ""}${property ? ` · ${property.property_number} / ${property.internal_title}` : ""}` : inquiry ? `Anfrage · ${inquiry.inquiry_number}${property ? ` · ${property.property_number} / ${property.internal_title}` : ""}` : sp ? `Suchprofil · ${sp.search_profile_number} · ${sp.title}` : lead ? `Lead · ${lead.lead_number}` : property ? `Immobilie · ${property.property_number} / ${property.internal_title}` : contact ? `Kontakt · ${contact.contact_number} · ${contact.first_name} ${contact.last_name}` : "Allgemeine Aufgabe";
          const contextHref = viewing ? `/viewings/${viewing.id}` : inquiry ? `/inquiries/${inquiry.id}` : sp ? `/search-profiles/${sp.id}` : lead ? `/leads/${lead.id}` : property ? `/properties/${property.id}` : contact ? `/crm/contacts/${contact.id}` : undefined;
          const watchers = watchersByTask[task.id] ?? [], comments = commentsByTask[task.id] ?? [];
          const verantwortlich = task.responsible_user ? (profileMap[task.responsible_user] ?? "Benutzer") : "—";
          return <tr key={task.id} className={overdue ? "ueberfaellig" : undefined}>
            <td className="zahl">{task.due_at ? formatDate(task.due_at) : "—"}</td>
            <td><strong>{task.title}</strong><div className="leise">{task.task_number}{watchers.length ? ` · ${watchers.length} Beobachter` : ""}{comments.length ? ` · ${comments.length} Kommentare` : ""}</div></td>
            <td>{contextHref ? <Link to={contextHref}>{contextLabel}</Link> : <span className="leise">{contextLabel}</span>}</td>
            <td>{canWrite ? <Form method="post"><input type="hidden" name="_intent" value="assign"/><input type="hidden" name="task_id" value={task.id}/><input type="hidden" name="version" value={task.version}/><label><span className="sr-only">Verantwortlich für {task.title}</span><select name="responsible_user" defaultValue={task.responsible_user ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()}>{profiles.map((x: any) => <option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select></label></Form> : verantwortlich}</td>
            <td><span className={`prioritaet prioritaet-${String(task.priority).toLowerCase()}`}>{PRIORITY[task.priority] ?? task.priority}</span></td>
            <td><span className={`task-status-badge status-${String(task.status).toLowerCase()}`}>{STATUS[task.status] ?? task.status}</span></td>
            <td className="rechts"><TaskModal task={task} responsibleName={verantwortlich} contextLabel={contextLabel} contextHref={contextHref} canWrite={canWrite} profiles={profiles} watchers={watchers} comments={comments} profileMap={profileMap}/></td>
          </tr>;
        })}
        </tbody>
      </table>}
    </div>
  </main>;
}
