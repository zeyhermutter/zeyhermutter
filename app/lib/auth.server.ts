import { redirect } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export async function requireActiveUser(request: Request, env: Env) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, env);
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (claimsError || !userId) {
    throw redirect("/login", { headers: responseHeaders() });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "ACTIVE") {
    throw new Response("Zugriff nicht freigeschaltet.", {
      status: 403,
      headers: responseHeaders(),
    });
  }

  return { supabase, responseHeaders, userId, profile };
}
