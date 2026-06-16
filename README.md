# Quran Video Generator

AI-powered Quran video generation with recitation audio and dual subtitles. Select verses, choose a reciter and translation, and generate beautiful videos with synchronized Arabic text, translations, and background footage.

## Features

- **Verse Selection** — Browse all 114 surahs, choose ayah ranges
- **Audio Recitation** — 100+ reciters from alquran.cloud
- **Translations** — Supports 50+ languages
- **AI Concept Extraction** — Uses AI (OpenAI, DeepSeek, Gemini, Ollama, OpenRouter, GLM) to extract visual themes from verses
- **Stock Footage** — Searches Pexels or Pixabay for matching background clips
- **Dual Subtitles** — Arabic + translation subtitles, configurable position
- **Multiple Orientations** — Landscape (16:9), Portrait (9:16), Square (1:1)
- **Text Logo Overlay** — Add custom channel branding with configurable position
- **Dark Mode** — System-aware theme toggle
- **26 UI Languages** — English, Arabic, French, German, Turkish, Urdu, Indonesian, and more

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org) 16 (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) v4
- **Icons**: [Lucide](https://lucide.dev)
- **Toasts**: [Sonner](https://sonner.emilkowal.ski)
- **Video**: [FFmpeg](https://ffmpeg.org) (via fluent-ffmpeg)
- **UI Components**: Lightweight custom components (no Radix UI dependency)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (or Node.js 20+)
- [FFmpeg](https://ffmpeg.org/download.html) installed on your system

### Installation

```bash
git clone https://github.com/your-username/quran-video-generate.git
cd quran-video-generate
bun install
```

### Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
bun run build
bun start
```

## Configuration

All settings are stored in your browser's localStorage — no server-side configuration required.

### AI Provider

Configure in the Settings modal:

| Provider | Requires API Key | Notes |
|---|---|---|
| Gemini | Yes | [Get key](https://aistudio.google.com/apikey) |
| OpenAI | Yes | [Get key](https://platform.openai.com/api-keys) |
| DeepSeek | Yes | [Get key](https://platform.deepseek.com/api_keys) |
| GLM | Yes | [Get key](https://open.bigmodel.cn/usercenter/apikeys) |
| OpenRouter | Yes | [Get key](https://openrouter.ai/keys) — free models available |
| Ollama | No | Local — runs on `http://localhost:11434` |

### Video Source

| Source | Requires API Key | Notes |
|---|---|---|
| Pexels | Yes | [Get key](https://www.pexels.com/api/) |
| Pixabay | Yes | [Get key](https://pixabay.com/api/docs/) |

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── generate/       # Video generation endpoint
│   │   ├── quran/          # Quran data (surahs, ayahs)
│   │   └── videos/         # Video CRUD + streaming
│   ├── globals.css         # Tailwind + shadcn CSS variables
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page
├── components/ui/          # UI primitives (no Radix)
├── lib/                    # Core logic
│   ├── generation.ts       # Video generation pipeline
│   ├── ffmpeg.ts           # FFmpeg operations
│   ├── quran-api.ts        # alquran.cloud API client
│   ├── i18n.ts             # Translations (26 languages)
│   ├── storage.ts          # File system storage
│   └── utils.ts            # cn() utility
├── types/                  # TypeScript types
├── public/                 # Static assets
└── storage/                # Generated videos (gitignored)
```

## How It Works

1. **Fetch Verses** — Retrieve Arabic text + audio from alquran.cloud
2. **Download Audio** — Download per-ayah recitation audio
3. **Extract Concepts** — Send verse text to AI provider for visual theme extraction
4. **Search Footage** — Query Pexels/Pixabay for matching video clips
5. **Download Clips** — Download best-matching clips
6. **Generate Subtitles** — Create timed ASS subtitles for Arabic + translation
7. **Render Video** — Concatenate clips, add audio, burn subtitles with FFmpeg

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/quran/surahs` | GET | List all 114 surahs |
| `/api/quran/ayahs` | GET | Get ayahs with audio + translation |
| `/api/generate` | POST | Start video generation |
| `/api/generate?id=` | GET | Poll generation status |
| `/api/videos` | GET | List generated videos |
| `/api/videos/[id]` | GET | Stream/download video |
| `/api/videos/[id]` | DELETE | Delete video |

## Contributing

Contributions are welcome! Please open an issue or pull request.

## License

[MIT](LICENSE)
