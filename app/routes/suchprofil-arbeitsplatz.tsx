import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/suchprofil-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { euroRund, flaeche } from "~/lib/format";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Suchprofile: links die Suchprofile, rechts eines.
// Derselbe Aufbau wie Kontakte und Objekte (12.10.2026). Ein Suchprofil hat
// eine Seite, deshalb keine Reiter. Ihr Seitenkopf wiederholte Nummer,
// Titel, Status und Interessent -- das steht im Kopf darueber.

const LISTE_HOECHSTENS = 400;

/** Wie in routes/search-profiles.tsx. Nur Abweichungen vom Normalfall werden markiert. */
const STAND: Record<string, string> = { PAUSED: "Pausiert", CLOSED: "Abgeschlossen" };

type Roh = {
  id: string;
  search_profile_number: string;
  title: string | null;
  status: string;
  transaction_type: string;
  max_price: number | null;
  min_living_area: number | null;
  archived_at: string | null;
  contacts: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

const eins = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "search_profile.read");
  const spalten = "id,search_profile_number,title,status,transaction_type,max_price,min_living_area,archived_at,contacts(first_name,last_name)";
  const [listeRes, akteRes] = await Promise.all([
    supabase.from("search_profiles").select(spalten).is("archived_at", null)
      .order("updated_at", { ascending: false }).limit(LISTE_HOECHSTENS),
    supabase.from("search_profiles").select(spalten).eq("id", params.searchProfileId ?? "").maybeSingle(),
  ]);

  const alsZeile = (r: Roh) => {
    const k = eins(r.contacts);
    const art = r.transaction_type === "RENT" ? "Miete" : "Kauf";
    return {
      id: r.id,
      nummer: r.search_profile_number,
      name: k ? `${k.last_name}, ${k.first_name}` : (r.title ?? r.search_profile_number),
      titel: r.title,
      stand: r.archived_at ? "Archiviert" : STAND[r.status] ?? null,
      eckdaten: [art, r.max_price != null ? `bis ${euroRund(r.max_price)}` : null, r.min_living_area != null ? `ab ${flaeche(r.min_living_area)}` : null].filter(Boolean).join(" · "),
    };
  };
  return data({
    zeilen: ((listeRes.data ?? []) as Roh[]).map(alsZeile),
    listeFehlt: Boolean(listeRes.error),
    abgeschnitten: (listeRes.data ?? []).length >= LISTE_HOECHSTENS,
    akte: akteRes.data ? alsZeile(akteRes.data as Roh) : null,
  }, { headers: responseHeaders() });
}

export default function SuchprofilArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { searchProfileId } = useParams();

  const alsZeile = (z: { id: string; nummer: string; name: string; titel: string | null; stand: string | null; eckdaten: string }): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/search-profiles/${z.id}`,
    nummer: z.nummer,
    titel: z.name,
    suchtext: [z.nummer, z.name, z.titel, z.eckdaten, z.stand].filter(Boolean).join(" "),
    unterzeile: <>
      {z.stand ? <span className="status-pill">{z.stand}</span> : null}
      <span>{z.eckdaten}</span>
    </>,
  });

  return (
    <Arbeitsplatz
      listenName="Suchprofilliste"
      einzahl="Suchprofil"
      mehrzahl="Suchprofile"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={searchProfileId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Preis …"
      neu={{ pfad: "/search-profiles/new", beschriftung: "+ Neu" }}
      volleListe="/search-profiles?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${LISTE_HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? (
        <ArbeitsplatzKopf
          nummer={akte.nummer}
          status={akte.stand ? <span className="status-pill">{akte.stand}</span> : null}
          titel={akte.titel ? `${akte.name.split(", ").reverse().join(" ")} · ${akte.titel}` : akte.name}
          kontext={akte.eckdaten}
        />
      ) : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
