import { data, Form, Link, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/contacts";
import { requireActiveUser } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { KONTAKTSTATUS, beschrifte } from "~/lib/labels";
import "~/programm-liste.css";

// Die Kontaktliste.
//
// WARUM ES SIE GIBT
//
// Bis zum 12.10.2026 hatte das CRM keine. Kontakte standen nur auf der
// Uebersicht, die 25 zuletzt geaenderten, und sonst ueber die Suche. Eine
// Maklersoftware ist zuerst eine Adressverwaltung: Eigentuemer,
// Interessenten, Notare, Handwerker -- wer einen bestimmten sucht, will
// filtern, nicht raten. Im Bereich Adressen ist sie der erste Unterpunkt.
//
// Die Rolle (Eigentuemer, Kaufinteressent, Notar ...) steht in jeder Zeile,
// weil sie die Frage beantwortet, die man bei einem Namen zuerst hat: wer
// ist das fuer mich.

const SEITE = 50;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? "AKTIV";
  const rolle = (url.searchParams.get("rolle") ?? "").trim();
  const seite = Math.max(1, Number(url.searchParams.get("seite") ?? "1") || 1);
  const von = (seite - 1) * SEITE;

  const { data: rollen } = await supabase.from("contact_roles").select("key,name").order("name");

  // Nach Rolle filtern: erst die Kennungen der Kontakte mit dieser Rolle,
  // dann die Liste darauf beschraenken. So bleiben in jeder Zeile alle Rollen
  // sichtbar, nicht nur die gefilterte.
  let rollenFilter: string[] | null = null;
  if (rolle) {
    const { data: rolleZeile } = await supabase.from("contact_roles").select("id").eq("key", rolle).maybeSingle();
    if (rolleZeile) {
      const { data: zuordnungen } = await supabase.from("contact_role_assignments").select("contact_id").eq("role_id", rolleZeile.id).limit(5000);
      rollenFilter = (zuordnungen ?? []).map((z) => z.contact_id as string);
    } else {
      rollenFilter = [];
    }
  }

  let abfrage = supabase
    .from("contacts")
    .select("id,contact_number,salutation,title,first_name,last_name,email,mobile,phone,status,updated_at,archived_at,contact_role_assignments(contact_roles(name))", { count: "exact" })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(von, von + SEITE - 1);

  if (status === "AKTIV") abfrage = abfrage.is("archived_at", null);
  else if (status === "ARCHIV") abfrage = abfrage.not("archived_at", "is", null);
  if (q) {
    const sicher = q.replace(/[,%()]/g, " ").trim();
    if (sicher) abfrage = abfrage.or(`contact_number.ilike.%${sicher}%,first_name.ilike.%${sicher}%,last_name.ilike.%${sicher}%,email.ilike.%${sicher}%,mobile.ilike.%${sicher}%,phone.ilike.%${sicher}%`);
  }
  if (rollenFilter) abfrage = rollenFilter.length ? abfrage.in("id", rollenFilter) : abfrage.eq("id", "00000000-0000-0000-0000-000000000000");

  const { data: kontakte, count, error } = await abfrage;
  if (error) throw new Response("Die Kontaktliste konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });

  return data({
    kontakte: (kontakte ?? []).map((k: any) => ({
      id: k.id as string,
      nummer: k.contact_number as string,
      name: [k.title, k.first_name, k.last_name].filter(Boolean).join(" "),
      email: k.email as string | null,
      telefon: (k.mobile ?? k.phone) as string | null,
      status: k.status as string,
      archiviert: Boolean(k.archived_at),
      geaendert: k.updated_at as string,
      rollen: ((k.contact_role_assignments ?? []) as any[])
        .map((z) => (Array.isArray(z.contact_roles) ? z.contact_roles[0] : z.contact_roles)?.name)
        .filter(Boolean) as string[],
    })),
    gesamt: count ?? 0,
    seite,
    seiten: Math.max(1, Math.ceil((count ?? 0) / SEITE)),
    filter: { q, status, rolle },
    rollen: (rollen ?? []) as { key: string; name: string }[],
  }, { headers: responseHeaders() });
}

function seitenLink(filter: { q: string; status: string; rolle: string }, seite: number) {
  const p = new URLSearchParams();
  if (filter.q) p.set("q", filter.q);
  if (filter.status !== "AKTIV") p.set("status", filter.status);
  if (filter.rolle) p.set("rolle", filter.rolle);
  if (seite > 1) p.set("seite", String(seite));
  const s = p.toString();
  return s ? `/crm/contacts?${s}` : "/crm/contacts";
}

export default function Kontaktliste() {
  const { kontakte, gesamt, seite, seiten, filter, rollen } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const laedt = navigation.state === "loading" && navigation.location?.pathname === "/crm/contacts";

  return (
    <main className="editor-shell programm-liste">
      <Form method="get" className="programm-liste-werkzeuge" role="search">
        <label className="programm-liste-suche">
          <span className="sr-only">Kontakte suchen</span>
          <input type="search" name="q" defaultValue={filter.q} placeholder="Name, Nummer, E-Mail, Telefon …" autoComplete="off" />
        </label>
        <label>
          <span className="sr-only">Rolle</span>
          <select name="rolle" defaultValue={filter.rolle}>
            <option value="">Alle Rollen</option>
            {rollen.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Bestand</span>
          <select name="status" defaultValue={filter.status}>
            <option value="AKTIV">Aktive Kontakte</option>
            <option value="ARCHIV">Archiv</option>
            <option value="ALLE">Alle</option>
          </select>
        </label>
        {/* LiveListFilters blendet den Knopf aus und filtert beim Tippen (verzoegert) und beim Waehlen. */}
        <button className="secondary-button" type="submit">Filtern</button>
        <span className="programm-liste-zaehler" aria-live="polite">{laedt ? "lädt …" : `${gesamt} ${gesamt === 1 ? "Kontakt" : "Kontakte"}`}</span>
        <Link className="programm-liste-neu" to="/crm/contacts/new">+ Neuer Kontakt</Link>
      </Form>

      <div className="programm-tabelle-rahmen">
        <table className="programm-tabelle">
          <thead>
            <tr>
              <th scope="col">Nummer</th>
              <th scope="col">Name</th>
              <th scope="col">Rolle</th>
              <th scope="col">E-Mail</th>
              <th scope="col">Telefon</th>
              <th scope="col">Status</th>
              <th scope="col" className="rechts">Geändert</th>
            </tr>
          </thead>
          <tbody>
            {kontakte.map((k) => (
              <tr key={k.id}>
                <td className="zahl">{k.nummer}</td>
                <td><Link to={`/crm/contacts/${k.id}`}>{k.name}</Link></td>
                <td>{k.rollen.length ? k.rollen.join(" · ") : <span className="leise">—</span>}</td>
                <td>{k.email ? <a href={`mailto:${k.email}`}>{k.email}</a> : <span className="leise">—</span>}</td>
                <td className="zahl">{k.telefon ? <a href={`tel:${k.telefon.replace(/\s+/g, "")}`}>{k.telefon}</a> : <span className="leise">—</span>}</td>
                <td>{k.archiviert ? "Archiviert" : beschrifte(KONTAKTSTATUS, k.status)}</td>
                <td className="zahl rechts">{tag(k.geaendert)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {kontakte.length === 0 ? (
          <p className="programm-liste-leer">
            {filter.q || filter.rolle ? "Kein Kontakt passt zu diesem Filter." : "Noch keine Kontakte erfasst."}
          </p>
        ) : null}
      </div>

      {seiten > 1 ? (
        <nav className="programm-liste-seiten" aria-label="Seiten">
          {seite > 1 ? <Link to={seitenLink(filter, seite - 1)}>← Zurück</Link> : <span />}
          <span>Seite {seite} von {seiten}</span>
          {seite < seiten ? <Link to={seitenLink(filter, seite + 1)}>Weiter →</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
