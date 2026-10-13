import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/verkaufsprojekt-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { PHASE, PROJECT_STATUS } from "./projects";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import { standKlasse } from "~/lib/stand-ton";

// Der Arbeitsplatz der Verkaufsprojekte: links die Projekte, rechts eines.
// Derselbe Aufbau wie Kontakte und Objekte (12.10.2026). Der Seitenkopf des
// Projekts wiederholte Nummer, Eigentuemer, Phase und Status -- das steht
// jetzt im Kopf darueber.

const HOECHSTENS = 300;

type Roh = {
  id: string;
  project_number: string;
  phase: string;
  status: string;
  next_step: string | null;
  next_step_due_on: string | null;
  archived_at: string | null;
  contacts: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  properties: { property_number: string; internal_title: string } | { property_number: string; internal_title: string }[] | null;
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "project.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "sale_projects",
    spalten: "id,project_number,phase,status,next_step,next_step_due_on,archived_at,contacts(first_name,last_name),properties(property_number,internal_title)",
    sortierung: "updated_at",
    id: params.projectId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh) => {
    const k = eins(r.contacts);
    const o = eins(r.properties);
    return {
      id: r.id,
      nummer: r.project_number,
      titel: k ? `${k.last_name}, ${k.first_name}` : "Eigentümer offen",
      phasenText: PHASE[r.phase] ?? r.phase,
      stand: r.archived_at ? "Archiviert" : PROJECT_STATUS[r.status] ?? r.status,
      objekt: o ? `${o.property_number} · ${o.internal_title}` : null,
      schritt: r.next_step ? `${r.next_step}${r.next_step_due_on ? ` bis ${tag(r.next_step_due_on)}` : ""}` : null,
    };
  };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function VerkaufsprojektArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { projectId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/projects/${z.id}`,
    nummer: z.nummer,
    titel: z.titel,
    suchtext: [z.nummer, z.titel, z.phasenText, z.stand, z.objekt].filter(Boolean).join(" "),
    unterzeile: <>
      <span className={`status-pill ${standKlasse(z.phasenText)}`}>{z.phasenText}</span>
      <span>{z.objekt ?? "ohne Immobilie"}</span>
    </>,
  });
  return (
    <Arbeitsplatz
      listenName="Projektliste"
      einzahl="Projekt"
      mehrzahl="Projekte"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={projectId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Eigentümer, Nummer, Phase …"
      neu={{ pfad: "/projects?ansicht=tabelle#projekt-anlegen", beschriftung: "+ Neu" }}
      volleListe="/projects?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className={`status-pill ${standKlasse(akte.stand)}`}>{akte.stand}</span>} titel={akte.titel}
        kontext={[akte.phasenText, akte.objekt, akte.schritt ? `Nächster Schritt: ${akte.schritt}` : null].filter(Boolean).join(" · ")} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
