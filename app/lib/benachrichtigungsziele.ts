// Wohin eine Benachrichtigung fuehrt -- an einer Stelle.
//
// WARUM ES DIESE DATEI GIBT
//
// Dieselbe Zuordnung stand zweimal im Code, Zeile fuer Zeile gleich: in
// app/routes/notifications.tsx und in app/components/notification-bell.tsx.
// Als am 08.10.2026 der Aufmassauftrag dazukam, schrieb die Edge-Funktion
// entity_type "MEASUREMENT_ORDER" -- und beide Kopien kannten den Wert nicht.
// Die Benachrichtigung einer Website-Anfrage fuehrte auf /crm, also nirgends
// hin. Niemandem faellt auf, dass ein Rueckfall-Ziel greift; die Seite oeffnet
// sich ja.
//
// Eine Liste, die an zwei Stellen gepflegt werden muss, wird an einer
// gepflegt. Jetzt gibt es nur noch diese.
//
// scripts/check-benachrichtigungsziele.mjs prueft bei jedem Build, dass die
// Zuordnung nur hier steht und dass jeder entity_type, den die Anwendung oder
// eine Edge-Funktion schreibt, hier ein Ziel hat.

/** Ziele, die die Kennung des Datensatzes im Weg brauchen. */
const MIT_KENNUNG: Record<string, (id: string) => string> = {
  CONTACT: (id) => `/crm/contacts/${id}/collaboration`,
  ORGANIZATION: (id) => `/crm/organizations/${id}`,
  LEAD: (id) => `/leads/${id}`,
  PROPERTY: (id) => `/properties/${id}`,
  SEARCH_PROFILE: (id) => `/search-profiles/${id}`,
  INQUIRY: (id) => `/inquiries/${id}`,
  VIEWING: (id) => `/viewings/${id}`,
  MEASUREMENT_ORDER: (id) => `/measurements/${id}`,
};

/** Ziele, die ohne Kennung auskommen, weil die Uebersicht genuegt. */
const OHNE_KENNUNG: Record<string, string> = {
  TASK: "/crm/tasks",
};

/** Alle Werte, zu denen es ein Ziel gibt -- fuer die Pruefung. */
export const BENACHRICHTIGUNGSTYPEN = [...Object.keys(MIT_KENNUNG), ...Object.keys(OHNE_KENNUNG)];

export function benachrichtigungsZiel(entityType: string | null, entityId: string | null) {
  if (entityType && entityId && MIT_KENNUNG[entityType]) return MIT_KENNUNG[entityType](entityId);
  if (entityType && OHNE_KENNUNG[entityType]) return OHNE_KENNUNG[entityType];
  return "/crm";
}
