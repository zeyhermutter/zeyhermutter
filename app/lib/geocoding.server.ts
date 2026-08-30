import type { SupabaseClient } from "@supabase/supabase-js";

export type PropertyAddressInput = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  district?: string | null;
  country?: string | null;
};

export type GeocodedCoordinates = {
  latitude: number;
  longitude: number;
  source: "cache" | "nominatim";
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const APP_URL = "https://zeyhermutter.playsony.workers.dev/";
const APP_USER_AGENT = `ZeyherMutterOS/0.1 (+${APP_URL})`;

function wait(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function geocodePropertyAddress(
  supabase: SupabaseClient,
  address: PropertyAddressInput,
): Promise<GeocodedCoordinates | null> {
  const country = (address.country || "DE").toUpperCase();

  let cachedQuery = supabase
    .from("property_addresses")
    .select("latitude, longitude")
    .eq("street", address.street)
    .eq("house_number", address.houseNumber)
    .eq("postal_code", address.postalCode)
    .eq("city", address.city)
    .eq("country", country)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(1);

  const { data: cached, error: cacheError } = await cachedQuery.maybeSingle();
  if (!cacheError && cached?.latitude != null && cached?.longitude != null) {
    return {
      latitude: Number(cached.latitude),
      longitude: Number(cached.longitude),
      source: "cache",
    };
  }

  const { data: waitMs, error: rateLimitError } = await supabase.rpc("reserve_nominatim_slot");
  if (rateLimitError) throw new Error("Geokodierungs-Slot konnte nicht reserviert werden.");
  await wait(Number(waitMs ?? 0));

  const params = new URLSearchParams({
    street: `${address.houseNumber} ${address.street}`,
    postalcode: address.postalCode,
    city: address.city,
    countrycodes: country.toLowerCase(),
    format: "jsonv2",
    limit: "1",
    layer: "address",
    addressdetails: "0",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "de",
      Referer: APP_URL,
      "User-Agent": APP_USER_AGENT,
    },
  });

  if (!response.ok) throw new Error(`Nominatim antwortete mit HTTP ${response.status}.`);

  const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const first = results[0];
  if (!first?.lat || !first?.lon) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude, source: "nominatim" };
}
