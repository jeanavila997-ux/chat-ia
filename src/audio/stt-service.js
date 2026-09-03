// src/audio/stt-service.js — Serviço de transcrição de áudio (STT) via Groq Whisper ou OpenAI Whisper

export async function transcribeAudio(audioBuffer, mimeType = "audio/webm") {
  if (!audioBuffer || !audioBuffer.length) {
    return { ok: false, error: "Buffer de áudio vazio ou inválido." };
  }

  // 1. Tenta Groq Whisper (ultra-rápido ~200ms) se GROQ_API_KEY existir
  if (process.env.GROQ_API_KEY) {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-large-v3");
      formData.append("language", "pt");
      formData.append("response_format", "json");

      const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: formData,
      });

      if (resp.ok) {
        const data = await resp.json();
        return { ok: true, text: data.text || "", provider: "groq-whisper" };
      }
    } catch (err) {
      console.warn("Groq Whisper falhou:", err.message);
    }
  }

  // 2. Tenta OpenAI Whisper se OPENAI_API_KEY existir
  if (process.env.OPENAI_API_KEY) {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("language", "pt");

      const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (resp.ok) {
        const data = await resp.json();
        return { ok: true, text: data.text || "", provider: "openai-whisper" };
      }
    } catch (err) {
      console.warn("OpenAI Whisper falhou:", err.message);
    }
  }

  return {
    ok: false,
    error: "Nenhum provedor Whisper configurado (adicione GROQ_API_KEY ou OPENAI_API_KEY em env/.env). O navegador utilizará o reconhecimento nativo Web Speech.",
  };
}
