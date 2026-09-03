// src/tools/web-fetch.js — Ferramenta para baixar e extrair texto de páginas da web

export const name = "web_fetch";
export const description = "Acessa uma URL e extrai o conteúdo textual legível da página.";
export const schema = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "Endereço web completo (ex: https://exemplo.com/artigo)",
    },
    maxLength: {
      type: "number",
      description: "Tamanho máximo de caracteres a extrair (padrão 4000)",
    },
  },
  required: ["url"],
};

export async function run({ url, maxLength = 4000 }) {
  if (!url || !url.startsWith("http")) {
    return { ok: false, error: "URL inválida ou ausente (deve começar com http:// ou https://)" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
    }

    const html = await resp.text();
    let text = extractText(html);

    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + "\n\n...[Conteúdo truncado para manter o limite de contexto]";
    }

    return {
      ok: true,
      url,
      length: text.length,
      content: text,
    };
  } catch (err) {
    return { ok: false, error: `Erro ao acessar URL: ${err.message}` };
  }
}

function extractText(html) {
  // Remove scripts, estilos, comentários e tags de navegação/rodapé
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");

  // Quebras de parágrafos e listas
  clean = clean
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

  // Normaliza espaços em branco e quebras de linha excessivas
  return clean
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}
