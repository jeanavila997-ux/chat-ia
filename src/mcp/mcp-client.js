// src/mcp/mcp-client.js — Cliente nativo Model Context Protocol (MCP) com suporte a Stdio e HTTP/SSE

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export class MCPClient extends EventEmitter {
  constructor(name, config) {
    super();
    this.name = name;
    this.config = config; // { transport: 'stdio' | 'sse', command, args, env, url, requestTimeoutMs }
    this.requestTimeoutMs = Number(config.requestTimeoutMs) || 15000;
    this.process = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.serverInfo = null;
    this.tools = [];
    this.resources = [];
    this.buffer = "";
  }

  async connect() {
    if (this.config.transport === "stdio") {
      return this._connectStdio();
    } else if (this.config.transport === "sse" || this.config.url) {
      return this._connectHttp();
    }
    throw new Error(`Transport desconhecido ou não configurado para MCP '${this.name}'`);
  }

  _connectStdio() {
    return new Promise((resolve, reject) => {
      try {
        const { command, args = [], env = {} } = this.config;
        this.process = spawn(command, args, {
          env: { ...process.env, ...env },
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
        });

        this.process.stdout.on("data", (chunk) => {
          this.buffer += chunk.toString("utf8");
          const lines = this.buffer.split(/\r?\n/);
          this.buffer = lines.pop(); // Mantém o fragmento incompleto

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              this._handleMessage(msg);
            } catch {}
          }
        });

        this.process.stderr.on("data", (err) => {
          console.warn(`[MCP ${this.name} stderr]:`, err.toString().trim());
        });

        this.process.on("error", (err) => {
          reject(new Error(`Falha ao iniciar servidor MCP ${this.name}: ${err.message}`));
        });

        this.process.on("exit", (code) => {
          this.emit("close", code);
        });

        // Inicializa o handshake do protocolo MCP
        this._initialize()
          .then(resolve)
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  async _connectHttp() {
    // Para servidores HTTP/SSE como o situ-mcp-plugin (porta 7124)
    return this._initializeHttp();
  }

  async _initialize() {
    const initRes = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {} },
      clientInfo: { name: "chat-ia-client", version: "1.2.0" },
    });
    this.serverInfo = initRes.serverInfo;

    // Notificação de initialized
    this.notify("notifications/initialized");

    // Carrega ferramentas disponíveis
    await this.refreshTools();
    return this.serverInfo;
  }

  async _initializeHttp() {
    const url = this.config.url || "http://127.0.0.1:7124/mcp";
    const initRes = await this._httpPost(url, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {} },
      clientInfo: { name: "chat-ia-client", version: "1.2.0" },
    });
    this.serverInfo = initRes?.result?.serverInfo || { name: this.name };
    await this.refreshTools();
    return this.serverInfo;
  }

  async refreshTools() {
    if (this.config.transport === "stdio") {
      const res = await this.request("tools/list", {});
      this.tools = res.tools || [];
    } else {
      const url = this.config.url || "http://127.0.0.1:7124/mcp";
      const res = await this._httpPost(url, "tools/list", {});
      this.tools = res?.result?.tools || [];
    }
    return this.tools;
  }

  async callTool(toolName, args = {}) {
    if (this.config.transport === "stdio") {
      return this.request("tools/call", { name: toolName, arguments: args });
    } else {
      const url = this.config.url || "http://127.0.0.1:7124/mcp";
      const res = await this._httpPost(url, "tools/call", { name: toolName, arguments: args });
      return res?.result || res;
    }
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const payload = { jsonrpc: "2.0", id, method, params };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout aguardando MCP ${this.name} (${method})`));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      if (this.process && this.process.stdin.writable) {
        this.process.stdin.write(JSON.stringify(payload) + "\n");
      } else {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error(`Processo MCP ${this.name} não está acessível`));
      }
    });
  }

  notify(method, params = {}) {
    const payload = { jsonrpc: "2.0", method, params };
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(JSON.stringify(payload) + "\n");
    }
  }

  _handleMessage(msg) {
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(msg.id);
      clearTimeout(timer);
      this.pendingRequests.delete(msg.id);

      if (msg.error) {
        reject(new Error(`MCP Erro (${msg.error.code}): ${msg.error.message}`));
      } else {
        resolve(msg.result);
      }
    }
  }

  async _httpPost(url, method, params) {
    const id = this.requestId++;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} no servidor MCP`);
    return resp.json();
  }

  disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
