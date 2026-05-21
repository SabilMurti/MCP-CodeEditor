#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import os from "os";

import { fileURLToPath } from "url";

// Load configuration relative to index.js location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(os.homedir(), ".mcp-code-editor.env"),
  path.resolve(__dirname, ".env")
];

for (const envPath of envPaths) {
  try {
    const stats = await fs.stat(envPath);
    if (stats.isFile()) {
      dotenv.config({ path: envPath });
      break; // Stop after successfully loading the first found .env file
    }
  } catch (e) {
    // File not found or other error, continue to next path
  }
}

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
      name: "write_code",
      description: "Generate new code based on instructions without writing it to disk. Useful for reviewing code before saving.",
      inputSchema: {
        type: "object",
        properties: {
          instruction: { type: "string", description: "Detailed instruction/logic for the code to be created" },
          language: { type: "string", description: "Programming language (e.g. javascript, php, python, html)" }
        },
        required: ["instruction", "language"]
      }
    },
    {
      name: "create_file",
      description: "Create a new file at a specific path and write code generated based on logic/instructions.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Target file path (can be relative to current directory or absolute)" },
          instruction: { type: "string", description: "Detailed instruction/logic for the code to write to the new file" },
          language: { type: "string", description: "Programming language of the file" }
        },
        required: ["filePath", "instruction", "language"]
      }
    },
    {
      name: "edit_file",
      description: "Read an existing file, send its current contents and edit instructions to the AI, then overwrite the file with the modified code.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path of the file to edit" },
          instruction: { type: "string", description: "Instruction for changes, modifications, or adding new features to the file" }
        },
        required: ["filePath", "instruction"]
      }
    },
    {
      name: "check_connection",
      description: "Check the connection to the AI API configured in the .env file.",
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
    if (name === "write_code") {
      const { instruction, language } = args;
      const systemPrompt = `You are a highly competent senior AI programmer assistant. Write pure code in ${language} without any explanations, conversational filler, markdown wrappers outside the code (do not use \`\`\` backticks unless you are writing a markdown file), and without introductory text.`;
      
      const rawCode = await callLLM(systemPrompt, instruction);
      const cleanCode = stripMarkdown(rawCode);

      return {
        content: [{ type: "text", text: cleanCode }]
      };
    }

    if (name === "create_file") {
      const { filePath, instruction, language } = args;
      
      // Resolve path
      const resolvedPath = path.resolve(process.cwd(), filePath);
      
      const systemPrompt = `You are a highly competent senior AI programmer assistant. Write complete pure code for a new file in ${language} without any explanations, conversational filler, and without markdown wrappers (like \`\`\`). Provide the complete contents of the file.`;
      
      const rawCode = await callLLM(systemPrompt, instruction);
      const cleanCode = stripMarkdown(rawCode);

      // Ensure directory exists
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      // Write file
      await fs.writeFile(resolvedPath, cleanCode, "utf8");

      return {
        content: [{ type: "text", text: `Successfully created file at: ${resolvedPath}\n\nFile contents:\n${cleanCode}` }]
      };
    }

    if (name === "edit_file") {
      const { filePath, instruction } = args;
      
      // Resolve path
      const resolvedPath = path.resolve(process.cwd(), filePath);
      
      // Read current content
      let currentContent = "";
      try {
        currentContent = await fs.readFile(resolvedPath, "utf8");
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: File not found at ${resolvedPath}. If you want to create a new file, use the 'create_file' tool.` }],
          isError: true
        };
      }

      const systemPrompt = `You are a highly competent senior AI programmer assistant. Write complete modified pure code without any explanations, conversational filler, and without markdown wrappers (like \`\`\`). Provide the complete updated contents of the file.`;
      
      const userPrompt = `Here is the original content of the file:\n---\n${currentContent}\n---\n\nEdit instructions:\n${instruction}\n\nPlease edit the file according to the instructions and return the entire new file content completely and fully.`;

      const rawCode = await callLLM(systemPrompt, userPrompt);
      const cleanCode = stripMarkdown(rawCode);

      // Write updated content
      await fs.writeFile(resolvedPath, cleanCode, "utf8");

      return {
        content: [{ type: "text", text: `Successfully edited file at: ${resolvedPath}\n\nNew Content:\n${cleanCode}` }]
      };
    }

    if (name === "check_connection") {
      const systemPrompt = "You are a connection test assistant. Respond with only one word: 'OK'.";
      const userPrompt = "Connection test.";
      
      const startTime = Date.now();
      const rawResponse = await callLLM(systemPrompt, userPrompt);
      const latency = Date.now() - startTime;
      
      const cleanResponse = stripMarkdown(rawResponse);

      return {
        content: [{ type: "text", text: `Connection to AI successful.\nEndpoint: ${API_URL}\nModel: ${MODEL_NAME}\nLatency: ${latency}ms\nRaw AI Response: ${cleanResponse}` }]
      };
    }

    throw new Error(`Tool ${name} not found`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error executing tool ${name}: ${error.message}` }],
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