import { data, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/login";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context.cloudflare.env,
  );
  const { data: claims } = await supabase.auth.getClaims();

  if (claims?.claims?.sub) {
    return redirect("/crm", { headers: responseHeaders() });
  }

  return data({ ready: true }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return data(
      { error: "Bitte E-Mail-Adresse und Passwort eingeben." },
      { status: 400 },
    );
  }

  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context.cloudflare.env,
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return data(
      { error: "Anmeldung nicht möglich. Bitte Zugangsdaten prüfen." },
      { status: 400, headers: responseHeaders() },
    );
  }

  return redirect("/crm", { headers: responseHeaders() });
}

export default function Login() {
  const actionData = useActionData<typeof action>();

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <a className="brand auth-brand" href="/">
          <span className="brand-mark">ZM</span>
          <span>ZeyherMutterOS</span>
        </a>
        <p className="eyebrow">Interner Bereich · {__APP_ENV_LABEL__}</p>
        <h1 className="auth-title">Anmelden</h1>
        <p className="auth-copy">
          Zugriff nur für freigeschaltete Benutzer der ZeyherMutter-Plattform.
        </p>

        <Form method="post" className="auth-form">
          <label>
            <span>E-Mail-Adresse</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>Passwort</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {actionData?.error ? (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          ) : null}
          <button type="submit" className="primary-button">
            Anmelden
          </button>
        </Form>
      </section>
    </main>
  );
}
