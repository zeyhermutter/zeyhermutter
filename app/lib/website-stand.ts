// Der Stand einer Website-Seite in Worten -- fuer die Liste der Seiten und
// den Kopf ihrer Akte im Arbeitsplatz.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stateLabel(page: any) {
  if (page.status === "PUBLISHED" && !page.has_unpublished_changes) return "Veröffentlicht";
  if (page.status === "READY") return "Version zur Freigabe bereit";
  if (page.published_version) return "Veröffentlicht · Änderungen offen";
  return "Entwurf";
}
