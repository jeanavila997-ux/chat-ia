// src/tools/web-search.js — Ferramenta de busca na web
// Usa DuckDuckGo HTML (sem necessidade de API key) com fallback para Tavily se configurado.

export const name = "web_search";
export const description = "Pesquisa informações atualizadas na web utilizando DuckDuckGo ou Tavily.";
export const schema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Termo de busca na internet",
    },
    maxResults: {
      type: "number",
      description: "Número máximo de resultados (padrão 5)",
    },
  },
  required: ["query"],
};

export async function run({ query, maxResults = 5 }) {
  if (!query || typeof query !== "string") {
    return { ok: false, error: "Parâmetro 'query' obrigatório" };
  }

  // Se tiver TAVILY_API_KEY, usa Tavily (API estruturada)
  if (process.env.TAVILY_API_KEY) {
    try {
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          search_depth: "basic",
          max_results: maxResults,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const results = (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
        }));
        return { ok: true, query, provider: "tavily", results };
      }
    } catch {}
  }

  // Fallback: DuckDuckGo HTML search
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!resp.ok) {
      return { ok: false, error: `DuckDuckGo HTTP ${resp.status}` };
    }

    const html = await resp.text();
    const results = [];

    // Extrai blocos de resultado
    const resultBlocks = html.split(/class="result\s+results_links/i).slice(1);

    for (const block of resultBlocks.slice(0, maxResults)) {
      const titleMatch = block.match(/<a[^>]+class="result__snippet[^>]*>([\s\S]*?)<\/a>/i) ||
                         block.match(/class="result__snippet[^>]*>([\s\S]*?)<\//i);
      const linkMatch = block.match(/<a[^>]+class="result__url[^>]*href="([^"]+)"/i) ||
                        block.match(/<a[^>]+class="result__a[^>]*href="([^"]+)"/i);
      const headingMatch = block.match(/<a[^>]+class="result__a[^>]*>([\s\S]*?)<\/a>/i);

      const title = headingMatch ? cleanHtml(headingMatch[1]) : "Resultado";
      let link = linkMatch ? linkMatch[1] : "";
      const snippet = titleMatch ? cleanHtml(titleMatch[1]) : "";

      // Limpa redirecionamento do DuckDuckGo se presente
      if (link.includes("uddg=")) {
        try {
          const u = new URL(link, "https://duckduckgo.com");
          link = decodeURIComponent(u.searchParams.get("uddg") || link);
        } catch {}
      }

      if (snippet || link) {
        results.push({ title, url: link, snippet });
      }
    }

    return {
      ok: true,
      query,
      provider: "duckduckgo",
      results: results.length ? results : [{ title: "Nenhum resultado direto encontrado", url: "", snippet: "" }],
    };
  } catch (err) {
    return { ok: false, error: `Erro na busca: ${err.message}` };
  }
}

function cleanHtml(str) {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
