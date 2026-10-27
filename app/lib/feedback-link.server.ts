// Feedback-Link in der Besichtigungsakte (27.10.2026): erzeugen,
// zurueckziehen, Antwort ins Feedback uebernehmen. Die Akte
// (routes/viewing-detail.tsx) ruft feedbackLinkAktion fuer ihre drei
// Absichten; alles andere bleibt dort.

import { neueKennung } from "~/lib/kurzkennung.server";
import { WUNSCH_KURZ, beschriftung } from "~/lib/besichtigung-feedback";

export type FeedbackLinkErgebnis = { error?: string; ok?: string; link?: string; bis?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function feedbackLinkAktion(
  intent: string,
  fd: FormData,
  supabase: any,
  userId: string,
  viewingId: string,
  request: Request,
): Promise<FeedbackLinkErgebnis | null> {
  if (intent === "feedback_link") {
    const { kennung, hash } = await neueKennung();
    const { data: zeilen, error } = await supabase.rpc("besichtigung_feedback_link_anlegen", { p_viewing_id: viewingId, p_token_hash: hash });
    if (error) {
      const m = error.message ?? "";
      return { error: /NOT_COMPLETED/.test(m) ? "Ein Feedback-Link geht erst nach einer durchgeführten Besichtigung."
        : /PERMISSION/.test(m) ? "Keine Berechtigung, Feedback-Links zu erzeugen."
        : "Der Feedback-Link konnte nicht erzeugt werden." };
    }
    const zeile = Array.isArray(zeilen) ? zeilen[0] : zeilen;
    return { ok: "Feedback-Link erzeugt.", link: `${new URL(request.url).origin}/f/${kennung}`, bis: zeile?.expires_at };
  }

  if (intent === "feedback_link_zurueckziehen") {
    const id = String(fd.get("link_id") ?? "");
    if (!UUID_RE.test(id)) return { error: "Unbekannter Link." };
    const { data: erledigt, error } = await supabase.rpc("besichtigung_feedback_link_zurueckziehen", { p_id: id });
    if (error) return { error: "Der Link konnte nicht zurückgezogen werden." };
    return erledigt ? { ok: "Feedback-Link zurückgezogen. Er öffnet nichts mehr." } : { error: "Der Link ist schon beantwortet oder zurückgezogen." };
  }

  if (intent === "feedback_uebernehmen") {
    const id = String(fd.get("link_id") ?? "");
    if (!UUID_RE.test(id)) return { error: "Unbekannter Link." };
    const { data: link } = await supabase.from("viewing_feedback_links")
      .select("id,viewing_id,submitted_at,taken_over_at,interest_level,liked,concerns,price_perception,wish,decline_reason,comment")
      .eq("id", id).eq("viewing_id", viewingId).maybeSingle();
    if (!link?.submitted_at) return { error: "Zu diesem Link liegt noch keine Rückmeldung vor." };
    const bedenken = [link.concerns, link.comment ? `Anmerkung: ${link.comment}` : null].filter(Boolean).join("\n\n") || null;
    const naechster = link.wish ? `Wunsch des Interessenten: ${beschriftung(WUNSCH_KURZ, link.wish)}` : null;
    const { data: vorhanden } = await supabase.from("viewing_feedback")
      .select("id,version,interest_level,positives,concerns,price_perception,decline_reason,next_step").eq("viewing_id", viewingId).maybeSingle();
    let fehler: any = null;
    if (vorhanden) {
      // Was der Makler schon eingetragen hat, bleibt; leere Felder werden gefuellt.
      const neu: Record<string, unknown> = {};
      if (!vorhanden.positives && link.liked) neu.positives = link.liked;
      if (!vorhanden.concerns && bedenken) neu.concerns = bedenken;
      if (!vorhanden.price_perception && link.price_perception) neu.price_perception = link.price_perception;
      if (!vorhanden.decline_reason && link.decline_reason) neu.decline_reason = link.decline_reason;
      if (!vorhanden.next_step && naechster) neu.next_step = naechster;
      if (Object.keys(neu).length) ({ error: fehler } = await supabase.from("viewing_feedback").update(neu).eq("id", vorhanden.id).eq("version", vorhanden.version));
    } else {
      ({ error: fehler } = await supabase.from("viewing_feedback").insert({
        viewing_id: viewingId, interest_level: link.interest_level, positives: link.liked, concerns: bedenken,
        price_perception: link.price_perception, decline_reason: link.decline_reason, next_step: naechster,
        created_by: userId, updated_by: userId,
      }));
    }
    if (fehler) return { error: "Die Rückmeldung konnte nicht übernommen werden." };
    await supabase.from("viewing_feedback_links").update({ taken_over_at: new Date().toISOString(), taken_over_by: userId }).eq("id", id);
    return { ok: vorhanden ? "Rückmeldung übernommen: leere Felder im Feedback sind gefüllt, Ihre Einträge bleiben." : "Rückmeldung ins Feedback übernommen." };
  }

  return null;
}
