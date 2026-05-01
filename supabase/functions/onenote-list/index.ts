// Lists recent OneNote pages across ALL notebooks/sections via the connector gateway.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_onenote";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const ONENOTE_API_KEY = Deno.env.get("MICROSOFT_ONENOTE_API_KEY");

  if (!ONENOTE_API_KEY || !LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ notConnected: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const headers = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": ONENOTE_API_KEY,
  };

  try {
    // Fetch the most recently modified pages across ALL notebooks the user has
    // access to, expanding parent notebook + section so the UI can group/label.
    // $select trims response size.
    const url =
      `${GATEWAY_URL}/me/onenote/pages` +
      `?$top=50` +
      `&$orderby=lastModifiedDateTime%20desc` +
      `&$expand=parentNotebook($select=id,displayName),parentSection($select=id,displayName)` +
      `&$select=id,title,createdDateTime,lastModifiedDateTime,links`;

    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("OneNote list error:", resp.status, text);
      return new Response(
        JSON.stringify({ error: `OneNote API ${resp.status}: ${text.slice(0, 300)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const pages = (data.value || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      createdDateTime: p.createdDateTime,
      lastModifiedDateTime: p.lastModifiedDateTime,
      links: p.links,
      notebookName: p.parentNotebook?.displayName ?? null,
      sectionName: p.parentSection?.displayName ?? null,
    }));

    return new Response(JSON.stringify({ pages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("onenote-list error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
