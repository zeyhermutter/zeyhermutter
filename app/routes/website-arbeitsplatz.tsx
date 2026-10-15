import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/website-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { stateLabel } from "~/lib/website-stand";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import "~/website-cms.css";

// Der Arbeitsplatz der Website: links die Seiten, rechts die geoeffnete
// Seite mit Entwurf, Freigabe und Versionen (13.10.2026). Die Seiten haben
// kein Archiv und keine Kennung in der Adresse, sondern ihren Schluessel
// (/crm/website/startseite) -- deshalb nicht ladeArbeitsplatz().

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "website.read");
  const { data: pages, error } = await supabase.from("website_pages")
    .select("id,page_key,path,label,status,candidate_version,published_version,has_unpublished_changes")
    .order("path");
  const zeilen = ((pages ?? []) as any[]).map((p) => ({
    schluessel: String(p.page_key).toLowerCase(),
    pfad: p.path as string,
    titel: p.label as string,
    stand: stateLabel(p),
    klasse: String(p.status).toLowerCase(),
    kontext: [p.published_version ? `auf der Website: Version ${p.published_version}` : "noch nicht veröffentlicht", p.candidate_version ? `Vorschau: Version ${p.candidate_version}` : null].filter(Boolean).join(" · "),
  }));
  return data({ zeilen, listeFehlt: Boolean(error) }, { headers: responseHeaders() });
}

export default function WebsiteArbeitsplatz() {
  const { zeilen, listeFehlt } = useLoaderData<typeof loader>();
  const { pageKey } = useParams();
  const aktiv = String(pageKey ?? "").toLowerCase();
  const akte = zeilen.find((z) => z.schluessel === aktiv) ?? null;
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.schluessel,
    pfad: `/crm/website/${z.schluessel}`,
    nummer: z.pfad,
    titel: z.titel,
    suchtext: [z.pfad, z.titel, z.stand].join(" "),
    unterzeile: <span className={`website-state ${z.klasse}`}>{z.stand}</span>,
  });
  return (
    <Arbeitsplatz
      listenName="Seiten der Website"
      einzahl="Seite"
      mehrzahl="Seiten"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={aktiv}
      suchePlatzhalter="Seite oder Pfad …"
      volleListe="/crm/website?ansicht=tabelle"
      listeFehlt={listeFehlt}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.pfad} status={<span className={`website-state ${akte.klasse}`}>{akte.stand}</span>} titel={akte.titel} kontext={akte.kontext} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
