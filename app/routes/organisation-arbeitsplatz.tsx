import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/organisation-arbeitsplatz";
import { requireActiveUser } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { Arbeitsplatz, ArbeitsplatzKopf, ArbeitsplatzReiter, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Organisationen: links die Firmen, rechts eine.
// Derselbe Aufbau wie Kontakte und Objekte (12.10.2026).
//
// Zwei Reiter: Stammdaten und "Partner & Compliance". Der zweite war bisher
// ein Verweis oben rechts im Seitenkopf -- leicht zu uebersehen.

const LISTE_HOECHSTENS = 400;

type Roh = {
  id: string;
  organization_number: string;
  name: string;
  legal_form: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  archived_at: string | null;
  updated_at?: string;
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const spalten = "id,organization_number,name,legal_form,city,phone,email,status,archived_at";
  const [listeRes, akteRes] = await Promise.all([
    supabase.from("organizations").select(spalten).is("archived_at", null)
      .order("name", { ascending: true }).limit(LISTE_HOECHSTENS),
    supabase.from("organizations").select(`${spalten},updated_at`).eq("id", params.organizationId ?? "").maybeSingle(),
  ]);
  const alsZeile = (r: Roh) => ({
    id: r.id,
    nummer: r.organization_number,
    name: r.name,
    ort: r.city,
    erreichbar: r.phone ?? r.email ?? null,
  });
  const akte = akteRes.data as Roh | null;
  return data({
    zeilen: ((listeRes.data ?? []) as Roh[]).map(alsZeile),
    listeFehlt: Boolean(listeRes.error),
    abgeschnitten: (listeRes.data ?? []).length >= LISTE_HOECHSTENS,
    akte: akte ? {
      ...alsZeile(akte),
      rechtsform: akte.legal_form,
      archiviert: Boolean(akte.archived_at),
      geaendert: akte.updated_at ?? null,
    } : null,
  }, { headers: responseHeaders() });
}

export default function OrganisationArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { organizationId } = useParams();

  const alsZeile = (z: { id: string; nummer: string; name: string; ort: string | null; erreichbar: string | null }): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/crm/organizations/${z.id}`,
    nummer: z.nummer,
    titel: z.name,
    suchtext: [z.nummer, z.name, z.ort, z.erreichbar].filter(Boolean).join(" "),
    unterzeile: <>
      <span>{z.ort ?? "Ort offen"}</span>
      {z.erreichbar ? <span className="arbeitsplatz-zeile-preis">{z.erreichbar}</span> : null}
    </>,
  });

  const basis = `/crm/organizations/${organizationId}`;
  return (
    <Arbeitsplatz
      listenName="Organisationsliste"
      einzahl="Organisation"
      mehrzahl="Organisationen"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={organizationId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Ort, Telefon …"
      volleListe="/crm/organizations?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die ersten ${LISTE_HOECHSTENS} nach Namen` : null}
      seitenkopf="ausblenden"
      kopf={akte ? (
        <ArbeitsplatzKopf
          nummer={akte.nummer}
          status={akte.archiviert ? <span className="status-pill status-archived">Archiviert</span> : null}
          titel={akte.name}
          kontext={[akte.rechtsform, akte.ort, akte.geaendert ? `geändert ${tag(akte.geaendert)}` : null].filter(Boolean).join(" · ")}
        />
      ) : null}
      reiter={
        <ArbeitsplatzReiter
          beschriftung="Bereiche der Organisation"
          eintraege={[
            { beschriftung: "Stammdaten", pfad: basis, genau: true },
            { beschriftung: "Partner & Compliance", pfad: `${basis}/partner` },
          ]}
        />
      }
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
