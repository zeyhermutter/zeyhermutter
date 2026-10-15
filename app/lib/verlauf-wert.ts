import { tag, zeitpunkt } from "~/lib/format";
import type { Beschriftungen } from "~/lib/labels";

// Ein Wert aus dem Aenderungsverlauf (audit_events.field_changes) lesbar
// gemacht (15.10.2026). Im Verlauf eines Leads stand sonst
// "converted_by — → 78203dc4-afc5-…" oder "2026-09-01T10:00:00+00:00".

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZEITPUNKT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export function verlaufWert(v: unknown, tabelle?: Beschriftungen): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (Array.isArray(v)) return v.map((x) => verlaufWert(x, tabelle)).join(", ") || "—";
  if (typeof v === "object") return "Datensatz";
  const text = String(v);
  if (tabelle && text in tabelle) return tabelle[text];
  if (KENNUNG.test(text)) return "verknüpft";
  if (ZEITPUNKT.test(text)) return zeitpunkt(text);
  if (DATUM.test(text)) return tag(text);
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}
