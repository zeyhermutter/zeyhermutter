import { createSupabaseServerClient } from "~/lib/supabase.server";
import { DEFAULT_WEBSITE_CONTENT, normalizeWebsiteContent, type WebsitePageKey } from "~/lib/website-content";

export async function loadPublicWebsitePage(request: Request, env: Env, pageKey: WebsitePageKey) {
  try {
    const { supabase } = createSupabaseServerClient(request, env);
    const { data, error } = await supabase
      .from("website_page_versions")
      .select("version_number,content_snapshot,seo_title,seo_description,published_at")
      .eq("page_key", pageKey)
      .eq("is_current_public", true)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return { content: { ...DEFAULT_WEBSITE_CONTENT[pageKey] }, seoTitle: null, seoDescription: null, version: null, publishedAt: null };
    }

    return {
      content: normalizeWebsiteContent(pageKey, data.content_snapshot),
      seoTitle: data.seo_title ?? null,
      seoDescription: data.seo_description ?? null,
      version: data.version_number,
      publishedAt: data.published_at ?? null,
    };
  } catch {
    return { content: { ...DEFAULT_WEBSITE_CONTENT[pageKey] }, seoTitle: null, seoDescription: null, version: null, publishedAt: null };
  }
}
