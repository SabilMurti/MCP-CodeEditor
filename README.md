# MCP Code Editor ("Tukang Ketik")

MCP (Model Context Protocol) Server kustom yang bertindak sebagai "asisten penulis kode" (Tukang Ketik) untuk menghemat pengeluaran token Anda. 

Dengan setup ini, AI utama Anda (seperti Claude-3.5-Sonnet atau Gemini-1.5-Pro) di Antigravity cukup bertindak sebagai **Arsitek Logika** yang merancang alur program, sedangkan tugas penulisan kode panjang didelegasikan kepada AI pihak ketiga yang lebih murah (seperti Gemini-1.5-Flash, Llama-3, atau DeepSeek) melalui MCP Tool.

## Fitur Utama

MCP Server ini menyediakan 3 tools utama:
1.  **`tulis_kode`**: Meminta AI murah untuk men-generate kode berdasarkan instruksi logika, lalu mengembalikan teks kodenya ke chat tanpa menulis ke disk.
2.  **`buat_file`**: Men-generate kode berdasarkan instruksi lalu menyimpannya langsung sebagai berkas baru di path yang ditentukan.
3.  **`edit_file`**: Membaca isi berkas lama, mengirimkan kode lama beserta instruksi edit ke AI murah, lalu menulis ulang berkas tersebut secara utuh dengan kode baru hasil modifikasi.

## Instalasi & Persiapan

1.  Clone atau buka folder ini di terminal Linux Anda.
2.  Install dependensi:
    ```bash
    npm install
    ```
3.  Buat file `.env` (duplikat dari `.env.example`) dan isi API Key Anda:
    ```bash
    cp .env.example .env
    ```
4.  Konfigurasikan `.env` sesuai kebutuhan Anda:
    ```env
    CODER_API_URL=https://api.cometapi.com/v1/chat/completions
    CODER_API_KEY=api_key_cometapi_anda
    CODER_MODEL=gemini-1.5-flash
    ```

> **Catatan**: MCP Server ini menggunakan API Client standar yang kompatibel dengan standar OpenAI, sehingga Anda bisa menggunakannya dengan penyedia lain seperti OpenRouter, DeepSeek, Groq, atau bahkan local Ollama hanya dengan mengganti `CODER_API_URL`, `CODER_API_KEY`, dan `CODER_MODEL`.

## Pendaftaran ke Antigravity

Tambahkan konfigurasi berikut ke berkas pengaturan global MCP di Antigravity (atau Cursor/Claude Desktop):

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

*Pastikan untuk menyesuaikan path absolut menuju file `index.js` di atas sesuai dengan folder penyimpanan Anda.*

## Aturan Agen (.clauderules / .cursorrules)

Salin aturan di bawah ini ke file `.clauderules` atau `.cursorrules` di root proyek Anda agar Agen Utama tahu kapan harus mendelegasikan tugas coding ke tool ini:

```markdown
# Rule: Arsitek Logika & Delegasi Penulisan Kode
Kamu bertindak sebagai Arsitek Logika. Kamu memiliki akses ke tool MCP Code Editor (`tulis_kode`, `buat_file`, `edit_file`).

Setiap kali pengguna meminta membuat file baru, memodifikasi file, atau menulis blok kode panjang (>20 baris), kamu DILARANG menulisnya sendiri. Kamu WAJIB menyusun logika berfikirnya saja, lalu memanggil tool MCP Code Editor yang sesuai. Setelah tool selesai dijalankan, laporkan hasilnya ke pengguna.
```
