#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

import { fileURLToPath } from "url";

// Load configuration relative to index.js location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

const API_URL = process.env.CODER_API_URL || "https://api.cometapi.com/v1/chat/completions";
const API_KEY = process.env.CODER_API_KEY;
const MODEL_NAME = process.env.CODER_MODEL || "gemini-1.5-flash";

if (!API_KEY) {
  console.error("WARNING: CODER_API_KEY is not defined in the environment or .env file.");
}

// Helper to strip markdown code blocks if the AI model included them
function stripMarkdown(text) {
  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline !== -1) {
      trimmed = trimmed.substring(firstNewline + 1);
    } else {
      trimmed = trimmed.substring(3);
    }
    if (trimmed.endsWith("```")) {
      trimmed = trimmed.substring(0, trimmed.length - 3);
    }
  }
  return trimmed.trim();
}

// Call standard completions API
async function callLLM(systemPrompt, userPrompt) {
  if (!API_KEY) {
    throw new Error("CODER_API_KEY is missing. Please configure it in your .env file.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2 // Low temperature for code generation consistency
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
    throw new Error("Unexpected API response format: " + JSON.stringify(data));
  }

  return data.choices[0].message.content;
}

const server = new Server({
  name: "mcp-code-editor",
  version: "1.0.0",
}, {
  capabilities: { tools: {} }
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "tulis_kode",
      description: "Menghasilkan kode baru berdasarkan instruksi logika tanpa menulis ke disk. Berguna jika ingin memeriksa kode sebelum menyimpannya.",
      inputSchema: {
        type: "object",
        properties: {
          instruksi: { type: "string", description: "Instruksi detail logika/kode yang ingin dibuat" },
          bahasa: { type: "string", description: "Bahasa pemrograman (contoh: javascript, php, python, HTML)" }
        },
        required: ["instruksi", "bahasa"]
      }
    },
    {
      name: "buat_file",
      description: "Membuat file baru di path tertentu dan mengisinya dengan kode yang di-generate berdasarkan instruksi logika.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path file tujuan (bisa relatif terhadap current directory atau absolut)" },
          instruksi: { type: "string", description: "Instruksi detail logika/kode yang harus ditulis di file baru" },
          bahasa: { type: "string", description: "Bahasa pemrograman file tersebut" }
        },
        required: ["filePath", "instruksi", "bahasa"]
      }
    },
    {
      name: "edit_file",
      description: "Membaca file yang sudah ada, mengirimkan konten lamanya beserta instruksi edit ke AI murah, lalu menulis ulang file tersebut dengan kode baru hasil modifikasi.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path file yang ingin diedit" },
          instruksi: { type: "string", description: "Instruksi perubahan, modifikasi, atau penambahan fitur baru ke file tersebut" }
        },
        required: ["filePath", "instruksi"]
      }
    },
    {
      name: "cek_koneksi",
      description: "Memeriksa koneksi ke API AI murah yang dikonfigurasi di berkas .env.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ]
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "tulis_kode") {
      const { instruksi, bahasa } = args;
      const systemPrompt = `Kamu adalah asisten AI programmer senior yang sangat kompeten. Tulis kode murni dalam bahasa ${bahasa} tanpa basa-basi penjelasan, tanpa markdown pembungkus di luar kode (jangan gunakan backticks \`\`\` kecuali jika kamu sedang menulis file markdown), dan tanpa kata pengantar.`;
      
      const rawCode = await callLLM(systemPrompt, instruksi);
      const cleanCode = stripMarkdown(rawCode);

      return {
        content: [{ type: "text", text: cleanCode }]
      };
    }

    if (name === "buat_file") {
      const { filePath, instruksi, bahasa } = args;
      
      // Resolve path
      const resolvedPath = path.resolve(process.cwd(), filePath);
      
      const systemPrompt = `Kamu adalah asisten AI programmer senior yang sangat kompeten. Tulis kode murni lengkap untuk file baru dalam bahasa ${bahasa} tanpa penjelasan, tanpa kata pengantar, dan tanpa markdown pembungkus (seperti \`\`\`). Berikan isi file yang lengkap.`;
      
      const rawCode = await callLLM(systemPrompt, instruksi);
      const cleanCode = stripMarkdown(rawCode);

      // Ensure directory exists
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      // Write file
      await fs.writeFile(resolvedPath, cleanCode, "utf8");

      return {
        content: [{ type: "text", text: `Sukses membuat file di: ${resolvedPath}\n\nIsi file:\n${cleanCode}` }]
      };
    }

    if (name === "edit_file") {
      const { filePath, instruksi } = args;
      
      // Resolve path
      const resolvedPath = path.resolve(process.cwd(), filePath);
      
      // Read current content
      let currentContent = "";
      try {
        currentContent = await fs.readFile(resolvedPath, "utf8");
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: File tidak ditemukan di ${resolvedPath}. Jika ingin membuat file baru, gunakan tool 'buat_file'.` }],
          isError: true
        };
      }

      const systemPrompt = `Kamu adalah asisten AI programmer senior yang sangat kompeten. Tulis kode murni hasil modifikasi lengkap tanpa penjelasan, tanpa kata pengantar, dan tanpa markdown pembungkus (seperti \`\`\`). Berikan kode lengkap isi file yang sudah diperbarui secara utuh.`;
      
      const userPrompt = `Berikut adalah konten asli dari file:\n---\n${currentContent}\n---\n\nInstruksi perubahan:\n${instruksi}\n\nTolong edit file tersebut sesuai instruksi dan kembalikan seluruh isi file yang baru secara lengkap dan utuh.`;

      const rawCode = await callLLM(systemPrompt, userPrompt);
      const cleanCode = stripMarkdown(rawCode);

      // Write updated content
      await fs.writeFile(resolvedPath, cleanCode, "utf8");

      return {
        content: [{ type: "text", text: `Sukses mengedit file di: ${resolvedPath}\n\nKonten Baru:\n${cleanCode}` }]
      };
    }

    if (name === "cek_koneksi") {
      const systemPrompt = "Kamu adalah asisten penguji koneksi. Jawab hanya dengan satu kata: 'OK'.";
      const userPrompt = "Koneksi tes.";
      
      const startTime = Date.now();
      const rawResponse = await callLLM(systemPrompt, userPrompt);
      const latency = Date.now() - startTime;
      
      const cleanResponse = stripMarkdown(rawResponse);

      return {
        content: [{ type: "text", text: `Koneksi ke AI berhasil.\nEndpoint: ${API_URL}\nModel: ${MODEL_NAME}\nLatency: ${latency}ms\nRespon AI Mentah: ${cleanResponse}` }]
      };
    }

    throw new Error(`Tool ${name} tidak ditemukan`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error mengeksekusi tool ${name}: ${error.message}` }],
      isError: true
    };
  }
});

// Run server using stdio transport
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("MCP Code Editor Server running on stdio transport");
}).catch((err) => {
  console.error("Failed to connect transport:", err);
});