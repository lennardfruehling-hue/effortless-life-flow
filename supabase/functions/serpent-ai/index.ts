import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BROWSE_TOOLS, runBrowseTool } from "../_shared/browsing.ts";
import { callAnthropic, joinText, toAnthropicConversation, toAnthropicTools } from "../_shared/anthropic.ts";

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const BROWSE_HINT = `

## Live web access
You have live internet access through the tools "web_search" (search the web), "open_url" (read a page) and "get_weather" (current weather + 3-day forecast for a place).
Use them whenever the user asks about current facts, prices, news, weather, opening hours, products, places or documentation. Never claim you cannot browse. Cite the source URL when you used one.`;

    const { system, messages: convo } = toAnthropicConversation(`${systemPrompt}${BROWSE_HINT}`, messages);
    const tools = toAnthropicTools(BROWSE_TOOLS);

    const callModel = (withTools: boolean) =>
      callAnthropic(ANTHROPIC_API_KEY, { system, messages: convo, ...(withTools ? { tools } : {}) });

    let response = await callModel(true);
    let data: any = null;

    for (let step = 0; step < 4; step++) {
      if (!response.ok) break;
      data = await response.json();
      const uses = Array.isArray(data?.content) ? data.content.filter((b: any) => b?.type === "tool_use") : [];
      if (data?.stop_reason !== "tool_use" || uses.length === 0) break;

      convo.push({ role: "assistant", content: data.content });
      const results: any[] = [];
      for (const u of uses) {
        const result = await runBrowseTool(u.name, u.input ?? {});
        results.push({ type: "tool_result", tool_use_id: u.id, content: String(result) });
      }
      convo.push({ role: "user", content: results });
      response = await callModel(true);
      data = null;
    }

    if (!response.ok && !data) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 529) {
        return new Response(JSON.stringify({ error: "The assistant is busy right now — please try again in a moment." }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("Anthropic API error:", response.status, text);
      throw new Error(`AI service error: ${response.status}`);
    }

    if (!data) data = await response.json();
    const content = joinText(data);
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
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
