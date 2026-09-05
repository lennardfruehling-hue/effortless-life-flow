import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BROWSE_TOOLS, runBrowseTool } from "../_shared/browsing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Basic abuse protection: cap request body size before parsing
    const contentLength = Number(req.headers.get("content-length") || "0");
    const MAX_BYTES = 12 * 1024 * 1024; // 12MB to allow image attachments
    if (contentLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const systemPrompt = typeof body?.systemPrompt === "string" ? body.systemPrompt : "";

    // Validate shape & caps to prevent prompt-injection / credit abuse
    const MAX_MESSAGES = 40;
    const MAX_MSG_CHARS = 8000;
    const MAX_SYSTEM_CHARS = 12000;
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({ error: "Invalid message count" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (systemPrompt.length > MAX_SYSTEM_CHARS) {
      return new Response(JSON.stringify({ error: "System prompt too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB per image data URL
    for (const m of messages) {
      if (
        !m || typeof m !== "object" ||
        (m.role !== "user" && m.role !== "assistant" && m.role !== "system")
      ) {
        return new Response(JSON.stringify({ error: "Invalid message format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof m.content === "string") {
        if (m.content.length > MAX_MSG_CHARS) {
          return new Response(JSON.stringify({ error: "Message too long" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (Array.isArray(m.content)) {
        // Multimodal content: validate each part
        for (const part of m.content) {
          if (!part || typeof part !== "object") {
            return new Response(JSON.stringify({ error: "Invalid content part" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (part.type === "text") {
            if (typeof part.text !== "string" || part.text.length > MAX_MSG_CHARS) {
              return new Response(JSON.stringify({ error: "Invalid text part" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } else if (part.type === "image_url") {
            const url = part.image_url?.url;
            if (typeof url !== "string" || url.length > MAX_IMAGE_BYTES) {
              return new Response(JSON.stringify({ error: "Invalid image part" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } else {
            return new Response(JSON.stringify({ error: "Unknown content part type" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } else {
        return new Response(JSON.stringify({ error: "Invalid message content" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const BROWSE_HINT = `

## Live web access
You have live internet access through the tools "web_search" (search the web), "open_url" (read a page) and "get_weather" (current weather + 3-day forecast for a place).
Use them whenever the user asks about current facts, prices, news, weather, opening hours, products, places or documentation. Never claim you cannot browse. Cite the source URL when you used one.`;

    const convo: any[] = [
      { role: "system", content: `${systemPrompt}${BROWSE_HINT}` },
      ...messages,
    ];

    const callModel = async (withTools: boolean) => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: convo,
          ...(withTools ? { tools: BROWSE_TOOLS, tool_choice: "auto" } : {}),
        }),
      });
    };

    let response = await callModel(true);
    let data: any = null;

    for (let step = 0; step < 4; step++) {
      if (!response.ok) break;
      data = await response.json();
      const msg = data?.choices?.[0]?.message;
      const calls = msg?.tool_calls;
      if (!Array.isArray(calls) || calls.length === 0) break;

      convo.push(msg);
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call?.function?.arguments || "{}"); } catch {}
        const result = await runBrowseTool(call?.function?.name, args);
        convo.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      response = await callModel(step < 2);
    }

    if (!data) data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("serpent-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
