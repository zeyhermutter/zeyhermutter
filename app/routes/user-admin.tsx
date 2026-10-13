import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/user-admin";
import { Aufklapper } from "~/components/aufklapper";
import "~/programm-liste.css";
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

  // Programmansicht (13.10.2026): eine Matrix -- Benutzer in den Zeilen,
  // Rollen in den Spalten, in jeder Zelle der Schalter. Vorher je Benutzer
  // eine Karte mit allen Rollen untereinander; bei zwei Benutzern und fuenf
  // Rollen schon drei Bildschirme.
  const rollenSchalter = (user: any, role: any, assigned: boolean) => {
    const isSelf = user.user_id === currentUserId;
    const adminProtected = role.key === "admin" && !actorIsAdmin;
    if (isSelf || !canManagePermissions || adminProtected) {
      return <span className={assigned ? "rolle-zelle an" : "rolle-zelle"} title={isSelf ? "Eigene Rollen lassen sich nicht ändern." : adminProtected ? "Nur ein Administrator vergibt diese Rolle." : undefined}>{assigned ? "✓" : "–"}</span>;
    }
    return (
      <Form method="post">
        <input type="hidden" name="_intent" value="role" />
        <input type="hidden" name="target_user_id" value={user.user_id} />
        <input type="hidden" name="expected_version" value={user.version} />
        <input type="hidden" name="role_id" value={role.id} />
        <input type="hidden" name="operation" value={assigned ? "revoke" : "assign"} />
        <button className={assigned ? "rolle-schalter an" : "rolle-schalter"} type="submit" title={assigned ? `${role.name} entfernen` : `${role.name} zuweisen`} aria-pressed={assigned}>{assigned ? "✓ zugewiesen" : "zuweisen"}</button>
      </Form>
    );
  };

  return (
    <main className="editor-shell programm-liste">
      <div className="programm-liste-werkzeuge">
        <span className="programm-liste-zaehler programm-liste-zaehler-links"><strong>{users.length}</strong> Benutzer · <strong>{activeUsers}</strong> aktiv · <strong>{roles.length}</strong> Rollen · <strong>{permissions.length}</strong> Berechtigungen</span>
        <Aufklapper knopf="Wer darf was ändern?">
          <p className="programm-erklaerung">Den Zugangsstatus ändert, wer <code>user.manage</code> hat; Rollen vergibt, wer <code>permission.manage</code> hat. Eigene Status- und Rollenänderungen sind serverseitig gesperrt. Die Rechte einer Rolle selbst lassen sich hier nicht ändern.</p>
        </Aufklapper>
      </div>

      {result?.error ? <div className="form-error">{result.error}</div> : null}

      <div className="programm-tabelle-rahmen">
        <table className="programm-tabelle rollen-matrix">
          <thead><tr>
            <th>Benutzer</th><th>Zugang</th>
            {roles.map((role: any) => <th key={role.id} title={role.description ?? role.key}>{role.name}</th>)}
          </tr></thead>
          <tbody>{users.map((user: any) => {
            const activeRoles = userRoleIds.get(user.user_id) ?? new Set<string>();
            const isSelf = user.user_id === currentUserId;
            return <tr key={user.user_id}>
              <td><strong>{user.display_name}{isSelf ? " · Sie" : ""}</strong>{user.first_name || user.last_name ? <div className="leise">{[user.first_name, user.last_name].filter(Boolean).join(" ")}</div> : null}</td>
              <td>
                <span className={`status-pill ${user.status === "ACTIVE" ? "status-sold" : user.status === "LOCKED" ? "status-lost" : "status-archived"}`}>{STATUS_LABELS[user.status] ?? user.status}</span>
                {!isSelf && user.status !== "LOCKED" && canManageUsers ? (
                  <Form method="post" className="rolle-status">
                    <input type="hidden" name="_intent" value="status" />
                    <input type="hidden" name="target_user_id" value={user.user_id} />
                    <input type="hidden" name="expected_version" value={user.version} />
                    <input type="hidden" name="next_status" value={user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                    <button className="programm-tabelle-verweis leise-verweis" type="submit">{user.status === "ACTIVE" ? "deaktivieren" : "aktivieren"}</button>
                  </Form>
                ) : null}
              </td>
              {roles.map((role: any) => <td key={role.id}>{rollenSchalter(user, role, activeRoles.has(role.id))}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>

      <section className="programm-abschnitt">
        <Aufklapper knopf="Berechtigungen je Rolle anzeigen"><section className="data-card">
          <div className="card-head"><div><h2>Berechtigungen je Rolle</h2></div><Link className="subtle-link" to="/crm/history">Systemhistorie öffnen →</Link></div>
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
        </section></Aufklapper>
      </section>
    </main>
  );
}
