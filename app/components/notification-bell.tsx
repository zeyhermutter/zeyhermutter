import { Form, Link } from "react-router";
import "~/notification-bell.css";

export type HeaderNotification = { id:string;type:string;title:string;message:string|null;entity_type:string|null;entity_id:string|null;created_at:string;read_at:string|null };
function entityTarget(entityType:string|null,entityId:string|null) {
  if (entityType === "CONTACT" && entityId) return `/crm/contacts/${entityId}/collaboration`;
  if (entityType === "ORGANIZATION" && entityId) return `/crm/organizations/${entityId}`;
  if (entityType === "LEAD" && entityId) return `/leads/${entityId}`;
  if (entityType === "PROPERTY" && entityId) return `/properties/${entityId}`;
  if (entityType === "SEARCH_PROFILE" && entityId) return `/search-profiles/${entityId}`;
  if (entityType === "INQUIRY" && entityId) return `/inquiries/${entityId}`;
  if (entityType === "VIEWING" && entityId) return `/viewings/${entityId}`;
  if (entityType === "TASK") return "/crm/tasks";
  return "/crm";
}
function formatNotificationDate(value:string){return new Intl.DateTimeFormat("de-DE",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value));}
export function NotificationBell({notifications,unreadCount}:{notifications:HeaderNotification[];unreadCount:number}) {return <details className="notification-bell"><summary className="notification-bell-trigger" aria-label={`Benachrichtigungen${unreadCount?`, ${unreadCount} ungelesen`:""}`} title="Benachrichtigungen"><svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>{unreadCount>0?<span className="notification-bell-count">{unreadCount>99?"99+":unreadCount}</span>:null}</summary><div className="notification-bell-popover"><div className="notification-bell-head"><div><strong>Benachrichtigungen</strong><small>{unreadCount>0?`${unreadCount} ungelesen`:"Alles gelesen"}</small></div><Link to="/crm/notifications">Alle anzeigen</Link></div><div className="notification-bell-list">{notifications.length===0?<p className="notification-bell-empty">Keine Benachrichtigungen.</p>:notifications.map(notification=>{const target=entityTarget(notification.entity_type,notification.entity_id);const content=<><span className="notification-bell-item-title">{notification.read_at?null:<i aria-hidden="true"/>}<strong>{notification.title}</strong></span><span className="notification-bell-item-message">{notification.message??notification.type}</span><small>{formatNotificationDate(notification.created_at)}</small></>;if(notification.read_at)return <Link className="notification-bell-item" key={notification.id} to={target}>{content}</Link>;return <Form action="/crm/notifications" className="notification-bell-item-form" key={notification.id} method="post"><input type="hidden" name="_intent" value="read"/><input type="hidden" name="notification_id" value={notification.id}/><input type="hidden" name="redirect_to" value={target}/><button className="notification-bell-item unread" type="submit">{content}</button></Form>})}</div><Link className="notification-bell-footer" to="/crm/notifications">Alle Benachrichtigungen öffnen →</Link></div></details>}
