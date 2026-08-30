import { data } from "react-router";
import type { Route } from "./+types/api-geocode-address";
import { requirePermission } from "~/lib/auth.server";
import { geocodePropertyAddress } from "~/lib/geocoding.server";

function text(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.write");
  const fd = await request.formData();
  const street = text(fd, "street");
  const houseNumber = text(fd, "house_number");
  const postalCode = text(fd, "postal_code");
  const city = text(fd, "city");
  const district = text(fd, "district") || null;
  const country = (text(fd, "country") || "DE").toUpperCase();

  if (!street || !houseNumber || !postalCode || !city) {
    return data({ coordinates: null, error: "Adresse ist unvollständig." }, { status: 400, headers: responseHeaders() });
  }

  try {
    const coordinates = await geocodePropertyAddress(supabase, {
      street,
      houseNumber,
      postalCode,
      city,
      district,
      country,
    });
    return data({ coordinates }, { headers: responseHeaders() });
  } catch {
    return data({ coordinates: null, error: "Koordinaten konnten aktuell nicht ermittelt werden." }, { status: 503, headers: responseHeaders() });
  }
}
