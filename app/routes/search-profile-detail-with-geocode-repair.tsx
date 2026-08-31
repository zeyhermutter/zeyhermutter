import type { Route } from "./+types/search-profile-detail-with-geocode-repair";
import SearchProfileDetail, { action as baseAction, loader as baseLoader } from "./search-profile-detail";
import { requirePermission } from "~/lib/auth.server";
import { geocodePropertyAddress, geocodeSearchLocation } from "~/lib/geocoding.server";

export default SearchProfileDetail;
export const action = baseAction;

export async function loader(args: Route.LoaderArgs) {
  try {
    const { request, context, params } = args;
    const { supabase } = await requirePermission(request, context.cloudflare.env, "search_profile.read");
    const searchProfileId = params.searchProfileId;

    if (searchProfileId) {
      const [{ data: canSearchWrite }, { data: canPropertyWrite }] = await Promise.all([
        supabase.rpc("current_user_has_permission", { p_permission: "search_profile.write" }),
        supabase.rpc("current_user_has_permission", { p_permission: "property.write" }),
      ]);

      if (canSearchWrite === true) {
        const { data: locations } = await supabase
          .from("search_profile_locations")
          .select("id,postal_code,city,district,latitude,longitude")
          .eq("search_profile_id", searchProfileId)
          .limit(20);

        for (const location of locations ?? []) {
          if (location.latitude != null && location.longitude != null) continue;
          try {
            const coords = await geocodeSearchLocation(
              supabase,
              {
                postalCode: location.postal_code,
                city: location.city,
                district: location.district,
                country: "DE",
              },
              context.cloudflare.env.APP_BASE_URL,
            );
            if (coords) {
              await supabase
                .from("search_profile_locations")
                .update({ latitude: coords.latitude, longitude: coords.longitude })
                .eq("id", location.id);
            }
          } catch {
            // Exakte PLZ-/Ortstreffer funktionieren auch ohne Koordinaten.
          }
        }
      }

      // Ältere Demo-/Bestandsobjekte wurden teilweise vor der automatischen
      // Adress-Geokodierung angelegt. Einmaliges Backfill stellt Radius-Matching her.
      if (canPropertyWrite === true) {
        const { data: addresses } = await supabase
          .from("property_addresses")
          .select("property_id,street,house_number,postal_code,city,district,country,latitude,longitude")
          .not("street", "is", null)
          .not("house_number", "is", null)
          .not("postal_code", "is", null)
          .not("city", "is", null)
          .limit(20);

        for (const address of (addresses ?? []).filter((row) => row.latitude == null || row.longitude == null).slice(0, 10)) {
          try {
            const coords = await geocodePropertyAddress(
              supabase,
              {
                street: String(address.street),
                houseNumber: String(address.house_number),
                postalCode: String(address.postal_code),
                city: String(address.city),
                district: address.district,
                country: address.country || "DE",
              },
              context.cloudflare.env.APP_BASE_URL,
            );
            if (coords) {
              await supabase
                .from("property_addresses")
                .update({ latitude: coords.latitude, longitude: coords.longitude })
                .eq("property_id", address.property_id);
            }
          } catch {
            // Matching bleibt verfügbar; bei fehlenden Koordinaten greifen PLZ/Ort-Fallbacks.
          }
        }
      }
    }
  } catch {
    // Die Detailseite und exakte PLZ-/Ort-Matches dürfen niemals an Geocoding scheitern.
  }

  return baseLoader(args as never);
}
