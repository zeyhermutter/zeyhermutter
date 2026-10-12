import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/lead-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { LEADSTATUS, beschrifte } from "~/lib/labels";
import { Arbeitsplatz, ArbeitsplatzKopf, ArbeitsplatzReiter, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz eines Verkäufer-Leads: links die Leads, rechts der Lead.
// Derselbe Aufbau wie Kontakte und Objekte (12.10.2026).
//
// Zwei Reiter: der Lead selbst und sein Verkaufsstrategie-Check. Der Check
// war bisher eine eigene Seite mit "← Lead-Detail"; er gehoert zu genau
// einem Lead und steht jetzt neben ihm. Die Seitenkoepfe beider Seiten
// wiederholen nur Nummer, Name und Status -- das sagt der Kopf darueber.

const LISTE_HOECHSTENS = 400;

type Roh = {
  id: string;
  lead_number: string;
  status: string;
  follow_up_at: string | null;
  property_city: string | null;
  archived_at: string | null;
  contacts: { first_name: string; last_name: string; email: string | null; mobile: string | null; phone: string | null } | { first_name: string; last_name: string; email: string | null; mobile: string | null; phone: string | null }[] | null;
  lead_sources?: { label: string } | { label: string }[] | null;
};

const eins = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "lead.read");
  const spalten = "id,lead_number,status,follow_up_at,property_city,archived_at,contacts!inner(first_name,last_name,email,mobile,phone)";
  const [listeRes, akteRes] = await Promise.all([
    supabase.from("leads").select(spalten).is("archived_at", null)
      .order("updated_at", { ascending: false }).limit(LISTE_HOECHSTENS),
    supabase.from("leads").select(`${spalten},lead_sources(label)`).eq("id", params.leadId ?? "").maybeSingle(),
  ]);

  const alsZeile = (r: Roh) => {
    const k = eins(r.contacts);
    return {
      id: r.id,
      nummer: r.lead_number,
      name: k ? `${k.last_name}, ${k.first_name}` : r.lead_number,
      status: r.status,
      ort: r.property_city,
      erreichbar: k?.mobile ?? k?.phone ?? k?.email ?? null,
    };
  };
  const akte = akteRes.data as Roh | null;
  const kontakt = akte ? eins(akte.contacts) : null;
  return data({
    zeilen: ((listeRes.data ?? []) as Roh[]).map(alsZeile),
    listeFehlt: Boolean(listeRes.error),
    abgeschnitten: (listeRes.data ?? []).length >= LISTE_HOECHSTENS,
    akte: akte ? {
      ...alsZeile(akte),
      kopfName: kontakt ? `${kontakt.first_name} ${kontakt.last_name}` : akte.lead_number,
      archiviert: Boolean(akte.archived_at),
      quelle: eins(akte.lead_sources)?.label ?? null,
      wiedervorlage: akte.follow_up_at,
    } : null,
  }, { headers: responseHeaders() });
}

export default function LeadArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { leadId } = useParams();

  const alsZeile = (z: { id: string; nummer: string; name: string; status: string; ort: string | null; erreichbar: string | null }): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/leads/${z.id}`,
    nummer: z.nummer,
    titel: z.name,
    suchtext: [z.nummer, z.name, z.ort, z.erreichbar, beschrifte(LEADSTATUS, z.status)].filter(Boolean).join(" "),
    unterzeile: <>
      <span className="status-pill">{beschrifte(LEADSTATUS, z.status)}</span>
      <span>{z.ort ?? "Ort offen"}</span>
    </>,
  });

  const basis = `/leads/${leadId}`;
  return (
    <Arbeitsplatz
      listenName="Leadliste"
      einzahl="Lead"
      mehrzahl="Leads"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={leadId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Ort, Status …"
      neu={{ pfad: "/leads/new", beschriftung: "+ Neu" }}
      volleListe="/leads?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${LISTE_HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? (
        <ArbeitsplatzKopf
          nummer={akte.nummer}
          status={<span className="status-pill">{akte.archiviert ? "Archiviert" : beschrifte(LEADSTATUS, akte.status)}</span>}
          titel={akte.kopfName}
          kontext={[akte.quelle, akte.ort, akte.wiedervorlage ? `Wiedervorlage ${tag(akte.wiedervorlage)}` : null].filter(Boolean).join(" · ")}
        />
      ) : null}
      reiter={
        <ArbeitsplatzReiter
          beschriftung="Bereiche des Leads"
          eintraege={[
            { beschriftung: "Lead", pfad: basis, genau: true },
            { beschriftung: "Verkaufsstrategie-Check", pfad: `${basis}/sales-readiness` },
          ]}
        />
      }
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
