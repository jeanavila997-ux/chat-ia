// providers/deepseek.js — provedor DeepSeek (deepseek-chat V3 e deepseek-reasoner R1)
// Suporta reasoning_content (tokens de raciocínio R1) e content normal, convertendo para NDJSON estilo Ollama.

export const id = "deepseek";
export const label = "DeepSeek";

export async function streamChat(payload, cfg) {
  const baseUrl = cfg.baseUrl || "https://api.deepseek.com";
  const model = payload.model || cfg.models?.[0] || "deepseek-chat";

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

  let inThinking = false;

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
      if (inThinking) {
        controller.enqueue(
          Buffer.from(JSON.stringify({ message: { role: "assistant", content: "\n</think>\n\n" }, done: false }) + "\n")
        );
      }
      controller.enqueue(Buffer.from(JSON.stringify({ done: true }) + "\n"));
    },
  });

  function emit(line, controller) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return;

      const reasoning = delta.reasoning_content || "";
      const content = delta.content || "";

      if (reasoning) {
        let text = "";
        if (!inThinking) {
          inThinking = true;
          text += "> 🧠 **Pensamento do Modelo (R1):**\n> ";
        }
        text += reasoning.replace(/\n/g, "\n> ");
        controller.enqueue(
          Buffer.from(JSON.stringify({ message: { role: "assistant", content: text }, done: false }) + "\n")
        );
      }

      if (content) {
        let text = "";
        if (inThinking) {
          inThinking = false;
          text += "\n\n---\n\n";
        }
        text += content;
        controller.enqueue(
          Buffer.from(JSON.stringify({ message: { role: "assistant", content: text }, done: false }) + "\n")
        );
      }
    } catch {}
  }

  return new Response(resp.body.pipeThrough(transform), {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

export async function listModels(cfg) {
  const baseUrl = cfg.baseUrl || "https://api.deepseek.com";
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!resp.ok) return cfg.models || [];
    const data = await resp.json();
    return (data.data || []).map((m) => m.id);
  } catch {
    return cfg.models || [];
  }
}
