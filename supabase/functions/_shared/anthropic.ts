// Shared helpers for calling the Anthropic Messages API directly.
export const ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const ANTHROPIC_MAX_TOKENS = 4096;

/** OpenAI-style tool list -> Anthropic tool list. */
export function toAnthropicTools(tools: any[]): any[] {
  return tools.map((t) => {
    const f = t?.function ?? t;
    return { name: f.name, description: f.description, input_schema: f.parameters ?? { type: "object", properties: {} } };
  });
}

function convertPart(p: any): any | null {
  if (!p || typeof p !== "object") return null;
  if (p.type === "text") return { type: "text", text: String(p.text ?? "") };
  if (p.type === "image_url") {
    const url = String(p.image_url?.url ?? p.image_url ?? "");
    const m = url.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
    if (/^https?:\/\//i.test(url)) return { type: "image", source: { type: "url", url } };
    return null;
  }
  // Already Anthropic-shaped (tool_use / tool_result / image / text).
  return p;
}

function toBlocks(content: any): any[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (Array.isArray(content)) return content.map(convertPart).filter(Boolean);
  return [];
}

/**
 * Split out system messages and convert the rest to Anthropic messages:
 * merges consecutive same-role turns and guarantees the first turn is a user turn.
 */
export function toAnthropicConversation(baseSystem: string, messages: any[]) {
  const systemParts = [baseSystem];
  const out: { role: "user" | "assistant"; content: any }[] = [];
  for (const m of messages) {
    if (!m) continue;
    if (m.role === "system") {
      const text = typeof m.content === "string" ? m.content : toBlocks(m.content).map((b) => b.text ?? "").join("\n");
      if (text.trim()) systemParts.push(text);
      continue;
    }
    const role: "user" | "assistant" = m.role === "assistant" ? "assistant" : "user";
    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.content = [...toBlocks(prev.content), ...toBlocks(m.content)];
    } else {
      out.push({ role, content: typeof m.content === "string" ? m.content : toBlocks(m.content) });
    }
  }
  if (out.length === 0 || out[0].role !== "user") out.unshift({ role: "user", content: "(conversation start)" });
  return { system: systemParts.join("\n\n"), messages: out };
}

/** Push a message, merging into the previous turn when the role repeats. */
export function pushTurn(messages: any[], role: "user" | "assistant", content: any) {
  const prev = messages[messages.length - 1];
  if (prev && prev.role === role) prev.content = [...toBlocks(prev.content), ...toBlocks(content)];
  else messages.push({ role, content });
}

export async function callAnthropic(apiKey: string, body: Record<string, unknown>) {
  return await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: ANTHROPIC_MAX_TOKENS, ...body }),
  });
}

export function joinText(data: any): string {
  return Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
    : "";
}
