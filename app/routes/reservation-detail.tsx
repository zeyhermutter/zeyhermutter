import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/reservation-detail";
import { ReservierungHinweis } from "~/components/reservierung-hinweis";
import { requirePermission } from "~/lib/auth.server";
import { euroRund as money, tag as formatDate } from "~/lib/format";
import { reservierungAktion } from "~/lib/reservierung.server";
import { contactLabel, one, today } from "~/lib/reservierung";

// Die Akte einer Reservierung, rechts im Arbeitsplatz (13.10.2026).
// Vorher gab es keine: Bearbeiten und Beenden standen als aufklappbare
// Formulare je Reservierung unter der Liste.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "reservation.read");
  if (!UUID.test(params.reservationId)) throw new Response("Reservierung nicht gefunden.", { status: 404, headers: responseHeaders() });
  const { data: row, error } = await supabase.from("property_reservations")
    .select("*,properties!inner(id,property_number,internal_title),contacts!inner(id,contact_number,first_name,last_name),purchase_offers(id,offer_number,amount)")
    .eq("id", params.reservationId).maybeSingle();
  if (error) throw new Response("Reservierung konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
  if (!row) throw new Response("Reservierung nicht gefunden.", { status: 404, headers: responseHeaders() });
  const r = row as any;
  const [{ data: offers }, { data: profiles }, { data: canWrite }, { data: canArchive }, { data: canTask }] = await Promise.all([
    supabase.from("purchase_offers").select("id,offer_number,amount").eq("property_id", r.property_id).eq("contact_id", r.contact_id).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("profiles").select("user_id,display_name").order("display_name"),
    supabase.rpc("current_user_has_permission", { p_permission: "reservation.write" }),
    supabase.rpc("current_user_has_permission", { p_permission: "reservation.archive" }),
    supabase.rpc("current_user_has_permission", { p_permission: "task.write" }),
  ]);
  const verantwortlich = ((profiles ?? []) as any[]).find((p) => p.user_id === r.primary_responsible_user)?.display_name ?? null;
  return data({ row: r, offers: offers ?? [], verantwortlich, canWrite: canWrite === true, canArchive: canArchive === true, canTask: canTask === true }, { headers: responseHeaders() });
}

export async function action(args: Route.ActionArgs) {
  return reservierungAktion(args);
}

export default function ReservationDetail() {
  const { row, offers, verantwortlich, canWrite, canArchive, canTask } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const property = one(row.properties), contact = one(row.contacts), offer = one(row.purchase_offers);
  const hier = `/reservations/${row.id}`;
  const aktiv = row.status === "ACTIVE" && !row.archived_at;
  const Zurueck = () => <input type="hidden" name="zurueck" value={hier} />;

  return <main className="editor-shell">
    {result?.error ? <div className="form-error">{result.error}</div> : null}

    <div className="akte-werkzeuge">
      {canTask && aktiv ? <Form method="post"><input type="hidden" name="_intent" value="reminder" /><input type="hidden" name="reservation_id" value={row.id} /><Zurueck /><button className="secondary-button" type="submit">Wiedervorlage zum Ablauf</button></Form> : null}
      {canArchive ? <Form method="post"><input type="hidden" name="_intent" value={row.archived_at ? "restore" : "archive"} /><input type="hidden" name="reservation_id" value={row.id} /><input type="hidden" name="version" value={row.version} /><Zurueck /><button className="secondary-button" type="submit">{row.archived_at ? "Wiederherstellen" : "Archivieren"}</button></Form> : null}
    </div>

    <section className="data-card">
      <div className="card-head"><div><h2>Reservierung</h2></div></div>
      <dl className="akte-felder">
        <div><dt>Immobilie</dt><dd><Link to={`/properties/${property?.id}`}>{property?.property_number} · {property?.internal_title}</Link></dd></div>
        <div><dt>Interessent</dt><dd><Link to={`/crm/contacts/${contact?.id}`}>{contactLabel(contact)}</Link> <span className="leise">{contact?.contact_number}</span></dd></div>
        <div><dt>Zeitraum</dt><dd>{formatDate(row.reserved_from)} – {formatDate(row.reserved_until)}</dd></div>
        <div><dt>Reservierter Preis</dt><dd>{row.reserved_price != null ? money(row.reserved_price) : "—"}</dd></div>
        <div><dt>Vereinbarung</dt><dd>{row.agreement_documented ? "dokumentiert" : "nicht dokumentiert"}</dd></div>
        <div><dt>Reservierungsentgelt</dt><dd>{row.fee_amount != null ? money(row.fee_amount) : "—"}{row.fee_note ? <div className="leise">{row.fee_note}</div> : null}</dd></div>
        <div><dt>Kaufangebot</dt><dd>{offer ? <Link to={`/purchase-offers/${offer.id}`}>{offer.offer_number} · {money(offer.amount)}</Link> : "—"}</dd></div>
        <div><dt>Verantwortlich</dt><dd>{verantwortlich ?? "—"}</dd></div>
        {row.ended_on ? <div><dt>Beendet</dt><dd>{formatDate(row.ended_on)}{row.end_reason ? <div className="leise">{row.end_reason}</div> : null}</dd></div> : null}
        <div className="breit"><dt>Bedingungen</dt><dd>{row.conditions ?? "—"}</dd></div>
        <div className="breit"><dt>Interne Notizen</dt><dd>{row.internal_notes ?? "—"}</dd></div>
      </dl>
    </section>

    {canWrite && aktiv ? <section className="data-card">
      <div className="card-head"><div><h2>Bearbeiten</h2></div></div>
      <Form method="post">
        <input type="hidden" name="_intent" value="update" />
        <input type="hidden" name="reservation_id" value={row.id} />
        <input type="hidden" name="version" value={row.version} />
        <Zurueck />
        <div className="form-grid">
          <label className="form-field"><span>Reserviert bis *</span><input name="reserved_until" type="date" defaultValue={row.reserved_until} required /></label>
          <label className="form-field"><span>Reservierter Preis €</span><input name="reserved_price" inputMode="decimal" defaultValue={row.reserved_price ?? ""} /></label>
          <label className="form-field"><span>Vereinbarung dokumentiert</span><select name="agreement_documented" defaultValue={row.agreement_documented ? "yes" : "no"}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Reservierungsentgelt €</span><input name="fee_amount" inputMode="decimal" defaultValue={row.fee_amount ?? ""} /><small className="subtle">Nur erfassbar, wenn die Vereinbarung dokumentiert ist.</small></label>
          <label className="form-field"><span>Kaufangebot</span><select name="purchase_offer_id" defaultValue={row.purchase_offer_id ?? ""}><option value="">—</option>{(offers as any[]).map((o) => <option value={o.id} key={o.id}>{o.offer_number} · {money(o.amount)}</option>)}</select></label>
        </div>
        <label className="form-field full-width"><span>Bedingungen</span><textarea name="conditions" rows={3} defaultValue={row.conditions ?? ""} /></label>
        <label className="form-field full-width"><span>Notiz zum Entgelt</span><input name="fee_note" defaultValue={row.fee_note ?? ""} /></label>
        <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={2} defaultValue={row.internal_notes ?? ""} /></label>
        <div className="form-actions"><button className="primary-button" type="submit">Reservierung speichern</button></div>
      </Form>
    </section> : null}

    {canWrite && aktiv ? <section className="data-card">
      <div className="card-head"><div><h2>Reservierung beenden</h2></div></div>
      <Form method="post">
        <input type="hidden" name="_intent" value="end" />
        <input type="hidden" name="reservation_id" value={row.id} />
        <input type="hidden" name="version" value={row.version} />
        <Zurueck />
        <div className="form-grid">
          <label className="form-field"><span>Ergebnis *</span><select name="target_status" defaultValue="EXPIRED" required><option value="EXPIRED">Abgelaufen</option><option value="CONVERTED">In Verkauf übergegangen</option><option value="CANCELLED">Aufgehoben</option></select></label>
          <label className="form-field"><span>Beendet am</span><input name="ended_on" type="date" defaultValue={today()} max={today()} /></label>
        </div>
        <label className="form-field full-width"><span>Beendigungsgrund</span><textarea name="end_reason" rows={2} placeholder="Bei Aufhebung erforderlich" /></label>
        <div className="form-actions"><button className="secondary-button" type="submit">Reservierung beenden</button></div>
      </Form>
    </section> : null}

    <ReservierungHinweis />
  </main>;
}
