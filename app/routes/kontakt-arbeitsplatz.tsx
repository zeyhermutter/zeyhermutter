import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/kontakt-arbeitsplatz";
import { requireActiveUser } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { KONTAKTSTATUS, beschrifte } from "~/lib/labels";
import { Arbeitsplatz, ArbeitsplatzKopf, ArbeitsplatzReiter, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz einer Kontaktakte: links die Kontaktliste, rechts der
// Kontakt -- derselbe Aufbau wie bei den Immobilien.
//
// Die vier Seiten eines Kontakts hingen bisher nur lose zusammen: Stammdaten
// fuehrten "zurueck" zur CRM-Uebersicht, die Unterseiten "zurueck" zum
// "Arbeitsbereich", und welche Seiten es ueberhaupt gab, sah man erst, wenn
// man sie fand. Jetzt stehen alle vier als Reiter da.
//
// Die Seitenkoepfe der vier Seiten zeigen nur Nummer und Name -- beides
// steht im Kopf darueber. Sie werden im Arbeitsplatz ausgeblendet.

const LISTE_HOECHSTENS = 400;

type Roh = {
  id: string;
  contact_number: string;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  status: string;
  archived_at: string | null;
  updated_at?: string;
  contact_role_assignments?: { contact_roles: { name: string } | { name: string }[] | null }[];
};

function rollenAus(k: Roh): string[] {
  return (k.contact_role_assignments ?? [])
    .map((z) => (Array.isArray(z.contact_roles) ? z.contact_roles[0] : z.contact_roles)?.name)
    .filter((n): n is string => Boolean(n));
}

function nameAus(k: Roh) {
  // Nachname zuerst: so sortiert die Liste, und so liest man ein Adressbuch.
  return `${k.last_name}, ${[k.title, k.first_name].filter(Boolean).join(" ")}`;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const spalten = "id,contact_number,title,first_name,last_name,email,mobile,phone,status,archived_at,contact_role_assignments(contact_roles(name))";

  const [listeRes, akteRes] = await Promise.all([
    supabase.from("contacts").select(spalten).is("archived_at", null)
      .order("last_name", { ascending: true }).order("first_name", { ascending: true })
      .limit(LISTE_HOECHSTENS),
    supabase.from("contacts").select(`${spalten},updated_at`).eq("id", params.contactId ?? "").maybeSingle(),
  ]);

  const alsZeile = (k: Roh) => ({
    id: k.id,
    nummer: k.contact_number,
    name: nameAus(k),
    rollen: rollenAus(k),
    erreichbar: k.mobile ?? k.phone ?? k.email ?? null,
  });

  const akte = akteRes.data as Roh | null;
  return data({
    zeilen: ((listeRes.data ?? []) as Roh[]).map(alsZeile),
    listeFehlt: Boolean(listeRes.error),
    abgeschnitten: (listeRes.data ?? []).length >= LISTE_HOECHSTENS,
    akte: akte ? {
      ...alsZeile(akte),
      kopfName: [akte.title, akte.first_name, akte.last_name].filter(Boolean).join(" "),
      status: akte.archived_at ? "ARCHIVED" : akte.status,
      geaendert: akte.updated_at ?? null,
    } : null,
  }, { headers: responseHeaders() });
}

export default function KontaktArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { contactId } = useParams();

  const alsZeile = (z: { id: string; nummer: string; name: string; rollen: string[]; erreichbar: string | null }): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/crm/contacts/${z.id}`,
    nummer: z.nummer,
    titel: z.name,
    suchtext: [z.nummer, z.name, z.rollen.join(" "), z.erreichbar].filter(Boolean).join(" "),
    unterzeile: <>
      <span>{z.rollen.length ? z.rollen.slice(0, 2).join(" · ") : "ohne Rolle"}</span>
      {z.erreichbar ? <span className="arbeitsplatz-zeile-preis">{z.erreichbar}</span> : null}
    </>,
  });

  const basis = contactId ? `/crm/contacts/${contactId}` : "/crm/contacts";
  // Nur ein Zustand, der vom Normalfall abweicht, verdient eine Markierung.
  const abweichend = akte && akte.status !== "ACTIVE" ? beschrifte(KONTAKTSTATUS, akte.status) : null;

  return (
    <Arbeitsplatz
      listenName="Kontaktliste"
      einzahl="Kontakt"
      mehrzahl="Kontakte"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={contactId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Rolle, Telefon …"
      neu={{ pfad: "/crm/contacts/new", beschriftung: "+ Neu" }}
      volleListe="/crm/contacts?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die ersten ${LISTE_HOECHSTENS} nach Namen` : null}
      seitenkopf="ausblenden"
      kopf={akte ? (
        <ArbeitsplatzKopf
          nummer={akte.nummer}
          status={abweichend ? <span className="status-pill status-archived">{abweichend}</span> : null}
          titel={akte.kopfName}
          kontext={[akte.rollen.join(" · ") || null, akte.geaendert ? `geändert ${tag(akte.geaendert)}` : null].filter(Boolean).join(" · ")}
        />
      ) : null}
      reiter={
        <ArbeitsplatzReiter
          beschriftung="Bereiche der Kontaktakte"
          eintraege={[
            { beschriftung: "Stammdaten", pfad: basis, genau: true },
            { beschriftung: "Rollen & Aufgaben", pfad: `${basis}/relations` },
            { beschriftung: "Adressen & Firmen", pfad: `${basis}/associations` },
            { beschriftung: "Verlauf", pfad: `${basis}/collaboration` },
          ]}
        />
      }
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
