// src/audio/tts-service.js — Serviço de síntese de voz Edge TTS com cache em disco e catálogo de vozes

import { tts } from "../../node_modules/edge-tts/out/index.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CACHE_DIR = join(__dirname, "..", "..", ".cache", "audio");

export const VOICES = [
  { id: "pt-BR-FranciscaNeural", name: "Francisca (pt-BR, Feminina)", lang: "pt-BR", gender: "Female" },
  { id: "pt-BR-AntonioNeural", name: "Antônio (pt-BR, Masculino)", lang: "pt-BR", gender: "Male" },
  { id: "pt-BR-ThalitaNeural", name: "Thalita (pt-BR, Jovem)", lang: "pt-BR", gender: "Female" },
  { id: "en-US-JennyNeural", name: "Jenny (en-US, Feminina)", lang: "en-US", gender: "Female" },
  { id: "en-US-GuyNeural", name: "Guy (en-US, Masculino)", lang: "en-US", gender: "Male" },
];

export async function synthesizeTTSWithCache(text, options = {}) {
  const voice = options.voice || "pt-BR-FranciscaNeural";
  if (!text || typeof text !== "string") {
    throw new Error("Texto para síntese é obrigatório.");
  }

  // Gera hash único para o par texto + voz
  const hash = createHash("md5").update(`${voice}_${text}`).digest("hex");
  const cacheFile = join(CACHE_DIR, `${hash}.mp3`);

  // 1. Tenta recuperar do cache
  try {
    const cachedBuffer = await readFile(cacheFile);
    return { buffer: cachedBuffer, cached: true, voice };
  } catch {}

  // 2. Se não estiver no cache, sintetiza via Edge-TTS
  await mkdir(CACHE_DIR, { recursive: true });
  const audioBuffer = await tts(text, { voice });

  // 3. Salva no cache em segundo plano
  writeFile(cacheFile, audioBuffer).catch(() => {});

  return { buffer: audioBuffer, cached: false, voice };
}
