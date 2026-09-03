// providers/gemini.js — provedor Google Gemini (generateContent, streamGenerateContent)
// Converte a resposta JSON-array do Gemini para JSON-lines estilo Ollama.

export const id = "gemini";
export const label = "Google Gemini";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function streamChat(payload, cfg) {
  const model = payload.model || cfg.models?.[0] || "gemini-2.5-flash";
  const key = cfg.apiKey || cfg.envKey && process.env[cfg.envKey];

  // system → systemInstruction; demais viram contents[]
  const sys = payload.messages?.find((m) => m.role === "system")?.content;
  const contents = (payload.messages || [])
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const resp = await fetch(
    `${cfg.baseUrl || BASE}/models/${model}:streamGenerateContent?alt=sse&key=${cfg.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
      }),
    }
  );

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

// SSE Gemini: data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
function emit(line, controller) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const data = trimmed.slice(5).trim();
  try {
    const parsed = JSON.parse(data);
    const content = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (content) {
      controller.enqueue(
        Buffer.from(JSON.stringify({ message: { role: "assistant", content }, done: false }) + "\n")
      );
    }
  } catch {}
}

export async function listModels(cfg) {
  try {
    const resp = await fetch(`${cfg.baseUrl || BASE}/models?key=${cfg.apiKey}`);
    if (!resp.ok) return cfg.models || [];
    const data = await resp.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .slice(0, 100);
  } catch {
    return cfg.models || [];
  }
}