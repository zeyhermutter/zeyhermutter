import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export async function loader() {
  return redirect("/login");
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context.cloudflare.env,
  );

  await supabase.auth.signOut();
  return redirect("/login", { headers: responseHeaders() });
}

export default function LogoutRoute() {
  return null;
}
