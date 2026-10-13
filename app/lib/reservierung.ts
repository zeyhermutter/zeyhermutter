// Reservierungen: Beschriftungen und Hilfen, die Liste und Akte teilen.
// Nicht .server -- die Seiten brauchen sie im Browser.

export const RESERVATION_STATUS:Record<string,string>={ACTIVE:"Aktiv",EXPIRED:"Abgelaufen",CONVERTED:"In Verkauf übergegangen",CANCELLED:"Aufgehoben"};
export const RESERVATION_STATUS_CLASS:Record<string,string>={ACTIVE:"status-marketing",EXPIRED:"status-archived",CONVERTED:"status-sold",CANCELLED:"status-lost"};

export function one(value:any){return Array.isArray(value)?value[0]:value;}
export function today(){return new Date().toISOString().slice(0,10);}
export function contactLabel(c:any){return c?`${c.last_name}, ${c.first_name}`:"";}
export function reservationExpired(row:any){return row.status==="ACTIVE"&&row.reserved_until<today();}

/** Was in Liste und Kopf als Stand steht. */
export function reservierungStand(row:any){
  if(row.archived_at) return {text:"Archiviert",klasse:"status-archived"};
  if(reservationExpired(row)) return {text:"Frist überschritten",klasse:"status-lost"};
  return {text:RESERVATION_STATUS[row.status]??row.status,klasse:RESERVATION_STATUS_CLASS[row.status]??"status-draft"};
}
