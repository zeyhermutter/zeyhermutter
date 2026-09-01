import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/user-admin";
import { requireActiveUser, requirePermission } from "~/lib/auth.server";
import "~/user-admin.css";

type ActionResult = { error?: string };

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  DISABLED: "Inaktiv",
  INVITED: "Eingeladen",
  LOCKED: "Gesperrt",
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function dbError(message?: string) {
  const value = message ?? "";
  if (value.includes("CONCURRENT_UPDATE")) return { message: "Der Benutzer wurde zwischenzeitlich geändert. Bitte neu laden.", status: 409 };
  if (value.includes("SELF_")) return { message: "Eigene Status- oder Rollenänderungen sind in diesem Bereich aus Sicherheitsgründen gesperrt.", status: 403 };
  if (value.includes("REQUIRED") || value.includes("ADMIN_ROLE_REQUIRES_ADMIN_ACTOR")) return { message: "Für diese Änderung fehlt die erforderliche Berechtigung.", status: 403 };
  return { message: "Die Benutzerverwaltung konnte die Änderung nicht speichern.", status: 400 };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, userId, profile } = await requirePermission(request, context.cloudflare.env, "user.read");
  const [profilesResult, rolesResult, permissionsResult, rolePermissionsResult, userRolesResult, userManageResult, permissionManageResult] = await Promise.all([
    supabase.from("profiles").select("user_id,display_name,first_name,last_name,status,version,created_at,updated_at").order("display_name"),
    supabase.from("roles").select("id,key,name,description,is_system,created_at").order("name"),
    supabase.from("permissions").select("id,key,description").order("key"),
    supabase.from("role_permissions").select("role_id,permission_id"),
    supabase.from("user_roles").select("user_id,role_id,assigned_at,assigned_by,revoked_at").is("revoked_at", null),
    supabase.rpc("current_user_has_permission", { p_permission: "user.manage" }),
    supabase.rpc("current_user_has_permission", { p_permission: "permission.manage" }),
  ]);

  if (profilesResult.error || rolesResult.error || permissionsResult.error || rolePermissionsResult.error || userRolesResult.error) {
    throw new Response("Benutzer- und Rolleninformationen konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });
  }

  const activeRoleIds = (userRolesResult.data ?? []).filter((row: any) => row.user_id === userId).map((row: any) => row.role_id);
  const actorIsAdmin = (rolesResult.data ?? []).some((role: any) => role.key === "admin" && activeRoleIds.includes(role.id));

  return data({
    users: profilesResult.data ?? [],
    roles: rolesResult.data ?? [],
    permissions: permissionsResult.data ?? [],
    rolePermissions: rolePermissionsResult.data ?? [],
    userRoles: userRolesResult.data ?? [],
    canManageUsers: userManageResult.data === true,
    canManagePermissions: permissionManageResult.data === true,
    actorIsAdmin,
    currentUserId: userId,
    profile,
  }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = text(formData, "_intent");
  const targetUserId = text(formData, "target_user_id");
  const expectedVersion = Number(text(formData, "expected_version"));

  if (!targetUserId || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return data<ActionResult>({ error: "Ungültige Verwaltungsanfrage." }, { status: 400, headers: responseHeaders() });
  }

  if (intent === "status") {
    const nextStatus = text(formData, "next_status");
    if (!new Set(["ACTIVE", "DISABLED"]).has(nextStatus)) {
      return data<ActionResult>({ error: "Ungültiger Benutzerstatus." }, { status: 400, headers: responseHeaders() });
    }
    const { error } = await supabase.rpc("manage_profile_status", {
      p_target_user_id: targetUserId,
      p_status: nextStatus,
      p_expected_version: expectedVersion,
    });
    if (error) {
      const mapped = dbError(error.message);
      return data<ActionResult>({ error: mapped.message }, { status: mapped.status, headers: responseHeaders() });
    }
    return redirect("/crm/users", { headers: responseHeaders() });
  }

  if (intent === "role") {
    const roleId = text(formData, "role_id");
    const operation = text(formData, "operation");
    if (!roleId || !new Set(["assign", "revoke"]).has(operation)) {
      return data<ActionResult>({ error: "Ungültige Rollenänderung." }, { status: 400, headers: responseHeaders() });
    }
    const { error } = await supabase.rpc("manage_user_role", {
      p_target_user_id: targetUserId,
      p_role_id: roleId,
      p_assign: operation === "assign",
      p_expected_profile_version: expectedVersion,
    });
    if (error) {
      const mapped = dbError(error.message);
      return data<ActionResult>({ error: mapped.message }, { status: mapped.status, headers: responseHeaders() });
    }
    return redirect("/crm/users", { headers: responseHeaders() });
  }

  return data<ActionResult>({ error: "Unbekannte Verwaltungsaktion." }, { status: 400, headers: responseHeaders() });
}

export default function UserAdmin() {
  const { users, roles, permissions, rolePermissions, userRoles, canManageUsers, canManagePermissions, actorIsAdmin, currentUserId, profile } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const roleMap = new Map(roles.map((role: any) => [role.id, role]));
  const permissionMap = new Map(permissions.map((permission: any) => [permission.id, permission]));
  const userRoleIds = new Map<string, Set<string>>();
  for (const row of userRoles as any[]) {
    const set = userRoleIds.get(row.user_id) ?? new Set<string>();
    set.add(row.role_id);
    userRoleIds.set(row.user_id, set);
  }
  const activeUsers = users.filter((user: any) => user.status === "ACTIVE").length;

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to="/crm">← CRM</Link>
          <p className="eyebrow">Verwaltung · Sicherheit</p>
          <h1 className="editor-title">Benutzer, Rollen & Berechtigungen</h1>
        </div>
        <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>

      <div className="user-admin-page">
        {result?.error ? <div className="form-error">{result.error}</div> : null}

        <section className="user-admin-summary">
          <article className="data-card"><span>Benutzer</span><strong>{users.length}</strong><small>{activeUsers} aktiv</small></article>
          <article className="data-card"><span>Rollen</span><strong>{roles.length}</strong><small>bestehendes Rollenmodell</small></article>
          <article className="data-card"><span>Berechtigungen</span><strong>{permissions.length}</strong><small>zentral vergeben</small></article>
        </section>

        <section className="data-card user-admin-notice">
          <div><p className="eyebrow">Sicherheitsmodell</p><h2>Verwaltung bleibt getrennt</h2></div>
          <p>Benutzerstatus erfordert <code>user.manage</code>. Rollenzuweisungen erfordern <code>permission.manage</code>. Eigene Status- und Rollenänderungen sind serverseitig gesperrt; Rollenrechte selbst bleiben in dieser Oberfläche bewusst schreibgeschützt.</p>
        </section>

        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Benutzerübersicht</p><h2>Konten und Rollen</h2></div><span className="subtle">{users.length}</span></div>
          <div className="user-admin-list">
            {users.map((user: any) => {
              const activeRoles = userRoleIds.get(user.user_id) ?? new Set<string>();
              const isSelf = user.user_id === currentUserId;
              return (
                <article className="user-admin-user" key={user.user_id}>
                  <div className="user-admin-user-head">
                    <div><strong>{user.display_name}{isSelf ? " · Sie" : ""}</strong><small>{user.first_name || user.last_name ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "Kein zusätzlicher Anzeigename"}</small></div>
                    <span className={`user-status ${String(user.status).toLowerCase()}`}>{STATUS_LABELS[user.status] ?? user.status}</span>
                  </div>

                  <div className="user-role-chips">
                    {Array.from(activeRoles).map((roleId) => <span className="user-role-chip" key={roleId}>{(roleMap.get(roleId) as any)?.name ?? "Rolle"}</span>)}
                    {activeRoles.size === 0 ? <span className="subtle">Keine aktive Rolle</span> : null}
                  </div>

                  <div className="user-admin-actions">
                    <div>
                      <span className="user-admin-action-label">Zugangsstatus</span>
                      {isSelf ? <small>Eigene Statusänderung gesperrt.</small> : user.status === "LOCKED" ? <small>Gesperrte Konten werden hier nicht automatisch entsperrt.</small> : canManageUsers ? (
                        <Form method="post">
                          <input type="hidden" name="_intent" value="status" />
                          <input type="hidden" name="target_user_id" value={user.user_id} />
                          <input type="hidden" name="expected_version" value={user.version} />
                          <input type="hidden" name="next_status" value={user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                          <button className="secondary-button compact" type="submit">{user.status === "ACTIVE" ? "Deaktivieren" : "Aktivieren"}</button>
                        </Form>
                      ) : <small>Nur Lesen.</small>}
                    </div>

                    <div className="user-role-admin">
                      <span className="user-admin-action-label">Rollenzuweisung</span>
                      <div className="user-role-grid">
                        {roles.map((role: any) => {
                          const assigned = activeRoles.has(role.id);
                          const adminProtected = role.key === "admin" && !actorIsAdmin;
                          return (
                            <div className="user-role-row" key={role.id}>
                              <span><strong>{role.name}</strong><small>{role.description ?? role.key}</small></span>
                              {isSelf ? <small>Selbständerung gesperrt</small> : canManagePermissions && !adminProtected ? (
                                <Form method="post">
                                  <input type="hidden" name="_intent" value="role" />
                                  <input type="hidden" name="target_user_id" value={user.user_id} />
                                  <input type="hidden" name="expected_version" value={user.version} />
                                  <input type="hidden" name="role_id" value={role.id} />
                                  <input type="hidden" name="operation" value={assigned ? "revoke" : "assign"} />
                                  <button className="text-button" type="submit">{assigned ? "Entfernen" : "Zuweisen"}</button>
                                </Form>
                              ) : <small>{assigned ? "Zugewiesen" : adminProtected ? "Nur Administrator" : "Nicht zugewiesen"}</small>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Rechtematrix</p><h2>Berechtigungen je Rolle</h2></div><Link className="subtle-link" to="/crm/history">Audit-Historie öffnen →</Link></div>
          <div className="role-permission-grid">
            {roles.map((role: any) => {
              const rolePermissionIds = rolePermissions.filter((row: any) => row.role_id === role.id).map((row: any) => row.permission_id);
              const rolePermissionRows = rolePermissionIds.map((id: string) => permissionMap.get(id)).filter(Boolean) as any[];
              return (
                <article className="role-permission-card" key={role.id}>
                  <div><strong>{role.name}</strong><small>{role.description ?? role.key}</small></div>
                  <span className="subtle">{rolePermissionRows.length} Berechtigungen</span>
                  <div className="permission-list">
                    {rolePermissionRows.map((permission: any) => <span title={permission.description ?? permission.key} key={permission.id}>{permission.key}</span>)}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
