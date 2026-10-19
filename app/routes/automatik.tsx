import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/automatik";
import { requireActiveUser } from "~/lib/auth.server";
import { zeitpunkt } from "~/lib/format";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
// Verwaltung > Automatik (P2-4, 19.10.2026).
//
// Jeden Morgen legt ein Lauf in der Datenbank Aufgaben und Benachrichtigungen
// an (Supabase Cron, app_private.automatik_lauf). Er verschickt nichts,
// aendert keinen Status und entfernt nichts. Jede Regel loest fuer denselben
// Anlass nur einmal aus.
//
// Diese Seite zeigt die Regeln als Saetze, schaltet sie ein und aus und
// zeigt die letzten Laeufe -- auch, wenn eine Regel gescheitert ist. "Jetzt
// ausfuehren" startet denselben Lauf von Hand.

type Regel = { key: string; title: string; description: string; active: boolean; sort_order: number; updated_at: string };
type Lauf = { id: string; started_at: string; finished_at: string | null; trigger: string; result: Record<string, number>; errors: { regel: string; fehler: string }[] };
type Ergebnis = { ok?: string; fehler?: string };

const ZEITPLAN = "täglich um 06:30 Uhr (Sommerzeit) bzw. 05:30 Uhr (Winterzeit)";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const [regelnRes, laeufeRes, darfRes] = await Promise.all([
    supabase.from("automation_rules").select("key,title,description,active,sort_order,updated_at").order("sort_order"),
    supabase.from("automation_runs").select("id,started_at,finished_at,trigger,result,errors").order("started_at", { ascending: false }).limit(14),
    supabase.rpc("current_user_has_permission", { p_permission: "settings.manage" }),
  ]);
  if (regelnRes.error) throw new Response("Die Regeln konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });
  return data({
    regeln: (regelnRes.data ?? []) as Regel[],
    laeufe: laeufeRes.error ? null : ((laeufeRes.data ?? []) as Lauf[]),
    darfPflegen: darfRes.data === true,
  }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const fd = await request.formData();
  const absicht = String(fd.get("_intent") ?? "");
  const antwort = (e: Ergebnis, status = 200) => data<Ergebnis>(e, { status, headers: responseHeaders() });

  if (absicht === "schalten") {
    const key = String(fd.get("key") ?? "");
    const aktiv = fd.get("aktiv") === "1";
    const { data: geaendert, error } = await supabase.from("automation_rules")
      .update({ active: aktiv, updated_at: new Date().toISOString(), updated_by: userId }).eq("key", key).select("key").maybeSingle();
    if (error || !geaendert) return antwort({ fehler: "Die Regel konnte nicht umgeschaltet werden (fehlendes Recht?)." }, 400);
    return antwort({ ok: aktiv ? "Regel eingeschaltet." : "Regel ausgeschaltet. Sie läuft ab dem nächsten Lauf nicht mehr." });
  }

  if (absicht === "jetzt") {
    const { data: lauf, error } = await supabase.rpc("run_automation_now");
    if (error) return antwort({ fehler: /PERMISSION/.test(error.message) ? "Für den Lauf von Hand fehlt das Recht." : "Der Lauf ist fehlgeschlagen." }, 400);
    const ergebnis = (lauf as any)?.ergebnis ?? {};
    const summe = Object.values(ergebnis as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0);
    const fehler = ((lauf as any)?.fehler ?? []) as unknown[];
    return antwort({ ok: `Lauf beendet: ${summe === 0 ? "nichts Neues" : `${summe} neue ${summe === 1 ? "Aufgabe oder Benachrichtigung" : "Aufgaben oder Benachrichtigungen"}`}${fehler.length ? `, ${fehler.length} Regel(n) mit Fehler – siehe unten` : ""}.` });
  }

  return antwort({ fehler: "Unbekannte Aktion." }, 400);
}

export default function Automatik() {
  const { regeln, laeufe, darfPflegen } = useLoaderData<typeof loader>();
  const ergebnis = useActionData<typeof action>() as Ergebnis | undefined;
  const nav = useNavigation();
  const titel = Object.fromEntries(regeln.map((r) => [r.key, r.title]));
  const letzter = laeufe?.[0] ?? null;

  return (
    <main className="editor-shell programm-liste"><ListenUeberschrift/>
      <div className="programm-liste-werkzeuge">
        <p className="programm-erklaerung">
          Jeden Morgen ({ZEITPLAN}) legt das CRM nach diesen Regeln Aufgaben und Benachrichtigungen an.
          Es verschickt nichts, ändert keinen Status und entfernt nichts. Jede Regel meldet denselben Anlass nur einmal.
        </p>
        {darfPflegen ? (
          <Form method="post" className="programm-liste-rechts">
            <input type="hidden" name="_intent" value="jetzt" />
            <button className="secondary-button" type="submit" disabled={nav.state !== "idle"}>Jetzt ausführen</button>
          </Form>
        ) : null}
      </div>

      {ergebnis?.fehler ? <p className="form-error" role="alert">{ergebnis.fehler}</p> : null}
      {ergebnis?.ok ? <p className="form-success" role="status">{ergebnis.ok}</p> : null}

      <p className="programm-kennzahlen">
        <span><strong>{regeln.filter((r) => r.active).length}</strong> von {regeln.length} Regeln eingeschaltet</span>
        {letzter ? <span>Letzter Lauf: <strong>{zeitpunkt(letzter.started_at)}</strong> ({letzter.trigger === "HAND" ? "von Hand" : "nach Zeitplan"})</span> : <span className="leise">Noch kein Lauf</span>}
        {letzter && letzter.errors.length ? <span className="warnung"><strong>{letzter.errors.length}</strong> Regel(n) mit Fehler</span> : null}
      </p>

      <div className="programm-tabelle-rahmen">
        <table className="programm-tabelle">
          <thead><tr><th scope="col">Regel</th><th scope="col">Was passiert</th><th scope="col">Stand</th><th scope="col"><span className="sr-only">Schalten</span></th></tr></thead>
          <tbody>{regeln.map((r) => (
            <tr key={r.key}>
              <td><strong>{r.title}</strong></td>
              <td>{r.description}</td>
              <td>{r.active ? "Eingeschaltet" : <span className="warnung-text">Ausgeschaltet</span>}</td>
              <td className="rechts">{darfPflegen ? (
                <Form method="post">
                  <input type="hidden" name="_intent" value="schalten" />
                  <input type="hidden" name="key" value={r.key} />
                  <input type="hidden" name="aktiv" value={r.active ? "0" : "1"} />
                  <button className="secondary-button compact" type="submit" disabled={nav.state !== "idle"}>{r.active ? "Ausschalten" : "Einschalten"}</button>
                </Form>
              ) : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="programm-tabelle-rahmen" aria-label="Letzte Läufe">
        {laeufe === null ? <p className="programm-liste-leer">Die Läufe sieht nur, wer die Verwaltung pflegen darf.</p>
          : laeufe.length === 0 ? <p className="programm-liste-leer">Noch kein Lauf.</p> : (
          <table className="programm-tabelle">
            <thead><tr><th scope="col">Lauf</th><th scope="col">Auslöser</th><th scope="col">Neu angelegt</th><th scope="col">Fehler</th></tr></thead>
            <tbody>{laeufe.map((l) => {
              const neu = Object.entries(l.result ?? {}).filter(([, n]) => Number(n) > 0);
              return (
                <tr key={l.id}>
                  <td className="zahl">{zeitpunkt(l.started_at)}{l.finished_at ? null : <div className="warnung-text">nicht beendet</div>}</td>
                  <td>{l.trigger === "HAND" ? "von Hand" : "Zeitplan"}</td>
                  <td>{neu.length === 0 ? <span className="leise">nichts Neues</span> : neu.map(([k, n]) => <div key={k}>{titel[k] ?? k}: {n}</div>)}</td>
                  <td>{l.errors?.length ? l.errors.map((f, i) => <div key={i} className="warnung-text">{titel[f.regel] ?? f.regel}: {f.fehler}</div>) : <span className="leise">—</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </main>
  );
}
