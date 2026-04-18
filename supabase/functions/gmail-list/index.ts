// Lists recent Gmail messages via the connector gateway.
// Returns { notConnected: true } when the Gmail connector hasn't been linked yet.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/gmail";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GMAIL_API_KEY = Deno.env.get("GMAIL_API_KEY");

  if (!GMAIL_API_KEY || !LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ notConnected: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // List 20 most recent message IDs from inbox
    const listResp = await fetch(
      `${GATEWAY_URL}/gmail/v1/users/me/messages?maxResults=20&labelIds=INBOX`,
      {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GMAIL_API_KEY,
        },
      },
    );

    if (!listResp.ok) {
      const text = await listResp.text();
      console.error("Gmail list error:", listResp.status, text);
      return new Response(
        JSON.stringify({ error: `Gmail API ${listResp.status}: ${text.slice(0, 200)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const list = await listResp.json();
    const ids: string[] = (list.messages || []).map((m: any) => m.id);

    // Fetch metadata for each message in parallel
    const metas = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `${GATEWAY_URL}/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": GMAIL_API_KEY,
            },
          },
        );
        if (!r.ok) return null;
        return await r.json();
      }),
    );

    const messages = metas.filter(Boolean).map((m: any) => {
      const headers = (m.payload?.headers || []) as Array<{ name: string; value: string }>;
      const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
      return {
        id: m.id,
        threadId: m.threadId,
        snippet: m.snippet || "",
        subject: get("Subject"),
        from: get("From"),
        date: get("Date"),
        unread: (m.labelIds || []).includes("UNREAD"),
      };
    });

    return new Response(JSON.stringify({ messages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-list error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
