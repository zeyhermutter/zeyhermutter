import { redirect } from "react-router";
import { requirePermission } from "~/lib/auth.server";
import { crmDateAtTimeToIso } from "~/lib/local-time";

// Aufgaben anlegen und abhaken -- fuer den Aufgaben-Baustein in jeder Akte
// (P1, 14.10.2026).
//
// WARUM
//
// Kontakt, Lead, Anfrage, Besichtigung und Suchprofil hatten je ein eigenes
// Aufgabenformular und je eine eigene Aktion -- fuenf Fassungen derselben
// Sache, mit unterschiedlichen Feldern (mal Datum, mal Datum mit Uhrzeit),
// unterschiedlicher Rueckmeldung und ohne Abhaken in der Zeile. Objekt- und
// Kontakt-Uebersicht konnten Aufgaben nur zeigen.
//
// Jetzt gibt es eine Stelle. Sie leitet die Verknuepfungen aus der Akte ab,
// wie es die alten Aktionen taten: eine Aufgabe an der Besichtigung haengt
// auch am Kontakt, am Objekt, an der Anfrage und am Suchprofil. Danach geht
// es zurueck auf die Seite, von der das Formular kam.

type Art = "contact" | "lead" | "inquiry" | "viewing" | "search_profile" | "property";
const ARTEN: Art[] = ["contact", "lead", "inquiry", "viewing", "search_profile", "property"];
const PRIORITAETEN = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const STATUS = new Set(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]);
const KENNUNG = /^[0-9a-f-]{36}$/i;
const SPALTE: Record<Art, string> = {
  contact: "contact_id", lead: "lead_id", inquiry: "inquiry_id", viewing: "viewing_id", search_profile: "search_profile_id", property: "property_id",
};

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Nur Pfade dieser Anwendung -- nie eine fremde Adresse. */
function rueckweg(roh: string, ergebnis: string, extra: Record<string, string> = {}) {
  const sicher = roh.startsWith("/") && !roh.startsWith("//") ? roh : "/crm/tasks";
  const url = new URL(sicher, "https://intern.invalid");
  url.searchParams.set("aufgabe", ergebnis);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v.slice(0, 300));
  return `${url.pathname}${url.search}#aufgaben`;
}

async function verknuepfungen(supabase: any, art: Art, id: string): Promise<Record<string, string | null> | null> {
  if (art === "contact") return { contact_id: id };
  if (art === "property") return { property_id: id };
  if (art === "lead") {
    const { data } = await supabase.from("leads").select("contact_id").eq("id", id).maybeSingle();
    return data ? { lead_id: id, contact_id: data.contact_id ?? null } : null;
  }
  if (art === "search_profile") {
    const { data } = await supabase.from("search_profiles").select("contact_id").eq("id", id).maybeSingle();
    return data ? { search_profile_id: id, contact_id: data.contact_id ?? null } : null;
  }
  if (art === "inquiry") {
    const { data } = await supabase.from("inquiries").select("contact_id,property_id,search_profile_id").eq("id", id).maybeSingle();
    return data ? { inquiry_id: id, contact_id: data.contact_id ?? null, property_id: data.property_id ?? null, search_profile_id: data.search_profile_id ?? null } : null;
  }
  const { data } = await supabase.from("viewings").select("contact_id,property_id,search_profile_id,inquiry_id").eq("id", id).maybeSingle();
  return data ? { viewing_id: id, contact_id: data.contact_id ?? null, property_id: data.property_id ?? null, search_profile_id: data.search_profile_id ?? null, inquiry_id: data.inquiry_id ?? null } : null;
}

export async function loader() {
  return redirect("/crm/tasks");
}

export async function action({ request, context }: any) {
  const { supabase, responseHeaders, userId } = await requirePermission(request, context.cloudflare.env, "task.write");
  const fd = await request.formData();
  const zurueck = text(fd, "zurueck");
  const geh = (ergebnis: string) => redirect(rueckweg(zurueck, ergebnis), { headers: responseHeaders() });
  const intent = text(fd, "_intent");

  if (intent === "anlegen") {
    const art = text(fd, "kontext_art") as Art;
    const id = text(fd, "kontext_id");
    const titel = text(fd, "titel");
    const faellig = text(fd, "faellig");
    const prioritaet = text(fd, "prioritaet") || "NORMAL";
    if (!ARTEN.includes(art) || !KENNUNG.test(id) || !titel || !/^\d{4}-\d{2}-\d{2}$/.test(faellig) || !PRIORITAETEN.has(prioritaet)) return geh("unvollstaendig");
    const uhrzeit = /^\d{2}:\d{2}$/.test(text(fd, "uhrzeit")) ? text(fd, "uhrzeit") : "09:00";
    const due = crmDateAtTimeToIso(faellig, uhrzeit);
    const bezug = await verknuepfungen(supabase, art, id);
    if (!due || !bezug) return geh("fehler");
    const verantwortlich = text(fd, "verantwortlich");

    // Doppelt angelegt? (14.10.2026) Am Lead ZM-L-000009 standen zwei
    // gleiche Wiedervorlagen, 42 Sekunden nacheinander angelegt -- eine fuer
    // jeden der beiden. Gibt es am selben Vorgang schon eine offene Aufgabe
    // mit gleichem Titel, fragt das Formular einmal nach.
    if (text(fd, "trotzdem") !== "1") {
      const gleich = (s: string) => s.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
      const { data: offen } = await supabase.from("tasks").select("task_number,title,responsible_user")
        .eq(SPALTE[art], id).in("status", ["OPEN", "IN_PROGRESS"]).is("archived_at", null).limit(200);
      const treffer = ((offen ?? []) as any[]).find((t) => gleich(t.title) === gleich(titel));
      if (treffer) {
        const { data: wer } = treffer.responsible_user
          ? await supabase.from("profiles").select("display_name").eq("user_id", treffer.responsible_user).maybeSingle()
          : { data: null };
        return redirect(rueckweg(zurueck, "doppelt", {
          doppelt_nr: treffer.task_number, doppelt_wer: wer?.display_name ?? "",
          titel, faellig, uhrzeit, prioritaet, verantwortlich, beschreibung: text(fd, "beschreibung"),
        }), { headers: responseHeaders() });
      }
    }
    const { error } = await supabase.from("tasks").insert({
      title: titel.slice(0, 300),
      description: text(fd, "beschreibung") || null,
      status: "OPEN",
      priority: prioritaet,
      due_at: due,
      responsible_user: KENNUNG.test(verantwortlich) ? verantwortlich : userId,
      ...bezug,
      created_by: userId,
      updated_by: userId,
    });
    return geh(error ? "fehler" : "angelegt");
  }

  // Abhaken in der Zeile und die Statusknoepfe im Aufgabenfenster.
  if (intent === "task_status" || intent === "erledigt") {
    const status = intent === "erledigt" ? "DONE" : text(fd, "task_status");
    const taskId = text(fd, "task_id");
    const version = Number(text(fd, "task_version"));
    if (!STATUS.has(status) || !KENNUNG.test(taskId) || !Number.isInteger(version)) return geh("fehler");
    const { data: geaendert, error } = await supabase.from("tasks")
      .update({ status, completed_at: status === "DONE" ? new Date().toISOString() : null })
      .eq("id", taskId).eq("version", version).select("id").maybeSingle();
    if (error) return geh("fehler");
    if (!geaendert) return geh("konflikt");
    return geh(status === "DONE" ? "erledigt" : "geaendert");
  }

  return geh("fehler");
}
