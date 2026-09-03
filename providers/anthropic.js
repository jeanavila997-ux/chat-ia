// providers/anthropic.js — provedor Anthropic Claude (Messages API)
// Converte SSE do Anthropic (content_block_delta) para JSON-lines estilo Ollama.

export const id = "anthropic";
export const label = "Anthropic Claude";

export async function streamChat(payload, cfg) {
  const baseUrl = cfg.baseUrl || "https://api.anthropic.com/v1";
  const model = payload.model || cfg.models?.[0] || "claude-sonnet-5";

  // Anthropic separa system do resto
  const system = payload.messages?.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
  const messages = payload.messages?.filter((m) => m.role !== "system") || [];

  const resp = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, system, messages, stream: true, max_tokens: 4096 }),
  });

  if (!resp.ok) return resp;

  const transform = new TransformStream({
    buf: "",
    transform(chunk, controller) {
      this.buf = (this.buf || "") + Buffer.from(chunk).toString("utf8");
      const lines = this.buf.split("\n");
      this.buf = lines.pop();
      for (const line of lines) emit(line, controller);
    },
    flush(controller) {
      if (this.buf) emit(this.buf, controller);
      controller.enqueue(Buffer.from(JSON.stringify({ done: true }) + "\n"));
    },
  });

  return new Response(resp.body.pipeThrough(transform), {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

// SSE Anthropic: event "content_block_delta" → data: {"delta":{"text":"..."}}
function emit(line, controller) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const data = trimmed.slice(5).trim();
  try {
    const parsed = JSON.parse(data);
    const content = parsed.delta?.text || parsed.delta?.content || "";
    if (content) {
      controller.enqueue(
        Buffer.from(JSON.stringify({ message: { role: "assistant", content }, done: false }) + "\n")
      );
    }
  } catch {}
}

export async function listModels(cfg) {
  try {
    const resp = await fetch(`${cfg.baseUrl || "https://api.anthropic.com/v1"}/models`, {
      headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!resp.ok) return cfg.models || [];
    const data = await resp.json();
    return (data.data || []).map((m) => m.id).slice(0, 100);
  } catch {
    return cfg.models || [];
  }
}