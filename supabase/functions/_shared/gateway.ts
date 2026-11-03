export function callGateway(apiKey: string, messages: any[], tools?: any[], jsonOnly = false): Promise<Response> {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3.8-flash", messages, max_tokens: 4096,
      ...(tools ? { tools } : {}), ...(jsonOnly ? { response_format: { type: "json_object" } } : {}) }),
  });
}