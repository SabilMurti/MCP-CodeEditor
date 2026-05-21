# MCP Code Editor ("The Typist")

A custom MCP (Model Context Protocol) Server that acts as a "code writing assistant" to save your primary AI tokens and expenses.

With this setup, your primary AI (such as Claude-3.5-Sonnet or Gemini-1.5-Pro) in Antigravity/Cursor acts purely as a **Logic Architect** that designs program flows and system architectures, while the heavy lifting of writing and editing long files is delegated to a cheaper third-party LLM (such as Gemini-1.5-Flash, Llama-3, or DeepSeek) via MCP Tools.

## Core Features

This MCP Server registers 4 tools:
1.  **`write_code`**: Generates new code based on logical instructions and returns the code block directly in the chat without writing it to disk (useful for review).
2.  **`create_file`**: Generates code based on instructions and writes it directly as a new file at the specified path.
3.  **`edit_file`**: Reads an existing file, sends its contents and edit instructions to the cheap LLM, then overwrites the file completely with the modified code.
4.  **`check_connection`**: Tests connectivity to the configured cheap LLM provider, printing API latency and the raw response to help verify settings.

## Installation & Setup

1. Clone or open this folder in your terminal.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your API Key:
   ```bash
   cp .env.example .env
   ```
4. Configure `.env` as needed:
   ```env
   CODER_API_URL=https://api.cometapi.com/v1/chat/completions
   CODER_API_KEY=your_api_key_here
   CODER_MODEL=gpt-4o-mini
   ```

> **Note**: This server uses a standard OpenAI-compatible client, so you can easily point it to OpenRouter, DeepSeek, Groq, or even a local Ollama instance by changing `CODER_API_URL`, `CODER_API_KEY`, and `CODER_MODEL`.

## Registering to Antigravity / Cursor

Add the following config to your global MCP configuration file (e.g. `mcp_config.json` in Antigravity or Desktop App settings):

```json
{
  "mcpServers": {
    "mcp-code-editor": {
      "command": "node",
      "args": ["/home/murtix/Projects/Apps/MCP-CodeEditor/index.js"]
    }
  }
}
```

*Make sure to adjust the absolute path to `index.js` based on where the repository is cloned on your system.*

## Agent Rules (.clauderules / .cursorrules)

To guide your primary AI to delegate coding tasks, copy the following rules to a `.clauderules` or `.cursorrules` file in the root of the project you are working on:

```markdown
# Rule: Logic Architect & Code Writing Delegation

You act as the **Logic Architect**. You have access to the MCP Code Editor tools (`write_code`, `create_file`, `edit_file`).

## Core Rules:
1. **DO NOT Write Long Code Blocks Directly**: Whenever the user asks to create a new file (e.g. React component, Laravel Controller, Python script) or rewrite a long code block (>20 lines), you are **strictly forbidden** from generating it directly in the main chat conversation using your internal resources.
2. **Always Delegate to Tools**:
   - To create a new file, gather detailed logical requirements first, then call the **`create_file`** tool with the full specifications.
   - To modify or add features to an existing file, gather the modification logic, then call the **`edit_file`** tool.
   - To generate temporary code for review in the chat without writing to disk, call the **`write_code`** tool.
3. **Focus on Logic and Structure**: Your primary task in the chat is to think about the architecture, design the program flow, verify the conceptual correctness, and provide extremely specific and detailed instructions for the `instruction` parameter in the tools.
4. **After Tool Execution**: Simply provide a summary of the changes or confirmation that the file was successfully created/updated by the code writing assistant.
```
