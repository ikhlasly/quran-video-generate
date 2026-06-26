# 🕌 Quran Video Generator

**Generate beautiful Quran videos with AI-powered visuals, recitation audio, and dual subtitles.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Features

- **📖 Verse Selection** — Browse all 114 surahs with ayah range selection
- **🎙️ 200+ Reciters** — Merged from alquran.cloud + QuranPedia, with Arabic names and English transliteration, audio downloaded directly from reciter servers
- **🌐 50+ Translations** — Multiple languages with grouped dropdowns
- **🤖 7 AI Providers** — Gemini, Anthropic, OpenAI, DeepSeek, GLM, OpenRouter, or local Ollama for visual concept extraction
- **🎬 Stock Footage** — Pexels or Pixabay integration for background video clips
- **📝 Dual Subtitles** — Unified ASS subtitle block with Arabic (RTL) + Translation with auto-segmentation
- **📐 Three Orientations** — Landscape (16:9), Portrait (9:16), Square (1:1)
- **🔤 Configurable Subtitles** — Both, Arabic Only, Translation Only, or None with top/center/bottom positioning
- **🏷️ Text Logo Overlay** — Custom branding with 6 position options
- **🌍 26 UI Languages** — Full i18n: English, Arabic, French, German, Turkish, Urdu, Indonesian, and more
- **⬇️ Video Download** — Download from cards, player dialog, or generation result
- **📱 Responsive Design** — Mobile, tablet, and desktop
- **🌙 Dark Mode** — System-aware theme toggle
- **🔊 Audio Preview** — Listen to recitation before generating
- **💻 Local-First** — API keys stored in browser localStorage, all processing on your machine

---

## 🚀 Quick Start

### Prerequisites

- **Bun** (or Node.js 20+)
- **FFmpeg** installed and available in PATH
- **API Keys** (optional):
  - AI Provider key (Gemini, OpenAI, etc.) — for concept extraction
  - Video source key (Pexels or Pixabay) — for stock footage

### Installation

```bash
git clone https://github.com/ikhlasly/quran-video-generate.git
cd quran-video-generate
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Setting Up API Keys

1. Click the **⚙️ Settings** icon in the header
2. Choose your AI provider and enter the API key
3. Choose your video source and enter the API key
4. Click **Save**

> **Without API keys:** The app still works — it generates a gradient background video and uses keyword-based search instead of AI concept extraction. API errors are surfaced clearly in the generation progress so you know what went wrong.

### FFmpeg Installation

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

**Verify installation:**
```bash
ffmpeg -version
```

> Without FFmpeg, the app will show a clear error message with installation instructions.

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 |
| **Video Processing** | FFmpeg (fluent-ffmpeg) |
| **Quran Data** | [alquran.cloud API](https://alquran.cloud/api) + [QuranPedia API](https://quranpedia.net) |
| **Stock Footage** | Pexels / Pixabay API |
| **AI Providers** | OpenAI, DeepSeek, Gemini, GLM, OpenRouter, Ollama |
| **UI Components** | Custom lightweight (no Radix, no shadcn) |
| **Theming** | next-themes |
| **Toasts** | Sonner |

### Project Structure

```
quran-video-generate/
├── app/
│   ├── api/
│   │   ├── generate/route.ts      # Video generation endpoint
│   │   ├── quran/
│   │   │   ├── surahs/route.ts    # Surah list endpoint
│   │   │   └── ayahs/route.ts     # Ayah data endpoint
│   │   └── videos/
│   │       ├── route.ts           # Video list endpoint
│   │       └── [id]/route.ts      # Video stream & delete
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Main page
│   └── globals.css                # Global styles
├── components/ui/                 # UI primitives (no Radix)
│   ├── button.tsx, badge.tsx      # Button & badge with variants
│   ├── card.tsx                   # Card layout
│   ├── dialog.tsx                 # Modal dialog (portal-based)
│   ├── alert-dialog.tsx           # Confirmation dialog
│   ├── select.tsx                 # Custom dropdown
│   ├── tabs.tsx                   # Tab navigation
│   ├── input.tsx, label.tsx       # Form controls
│   ├── progress.tsx              # Progress bar
│   ├── scroll-area.tsx           # Scrollable container
│   ├── separator.tsx             # Visual divider
│   └── slot.tsx                  # Slot pattern
├── lib/
│   ├── generation.ts             # Video generation pipeline
│   ├── ffmpeg.ts                 # FFmpeg operations (ASS subtitles, rendering)
│   ├── quran-api.ts              # alquran.cloud API client with caching
│   ├── i18n.ts                   # 26-language translation map
│   ├── storage.ts                # File system storage
│   └── utils.ts                  # cn() utility
├── types/
│   └── quran.ts                  # TypeScript interfaces
└── storage/                       # Generated videos & metadata (gitignored)
```

---

## 🎬 How It Works

### Video Generation Pipeline

```
1. Fetch Verses        → alquran.cloud API (Arabic text + translation + audio URLs)
2. Download Audio      → Download per-ayah recitation audio, concatenate
3. Extract Concepts    → AI analyzes verses for visual themes
4. Search Videos       → Pexels/Pixabay API finds matching footage
5. Download Clips      → Download top-matching video clips
6. Generate Subtitles  → Timed ASS subtitles (Arabic RTL + translation)
7. Render Video        → FFmpeg: concat clips → add audio → burn subtitles
```

### Step-by-Step Flow

1. **Select a Surah** and ayah range
2. **Choose a Reciter** from 200+ Arabic reciters (alquran.cloud + QuranPedia)
3. **Pick a Translation** from 50+ translations
4. **Set Orientation** (Landscape, Portrait, or Square)
5. **Configure Subtitles** — visibility, position, logo text
6. **Preview** verses with audio playback
7. **Generate** — the app handles everything else and produces a final MP4

---

## 🎨 Subtitle System

### Unified ASS Format

- **Single style** with configurable alignment (bottom/center/top)
- **Arabic + Translation** in one dialogue entry, separated by `\N` (hard line break)
- **Inline font overrides**: `{\fnAmiri}` for Arabic, `{\fnArial}` for Translation
- **RTL marker** (`\u202B`) for proper Arabic rendering
- **Automatic verse segmentation** for long verses (e.g., 2:255, 33:35)

### Font Sizes by Orientation

| Orientation | Arabic Font | Translation Font |
|---|---|---|
| Landscape (1920×1080) | 22px (Amiri) | 16px (Arial) |
| Square (1080×1080) | 20px (Amiri) | 16px (Arial) |
| Portrait (1080×1920) | 10px (Amiri) | 9px (Arial) |

---

## 🤖 AI Providers

| Provider | Requires Key | Model IDs | Notes |
|---|---|---|---|
| Gemini | Yes | `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro` | Recommended default |
| Anthropic | Yes | `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-1` | — |
| OpenAI | Yes | `gpt-4o`, `gpt-4o-mini`, `o3-mini`, `gpt-4.1-nano` | — |
| DeepSeek | Yes | `deepseek-v4-flash`, `deepseek-v4-pro` | — |
| GLM | Yes | `glm-4.7-flash` (free), `glm-5.2`, `glm-5.1`, `glm-5` | — |
| OpenRouter | Yes | Free models: Nemotron, Gemma 4, Llama 3.3, Qwen3 | Many models available |
| Ollama | No | `llama3.2`, `mistral`, `qwen2.5`, `gemma2`, `phi4` | Local, self-hosted |

---

## 📡 API Reference

> Full interactive API documentation is available at **`/api/docs`** when the dev server is running.

### Application Routes

| Route | Method | Description |
|---|---|---|
| `/api/quran/surahs` | GET | List all 114 surahs |
| `/api/quran/ayahs` | GET | Get ayahs with audio + translation |
| `/api/generate` | POST | Start video generation |
| `/api/generate?id=` | GET | Poll generation status |
| `/api/videos` | GET | List generated videos |
| `/api/videos/[id]` | GET | Stream/download video |
| `/api/videos/[id]` | DELETE | Delete video |

### External APIs

| API | Usage |
|---|---|
| [alquran.cloud](https://alquran.cloud/api) | Quran text, audio recitation, translations |
| [Pexels](https://www.pexels.com/api/) | Stock video footage |
| [Pixabay](https://pixabay.com/api/docs/) | Stock video footage (alternative) |

---

## 🤝 Contributing

### Development Setup

```bash
git clone https://github.com/ikhlasly/quran-video-generate.git
cd quran-video-generate
bun install
bun dev
```

### Commands

| Command | Description |
|---|---|
| `bun dev` | Start development server |
| `bun run build` | Production build |
| `bun start` | Start production server |
| `bun run lint` | Run ESLint |
| `npx tsc --noEmit` | TypeScript type check |

### Guidelines

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Commit your changes**: `git commit -m 'Add your feature'`
4. **Push**: `git push origin feature/your-feature`
5. **Open a Pull Request**

### Areas for Contribution

- 🌍 More translations and UI languages
- 🎬 Video transitions and effects
- 🎵 Background audio/nasheed support
- 📱 Mobile UX improvements
- 🧪 Tests
- 📖 Documentation

---

## 🗺️ Roadmap

- [x] Multi-provider AI support (6 providers)
- [x] Multiple video sources (Pexels + Pixabay)
- [x] Subtitle positioning (top/center/bottom)
- [x] Text logo overlay with positioning
- [x] 26 UI languages with RTL support
- [x] Zero Radix UI dependency
- [ ] Video templates with pre-designed themes
- [ ] Batch generation
- [ ] Custom font upload
- [ ] Social media export presets
- [ ] Cloud storage integration
- [ ] Background audio overlay

---

## 🙏 Acknowledgments

- **[alquran.cloud](https://alquran.cloud/)** — Free Quran API with recitations and translations
- **[QuranPedia](https://quranpedia.net/)** — Reciter database and audio files
- **[Pexels](https://www.pexels.com/)** / **[Pixabay](https://pixabay.com/)** — Free stock video footage
- **[FFmpeg](https://ffmpeg.org/)** — Video processing backbone
- **[Next.js](https://nextjs.org/)** — React framework

---

## ⚠️ Disclaimer

This tool is for educational and religious purposes. Ensure you have the appropriate rights to use any video clips, audio recitations, or translations. Respect the terms of service of all APIs used.

---

## 📜 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**Built with ❤️ for the Muslim community**

[Report Bug](https://github.com/ikhlasly/quran-video-generate/issues) · [Request Feature](https://github.com/ikhlasly/quran-video-generate/issues)

</div>
