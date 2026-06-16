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

export interface GenerationJob {
  id: string;
  status: 'pending' | 'fetching_verses' | 'extracting_concepts' | 'searching_videos' | 'downloading_clips' | 'generating_subtitles' | 'rendering_video' | 'completed' | 'failed';
  progress: number;
  message: string;
  config: GenerationConfig;
  result?: GenerationResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type AIProvider = 'openai' | 'deepseek' | 'glm' | 'openrouter' | 'gemini' | 'ollama';
export type VideoSource = 'pexels' | 'pixabay';
export type SubtitlePosition = 'bottom' | 'center' | 'top';
export type LogoPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

export interface VideoSourceConfig {
  source: VideoSource;
  apiKey: string;
}

export const AI_PROVIDER_MODELS: Record<AIProvider, { label: string; models: string[]; requiresKey: boolean; keyLabel: string; keyUrl: string }> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4.1-nano'],
    requiresKey: true,
    keyLabel: 'OpenAI API Key',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-pro'],
    requiresKey: true,
    keyLabel: 'DeepSeek API Key',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  glm: {
    label: 'GLM',
    models: ['glm-4.7-flash', 'glm-4.7', 'glm-5.1', 'glm-5'],
    requiresKey: true,
    keyLabel: 'GLM API Key',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  openrouter: {
    label: 'OpenRouter (Free)',
    models: [
      'nvidia/nemotron-3-super-120b-a12b:free',
      'google/gemma-4-31b-it:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen3-next-80b-a3b-instruct:free',
      'openai/gpt-oss-120b:free',
    ],
    requiresKey: true,
    keyLabel: 'OpenRouter API Key',
    keyUrl: 'https://openrouter.ai/keys',
  },
  gemini: {
    label: 'Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    requiresKey: true,
    keyLabel: 'Gemini API Key',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  ollama: {
    label: 'Local Ollama',
    models: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'gemma2', 'phi4'],
    requiresKey: false,
    keyLabel: '',
    keyUrl: '',
  },
};

export const VIDEO_SOURCES: Record<VideoSource, { label: string; keyLabel: string; keyUrl: string }> = {
  pexels: {
    label: 'Pexels',
    keyLabel: 'Pexels API Key',
    keyUrl: 'https://www.pexels.com/api/',
  },
  pixabay: {
    label: 'Pixabay',
    keyLabel: 'Pixabay API Key',
    keyUrl: 'https://pixabay.com/api/docs/',
  },
};

export interface GenerationConfig {
  surah: number;
  startAyah: number;
  endAyah: number;
  reciter: string;
  reciterName?: string;
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
  orientation?: 'landscape' | 'portrait' | 'square';
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
