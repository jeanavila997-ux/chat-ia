// providers/openai.js — provedor OpenAI (e compatíveis: OpenRouter, Groq, etc.)
// Converte SSE do OpenAI para JSON-lines estilo Ollama (chunk.message.content),
// assim o front do Chat IA consome qualquer provedor com o mesmo parser.

export const id = "openai";
export const label = "OpenAI";

export async function streamChat(payload, cfg) {
  const baseUrl = cfg.baseUrl || "https://api.openai.com/v1";
  const model = payload.model || cfg.models?.[0] || "gpt-4o-mini";

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: payload.messages,
    }),
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

// Converte uma linha SSE "data: {...}" em NDJSON Ollama-style
function emit(line, controller) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return; // done final sai no flush()
  try {
    const parsed = JSON.parse(data);
    const content = parsed.choices?.[0]?.delta?.content || "";
    if (content) {
      controller.enqueue(
        Buffer.from(JSON.stringify({ message: { role: "assistant", content }, done: false }) + "\n")
      );
    }
  } catch {}
}

export async function listModels(cfg) {
  const baseUrl = cfg.baseUrl || "https://api.openai.com/v1";
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!resp.ok) return cfg.models || [];
    const data = await resp.json();
    return (data.data || []).map((m) => m.id).slice(0, 100);
  } catch {
    return cfg.models || [];
  }
}