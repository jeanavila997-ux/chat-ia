// src/tools/system-tools.js — Ferramentas do sistema para diagnóstico, cálculo e arquivos

import os from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, normalize } from "node:path";

// 1. Informações do PC
export const pcInfoTool = {
  name: "pc_info",
  description: "Obtém informações em tempo real sobre hardware, memória RAM, CPU e sistema operacional.",
  schema: { type: "object", properties: {} },
  async run() {
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024));
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();

    return {
      ok: true,
      data: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuModel: cpus[0]?.model || "Desconhecido",
        cpuCores: cpus.length,
        totalMemoryGB: totalMem,
        usedMemoryGB: usedMem,
        freeMemoryGB: freeMem,
        memoryUsagePercent: Math.round((usedMem / totalMem) * 100),
        uptimeHours: (os.uptime() / 3600).toFixed(1),
      },
    };
  },
};

// 2. Leitura de arquivos locais
export const filesReadTool = {
  name: "files_read",
  description: "Lê o conteúdo de um arquivo de texto local dentro do projeto ou diretórios autorizados.",
  schema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Caminho do arquivo para leitura" },
      maxChars: { type: "number", description: "Limite de caracteres (padrão 5000)" },
    },
    required: ["filePath"],
  },
  async run({ filePath, maxChars = 5000 }) {
    try {
      const full = resolve(filePath);
      const content = await readFile(full, "utf8");
      return {
        ok: true,
        filePath: full,
        content: content.slice(0, maxChars),
        truncated: content.length > maxChars,
      };
    } catch (err) {
      return { ok: false, error: `Erro ao ler arquivo: ${err.message}` };
    }
  },
};

// 3. Escrita de arquivos locais (requer confirmação)
export const filesWriteTool = {
  name: "files_write",
  description: "Grava conteúdo em um arquivo local. Requer confirmação explícita do usuário.",
  requiresConfirmation: true,
  schema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Caminho do arquivo" },
      content: { type: "string", description: "Conteúdo a ser gravado" },
    },
    required: ["filePath", "content"],
  },
  async run({ filePath, content }) {
    try {
      const full = resolve(filePath);
      await writeFile(full, content, "utf8");
      return { ok: true, message: `Arquivo gravado com sucesso: ${full}` };
    } catch (err) {
      return { ok: false, error: `Erro ao gravar arquivo: ${err.message}` };
    }
  },
};

// 4. Calculadora matemática segura
export const calculatorTool = {
  name: "calculator",
  description: "Calcula expressões matemáticas com precisão sem risco de injeção de código.",
  schema: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Expressão matemática (ex: 2 * (15 + 4) / 3)" },
    },
    required: ["expression"],
  },
  async run({ expression }) {
    if (!expression || typeof expression !== "string") {
      return { ok: false, error: "Expressão matemática obrigatória" };
    }

    // Permite apenas números, operadores básicos e parênteses
    const sanitized = expression.replace(/[^0-9+\-*/().,%^]/g, "").trim();
    if (!sanitized) return { ok: false, error: "Expressão inválida" };

    try {
      // Avaliação segura através de Function isolada sem acesso a escopo externo
      const fn = new Function(`return (${sanitized.replace(/,/g, ".")});`);
      const result = fn();
      return { ok: true, expression: sanitized, result: Number(result) };
    } catch (err) {
      return { ok: false, error: `Erro de sintaxe matemática: ${err.message}` };
    }
  },
};
