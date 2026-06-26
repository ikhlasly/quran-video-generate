export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
  juz: number;
  manzil: number;
  page: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean | { id: number; recommended: boolean; obligatory: boolean };
  audio?: string;
  audioSecondary?: string[];
}

export interface AyahEdition {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
  ayahs: Ayah[];
  edition: {
    identifier: string;
    language: string;
    name: string;
    englishName: string;
    format: string;
    type: string;
    direction: string;
  };
}

export interface Reciter {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  format: string;
  type: string;
  direction: string | null;
}

// ---------------------------------------------------------------------------
// Unified reciter types (multi-provider: AlQuran + QuranPedia + future)
// ---------------------------------------------------------------------------

/** Identifier of the reciter data source/provider. */
export type ReciterSource = "alquran" | "quranpedia";

/**
 * A single recitation "style" / audio server entry.
 * QuranPedia exposes reciters with one or more `moshaf` entries, each pointing
 * to an audio server. AlQuran reciters do not use moshaf, so this is optional.
 */
export interface ReciterMoshaf {
  /** Stable id within the provider (stringified for portability). */
  id: string;
  /** Display name of this recitation style (may be Arabic). */
  name: string;
  /** Base audio server URL (directory). Always normalized to end with '/'. */
  server: string;
  /** Total number of surahs available on this server (usually 114). */
  surahTotal?: number;
  /**
   * List of surah numbers (1-114) that have audio available on this server.
   * Used to filter the reciter list so only reciters with audio for the
   * selected surah are shown. Undefined when unknown (treated as "all available").
   */
  surahs?: number[];
  /**
   * Audio layout of this server.
   * - `versebyverse`: files named like `001001.mp3` (surah+ayah), per-ayah audio.
   * - `gapless`: files named like `001.mp3` (full surah).
   * - `unknown`: not determined.
   */
  moshafType?: "versebyverse" | "gapless" | "unknown";
  /** Audio bitrate in kbps, when known. */
  bitrate?: number;
}

/**
 * Provider-agnostic reciter representation.
 * Every reciter from every provider is normalized into this shape so the UI
 * and generation pipeline can treat them uniformly.
 */
export interface UnifiedReciter {
  /** Globally-unique id: `${source}:${providerId}`. */
  id: string;
  /** Source/provider this reciter came from. */
  source: ReciterSource;
  /** Provider-native identifier (AlQuran edition identifier or QuranPedia id). */
  providerId: string;
  /**
   * AlQuran edition identifier when available (e.g. `ar.alafasy`).
   * For QuranPedia-only reciters this is `null`. Used to keep backward
   * compatibility with the existing getAyahs() flow which expects an AlQuran
   * audio edition identifier.
   */
  identifier: string | null;
  /** Arabic display name. */
  name: string;
  /** English / transliterated display name. */
  englishName: string;
  /** ISO language code (almost always `ar` for reciters). */
  language: string;
  /** Audio format, when known (e.g. `audio`). */
  format?: string;
  /** Edition type, when known (e.g. `versebyverse`). */
  type?: string;
  /** Text direction, when known. */
  direction?: string | null;
  /** Recitation style label (QuranPedia), e.g. `Murattal`, `Mujawwad`. */
  style?: string;
  /** Alphabetical letter grouping (QuranPedia), e.g. `M`. */
  letter?: string;
  /** Available recitation styles / audio servers (QuranPedia). */
  moshaf?: ReciterMoshaf[];
  /**
   * The preferred moshaf to use for audio generation (QuranPedia).
   * Pre-selected by the provider (prefers verse-by-verse when available).
   */
  preferredMoshaf?: ReciterMoshaf;
  /** Provider-specific metadata badge shown in the UI (e.g. style + bitrate). */
  metadata?: string;
  /** Original raw payload from the provider (for advanced/debug use). */
  raw?: unknown;
}

export interface GenerationJob {
  id: string;
  status:
    | "pending"
    | "fetching_verses"
    | "extracting_concepts"
    | "searching_videos"
    | "downloading_clips"
    | "generating_subtitles"
    | "rendering_video"
    | "completed"
    | "failed";
  progress: number;
  message: string;
  config: GenerationConfig;
  result?: GenerationResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type AIProvider =
  | "openai"
  | "deepseek"
  | "glm"
  | "openrouter"
  | "gemini"
  | "ollama"
  | "anthropic";
export type VideoSource = "pexels" | "pixabay";
export type SubtitlePosition = "bottom" | "center" | "top";
export type LogoPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

export interface VideoSourceConfig {
  source: VideoSource;
  apiKey: string;
}

export const AI_PROVIDER_MODELS: Record<
  AIProvider,
  {
    label: string;
    models: string[];
    requiresKey: boolean;
    keyLabel: string;
    keyUrl: string;
  }
> = {
  openai: {
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4.1-nano"],
    requiresKey: true,
    keyLabel: "OpenAI API Key",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  deepseek: {
    label: "DeepSeek",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    requiresKey: true,
    keyLabel: "DeepSeek API Key",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  glm: {
    label: "GLM",
    models: ["glm-4.7-flash", "glm-5.2", "glm-5.1", "glm-5", "glm-4.7"],
    requiresKey: true,
    keyLabel: "GLM API Key",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
  },
  openrouter: {
    label: "OpenRouter (Free)",
    models: [
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "google/gemma-4-31b-it:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen3-coder:free",
      "openai/gpt-oss-120b:free",
    ],
    requiresKey: true,
    keyLabel: "OpenRouter API Key",
    keyUrl: "https://openrouter.ai/keys",
  },
  gemini: {
    label: "Gemini",
    models: [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ],
    requiresKey: true,
    keyLabel: "Gemini API Key",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  ollama: {
    label: "Local Ollama",
    models: ["llama3.2", "llama3.1", "mistral", "qwen2.5", "gemma2", "phi4"],
    requiresKey: false,
    keyLabel: "",
    keyUrl: "",
  },
  anthropic: {
    label: "Anthropic",
    models: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
    requiresKey: true,
    keyLabel: "Anthropic API Key",
    keyUrl: "https://console.anthropic.com/keys",
  },
};

export const VIDEO_SOURCES: Record<
  VideoSource,
  { label: string; keyLabel: string; keyUrl: string }
> = {
  pexels: {
    label: "Pexels",
    keyLabel: "Pexels API Key",
    keyUrl: "https://www.pexels.com/api/",
  },
  pixabay: {
    label: "Pixabay",
    keyLabel: "Pixabay API Key",
    keyUrl: "https://pixabay.com/api/docs/",
  },
};

export interface GenerationConfig {
  surah: number;
  startAyah: number;
  endAyah: number;
  reciter: string;
  reciterName?: string;
  /**
   * Source of the selected reciter. Defaults to 'alquran' when absent so that
   * pre-existing jobs/configs keep working unchanged.
   */
  reciterSource?: ReciterSource;
  /** Provider-native id of the selected reciter (e.g. QuranPedia reciter id). */
  reciterProviderId?: string;
  /** Unified reciter id (`${source}:${providerId}`) for traceability. */
  reciterUnifiedId?: string;
  /**
   * QuranPedia audio server URL (moshaf `server`) to download per-ayah audio.
   * Only used when reciterSource === 'quranpedia'.
   */
  reciterMoshafServer?: string;
  /** QuranPedia moshaf audio layout. */
  reciterMoshafType?: "versebyverse" | "gapless" | "unknown";
  translation: string;
  translationName?: string;
  surahName?: string;
  // Legacy support
  pexelsApiKey?: string;
  geminiApiKey?: string;
  // New provider system
  aiProvider?: AIProvider;
  aiModel?: string;
  aiApiKey?: string;
  videoSource?: VideoSource;
  videoApiKey?: string;
  // Video settings
  orientation?: "landscape" | "portrait" | "square";
  showArabic?: boolean;
  showTranslation?: boolean;
  subtitlePosition?: SubtitlePosition;
  // Text logo overlay
  logoText?: string;
  logoPosition?: LogoPosition;
}

export interface GenerationResult {
  videoPath: string;
  videoUrl: string;
  duration: number;
  fileSize: number;
  concepts: string[];
  clipCount: number;
}

export interface VideoInfo {
  id: string;
  surah: number;
  surahName: string;
  startAyah: number;
  endAyah: number;
  reciter: string;
  reciterName?: string;
  /** Source of the reciter used for this video (alquran | quranpedia). */
  reciterSource?: ReciterSource;
  /** Unified reciter id (`${source}:${providerId}`). */
  reciterUnifiedId?: string;
  translation: string;
  translationName?: string;
  videoUrl: string;
  duration: number;
  fileSize: number;
  createdAt: string;
  thumbnailUrl?: string;
  orientation?: string;
}

export interface PexelsVideo {
  id: number;
  duration: number;
  image: string;
  full_res: string;
  video_files: PexelsVideoFile[];
  video_pictures: PexelsVideoPicture[];
}

export interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

export interface PexelsVideoPicture {
  id: number;
  nr: number;
  picture: string;
}

export interface VisualConcept {
  concept: string;
  searchQuery: string;
  ayahReferences: number[];
}
