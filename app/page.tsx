'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import {
  Moon, Sun, Settings, Play, Pause, SkipForward, SkipBack,
  Video, Trash2, Download, Loader2, CheckCircle2, XCircle,
  BookOpen, Volume2, Film, Sparkles, Eye,
  AlertTriangle, ExternalLink, PlusCircle, FolderOpen, Code2, Globe,
  Info
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import type { Surah, Reciter, GenerationJob, VideoInfo, AyahEdition, AIProvider, VideoSource, SubtitlePosition, LogoPosition } from '@/types/quran';
import { AI_PROVIDER_MODELS, VIDEO_SOURCES } from '@/types/quran';
import { getTranslations, LOCALE_OPTIONS, type Locale } from '@/lib/i18n';

// Language names map (comprehensive)
const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic', en: 'English', fr: 'French', de: 'German', tr: 'Turkish',
  ur: 'Urdu', id: 'Indonesian', ms: 'Malay', es: 'Spanish', zh: 'Chinese',
  ru: 'Russian', fa: 'Persian', hi: 'Hindi', bn: 'Bengali', pt: 'Portuguese',
  it: 'Italian', ja: 'Japanese', ko: 'Korean', th: 'Thai', vi: 'Vietnamese',
  pl: 'Polish', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
  fi: 'Finnish', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian', bg: 'Bulgarian',
  hr: 'Croatian', sr: 'Serbian', bs: 'Bosnian', az: 'Azerbaijani', kk: 'Kazakh',
  uz: 'Uzbek', ku: 'Kurdish', ps: 'Pashto', ml: 'Malayalam', ta: 'Tamil',
  te: 'Telugu', my: 'Burmese', sw: 'Swahili', tl: 'Filipino', am: 'Amharic',
  ha: 'Hausa', sd: 'Sindhi', si: 'Sinhala', so: 'Somali', sq: 'Albanian',
  tg: 'Tajik', sk: 'Slovak', sl: 'Slovenian', mk: 'Macedonian', as: 'Assamese',
  kn: 'Kannada', yo: 'Yoruba', jv: 'Javanese', su: 'Sundanese', ba: 'Bashkir',
  ber: 'Berber', ce: 'Chechen', dv: 'Dhivehi', tt: 'Tatar', ug: 'Uyghur',
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}

interface TranslationEdition {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  format: string;
  type: string;
  direction: string | null;
}

// Fallback data
const FALLBACK_RECITERS: Reciter[] = [
  { identifier: 'ar.alafasy', language: 'ar', name: 'مشاري العفاسي', englishName: 'Mishary Rashid Alafasy', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.abdurrahmaansudais', language: 'ar', name: 'عبد الرحمن السديس', englishName: 'Abdurrahmaan As-Sudais', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.abdulbasitmurattal', language: 'ar', name: 'عبد الباسط عبد الصمد', englishName: 'Abdul Basit (Murattal)', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.husary', language: 'ar', name: 'محمود خليل الحصري', englishName: 'Mahmoud Khalil Al-Husary', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.minshawi', language: 'ar', name: 'محمد صديق المنشاوي', englishName: 'Mohamed Siddiq Al-Minshawi', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.ahmedajamy', language: 'ar', name: 'أحمد العجمي', englishName: 'Ahmed Ibn Ali Al-Ajamy', format: 'audio', type: 'versebyverse', direction: null },
];

const FALLBACK_TRANSLATIONS: TranslationEdition[] = [
  { identifier: 'en.sahih', language: 'en', name: 'Saheeh International', englishName: 'Saheeh International', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.pickthall', language: 'en', name: 'M. M. Pickthall', englishName: 'M. M. Pickthall', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.yusufali', language: 'en', name: 'Abdullah Yusuf Ali', englishName: 'Abdullah Yusuf Ali', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.shakir', language: 'en', name: 'M. H. Shakir', englishName: 'M. H. Shakir', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.daryabadi', language: 'en', name: 'Abdul Majid Daryabadi', englishName: 'Abdul Majid Daryabadi', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.asad', language: 'en', name: 'Muhammad Asad', englishName: 'Muhammad Asad', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'fr.hamidullah', language: 'fr', name: 'Muhammad Hamidullah', englishName: 'Muhammad Hamidullah', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'de.bubenheim', language: 'de', name: 'Frank Bubenheim and Nadeem Elyas', englishName: 'Frank Bubenheim and Nadeem Elyas', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'tr.diyanet', language: 'tr', name: 'Diyanet İşleri', englishName: 'Diyanet Isleri', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'ur.jalandhry', language: 'ur', name: 'Tafsir Jalalayn - Urdu', englishName: 'Tafsir Jalalayn - Urdu', format: 'text', type: 'translation', direction: 'rtl' },
  { identifier: 'id.indonesian', language: 'id', name: 'Bahasa Indonesia', englishName: 'Bahasa Indonesia', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'ms.basmeih', language: 'ms', name: 'Abdullah Basmeih', englishName: 'Abdullah Basmeih', format: 'text', type: 'translation', direction: 'ltr' },
];

type SubtitleMode = 'both' | 'arabic' | 'translation' | 'none';

const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: 'Landscape (16:9)', resolution: '1920×1080' },
  { value: 'portrait', label: 'Portrait (9:16)', resolution: '1080×1920' },
  { value: 'square', label: 'Square (1:1)', resolution: '1080×1080' },
] as const;

const SUBTITLE_MODE_OPTIONS: { value: SubtitleMode; labelKey: string }[] = [
  { value: 'both', labelKey: 'bothSubtitles' },
  { value: 'arabic', labelKey: 'arabicOnly' },
  { value: 'translation', labelKey: 'translationOnly' },
  { value: 'none', labelKey: 'noSubtitles' },
];

// Helper to read localStorage safely (for initial state)
function getLocalStorageValue(key: string, fallback: string = ''): string {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) || fallback;
}

// useSyncExternalStore for mounted state
const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export default function HomePage() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();

  // Settings - initialize from localStorage
  const [pexelsApiKey, setPexelsApiKey] = useState(() => getLocalStorageValue('pexelsApiKey'));
  const [geminiApiKey, setGeminiApiKey] = useState(() => getLocalStorageValue('geminiApiKey'));
  const [settingsOpen, setSettingsOpen] = useState(false);

  // New provider-based settings
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => (getLocalStorageValue('aiProvider', 'gemini') as AIProvider) || 'gemini');
  const [aiModel, setAiModel] = useState<string>(() => getLocalStorageValue('aiModel', 'gemini-2.0-flash') || 'gemini-2.0-flash');
  const [aiApiKey, setAiApiKey] = useState<string>(() => getLocalStorageValue('aiApiKey', ''));
  const [videoSource, setVideoSource] = useState<VideoSource>(() => (getLocalStorageValue('videoSource', 'pexels') as VideoSource) || 'pexels');
  const [videoApiKey, setVideoApiKey] = useState<string>(() => getLocalStorageValue('videoApiKey', ''));

  // Locale / i18n
  const [locale, setLocale] = useState<Locale>(() => (getLocalStorageValue('locale', 'en') as Locale) || 'en');
  const t = getTranslations(locale);
  const isRtl = locale === 'ar' || locale === 'ur' || locale === 'fa';

  // Set document direction for RTL support
  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale, isRtl]);

  // Surah data
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [reciters, setReciters] = useState<Reciter[]>(FALLBACK_RECITERS.sort((a, b) => a.englishName.localeCompare(b.englishName)));
  const [translations, setTranslations] = useState<TranslationEdition[]>(FALLBACK_TRANSLATIONS);
  const [dataLoading, setDataLoading] = useState(true);

  // Form state
  const [selectedSurah, setSelectedSurah] = useState<string>('');
  const [startAyah, setStartAyah] = useState<number>(1);
  const [endAyah, setEndAyah] = useState<number>(7);
  const [selectedReciter, setSelectedReciter] = useState<string>('ar.alafasy');
  const [selectedTranslation, setSelectedTranslation] = useState<string>('en.sahih');
  const [orientation, setOrientation] = useState<string>('landscape');
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>(() => {
    return (getLocalStorageValue('subtitleMode', 'both')) as SubtitleMode;
  });
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>(() => {
    return (getLocalStorageValue('subtitlePosition', 'bottom') as SubtitlePosition) || 'bottom';
  });
  // Text logo overlay
  const [logoText, setLogoText] = useState<string>(() => getLocalStorageValue('logoText', ''));
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(() => {
    return (getLocalStorageValue('logoPosition', 'top-left') as LogoPosition) || 'top-left';
  });

  const updateLogoPosition = useCallback((pos: LogoPosition) => {
    setLogoPosition(pos);
    localStorage.setItem('logoPosition', pos);
  }, []);

  const updateLogoText = useCallback((text: string) => {
    setLogoText(text);
    localStorage.setItem('logoText', text);
  }, []);

  // Preview state
  const [previewData, setPreviewData] = useState<{ arabic: AyahEdition; translated: AyahEdition } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playAyahRef = useRef<(index: number) => void>(() => {});
  // Preview tab + video mock orientation
  const [previewTab, setPreviewTab] = useState<'verse' | 'video'>('verse');
  const [videoPreviewOrientation, setVideoPreviewOrientation] = useState<'portrait' | 'landscape' | 'square'>('landscape');

  // Generation state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [generating, setGenerating] = useState(false);

  // Videos state
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  // Save API keys
  const saveSettings = () => {
    localStorage.setItem('pexelsApiKey', pexelsApiKey);
    localStorage.setItem('geminiApiKey', geminiApiKey);
    localStorage.setItem('aiProvider', aiProvider);
    localStorage.setItem('aiModel', aiModel);
    localStorage.setItem('aiApiKey', aiApiKey);
    localStorage.setItem('videoSource', videoSource);
    localStorage.setItem('videoApiKey', videoApiKey);
    toast.success('Settings saved');
    setSettingsOpen(false);
  };

  // When provider changes, reset model to first model of new provider
  const handleProviderChange = (newProvider: AIProvider) => {
    setAiProvider(newProvider);
    const firstModel = AI_PROVIDER_MODELS[newProvider].models[0];
    setAiModel(firstModel);
    // Clear API key when switching to provider that doesn't need one (ollama)
    if (newProvider === 'ollama') {
      setAiApiKey('');
    }
  };

  // When video source changes, clear API key
  const handleVideoSourceChange = (newSource: VideoSource) => {
    setVideoSource(newSource);
    setVideoApiKey('');
  };

  // Helper to get effective AI API key (from new system or legacy)
  const effectiveAiApiKey = aiApiKey || (aiProvider === 'gemini' ? geminiApiKey : '');
  // Helper to get effective video API key (from new system or legacy)
  const effectiveVideoApiKey = videoApiKey || (videoSource === 'pexels' ? pexelsApiKey : '');

  // Whether AI is configured
  const aiConfigured = aiProvider === 'ollama' || !!effectiveAiApiKey;
  // Whether video source is configured
  const videoConfigured = !!effectiveVideoApiKey;

  // Save subtitle mode to localStorage
  const updateSubtitleMode = useCallback((mode: SubtitleMode) => {
    setSubtitleMode(mode);
    localStorage.setItem('subtitleMode', mode);
  }, []);

  // Save subtitle position to localStorage
  const updateSubtitlePosition = useCallback((position: SubtitlePosition) => {
    setSubtitlePosition(position);
    localStorage.setItem('subtitlePosition', position);
  }, []);

  // Fetch surahs on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setDataLoading(true);
      try {
        const res = await fetch('/api/quran/surahs');
        const data = await res.json();
        if (!cancelled && data.surahs) {
          setSurahs(data.surahs);
          if (data.surahs.length > 0) {
            setSelectedSurah(String(data.surahs[0].number));
            setEndAyah(data.surahs[0].numberOfAyahs);
          }
        }
      } catch (err) {
        console.error('Failed to fetch surahs:', err);
      }
      if (!cancelled) setDataLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Fetch reciters and translations client-side from alquran.cloud
  useEffect(() => {
    let cancelled = false;
    async function fetchEditions() {
      try {
        const [recitersRes, translationsRes] = await Promise.all([
          fetch('https://api.alquran.cloud/v1/edition?format=audio&type=versebyverse'),
          fetch('https://api.alquran.cloud/v1/edition?type=translation'),
        ]);

        if (!cancelled) {
          if (recitersRes.ok) {
            const data = await recitersRes.json();
            if (data.code === 200 && data.data) {
              const arabic = (data.data as Reciter[]).filter(r => r.language === 'ar');
              arabic.sort((a, b) => a.englishName.localeCompare(b.englishName));
              setReciters(arabic);
            }
          }

          if (translationsRes.ok) {
            const data = await translationsRes.json();
            if (data.code === 200 && data.data) {
              const filtered = (data.data as TranslationEdition[]).filter(t => t.language !== 'ar');
              filtered.sort((a, b) => {
                if (a.language === 'en' && b.language !== 'en') return -1;
                if (a.language !== 'en' && b.language === 'en') return 1;
                const langA = getLanguageName(a.language);
                const langB = getLanguageName(b.language);
                const langComp = langA.localeCompare(langB);
                if (langComp !== 0) return langComp;
                return a.englishName.localeCompare(b.englishName);
              });
              setTranslations(filtered);
            }
          }
        }
      } catch {
        if (!cancelled) {
          // Already using fallback from initial state
        }
      }
    }
    fetchEditions();
    return () => { cancelled = true; };
  }, []);

  // Fetch videos on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/videos');
        const data = await res.json();
        if (!cancelled && data.videos) {
          setVideos(data.videos);
        }
      } catch (err) {
        console.error('Failed to fetch videos:', err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Handle surah change via select handler instead of effect
  const handleSurahChange = useCallback((value: string) => {
    setSelectedSurah(value);
    const surahNum = parseInt(value);
    // Find surah data to get numberOfAyahs
    setSurahs(prev => {
      const surah = prev.find(s => s.number === surahNum);
      if (surah) {
        setStartAyah(1);
        setEndAyah(surah.numberOfAyahs);
      }
      return prev;
    });
  }, []);

  // Preview
  const handlePreview = async () => {
    setPreviewLoading(true);
    setCurrentAyahIndex(0);
    try {
      const res = await fetch(
        `/api/quran/ayahs?surah=${selectedSurah}&startAyah=${startAyah}&endAyah=${endAyah}&reciter=${selectedReciter}&translation=${selectedTranslation}`
      );
      const data = await res.json();
      setPreviewData(data);
    } catch (err) {
      toast.error('Failed to fetch preview data');
      console.error(err);
    }
    setPreviewLoading(false);
  };

  // Audio playback
  const playAyah = useCallback((index: number) => {
    if (!previewData?.arabic?.ayahs?.[index]?.audio) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(previewData.arabic.ayahs[index].audio);
    audioRef.current = audio;
    audio.play().catch(console.error);
    setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
      // Auto advance to next ayah
      if (index < (previewData?.arabic?.ayahs?.length || 0) - 1) {
        setCurrentAyahIndex(index + 1);
        playAyahRef.current(index + 1);
      }
    };
  }, [previewData]);

  // Keep ref up to date
  useEffect(() => {
    playAyahRef.current = playAyah;
  }, [playAyah]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else if (previewData?.arabic?.ayahs?.[currentAyahIndex]?.audio) {
      playAyah(currentAyahIndex);
    }
  }, [isPlaying, currentAyahIndex, playAyah, previewData]);

  const navigateAyah = useCallback((direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev'
      ? Math.max(0, currentAyahIndex - 1)
      : Math.min((previewData?.arabic?.ayahs?.length || 1) - 1, currentAyahIndex + 1);
    setCurrentAyahIndex(newIndex);
    if (isPlaying) {
      playAyah(newIndex);
    }
  }, [currentAyahIndex, isPlaying, playAyah, previewData]);

  // Generate video
  const handleGenerate = async () => {
    setGenerating(true);
    setJob(null);
    try {
      const surah = surahs.find(s => s.number === parseInt(selectedSurah));
      const reciterObj = reciters.find(r => r.identifier === selectedReciter);
      const translationObj = translations.find(t => t.identifier === selectedTranslation);
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surah: parseInt(selectedSurah),
          startAyah,
          endAyah,
          reciter: selectedReciter,
          reciterName: reciterObj?.englishName || selectedReciter,
          translation: selectedTranslation,
          translationName: translationObj?.englishName || selectedTranslation,
          surahName: surah ? `${surah.englishName} - ${surah.name}` : `Surah ${selectedSurah}`,
          // New provider-based settings
          aiProvider,
          aiModel,
          aiApiKey: effectiveAiApiKey || undefined,
          videoSource,
          videoApiKey: effectiveVideoApiKey || undefined,
          // Legacy support
          pexelsApiKey: videoSource === 'pexels' ? effectiveVideoApiKey : undefined,
          geminiApiKey: aiProvider === 'gemini' ? effectiveAiApiKey : undefined,
          orientation: orientation as 'landscape' | 'portrait' | 'square',
          showArabic: subtitleMode === 'both' || subtitleMode === 'arabic',
          showTranslation: subtitleMode === 'both' || subtitleMode === 'translation',
          subtitlePosition,
          logoText: logoText.trim() || undefined,
          logoPosition,
        }),
      });
      const data = await res.json();
      if (data.jobId) {
        setJobId(data.jobId);
        toast.success('Video generation started');
      } else {
        toast.error(data.error || 'Failed to start generation');
        setGenerating(false);
      }
    } catch (err) {
      toast.error('Failed to start generation');
      console.error(err);
      setGenerating(false);
    }
  };

  // Poll job status
  useEffect(() => {
    if (!jobId || !generating) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate?id=${jobId}`);
        const data = await res.json();
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') {
          setGenerating(false);
          if (data.status === 'completed') {
            toast.success(t.videoGenerated);
            // Refresh videos
            try {
              const vRes = await fetch('/api/videos');
              const vData = await vRes.json();
              if (vData.videos) setVideos(vData.videos);
            } catch { /* ignore */ }
          } else {
            toast.error(`Generation failed: ${data.error || 'Unknown error'}`);
          }
          clearInterval(interval);
        }
      } catch {
        console.error('Failed to poll job status');
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, generating]);

  // Delete video
  const handleDeleteVideo = async (id: string) => {
    try {
      await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      toast.success('Video deleted');
      // Refresh videos
      const res = await fetch('/api/videos');
      const data = await res.json();
      if (data.videos) setVideos(data.videos);
    } catch {
      toast.error('Failed to delete video');
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Get aspect ratio string from orientation
  const getAspectRatioLabel = (orientation?: string): string => {
    if (!orientation) return '';
    switch (orientation) {
      case 'landscape': return '16:9';
      case 'portrait': return '9:16';
      case 'square': return '1:1';
      default: return '';
    }
  };

  // Format orientation with aspect ratio
  const formatOrientation = (orientation?: string): string => {
    if (!orientation) return '';
    const ratio = getAspectRatioLabel(orientation);
    const label = orientation.charAt(0).toUpperCase() + orientation.slice(1);
    return ratio ? `${label} • ${ratio}` : label;
  };

  // Handle video download
  const handleDownloadVideo = async (videoId: string, surahName?: string) => {
    try {
      const response = await fetch(`/api/videos/${videoId}`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${surahName || 'quran-video'}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch {
      toast.error('Failed to download video');
    }
  };

  // Get current surah
  const currentSurah = surahs.find(s => s.number === parseInt(selectedSurah));

  // Generation steps
  const generationSteps = [
    { key: 'fetching_verses', labelKey: 'fetchingVerses', icon: BookOpen },
    { key: 'extracting_concepts', labelKey: 'extractingConcepts', icon: Sparkles },
    { key: 'searching_videos', labelKey: 'searchingVideos', icon: Film },
    { key: 'downloading_clips', labelKey: 'downloadingClips', icon: Download },
    { key: 'generating_subtitles', labelKey: 'generatingSubtitles', icon: Volume2 },
    { key: 'rendering_video', labelKey: 'renderingVideo', icon: Video },
  ];

  const getStepStatus = (stepKey: string, jobStatus: string) => {
    const stepIndex = generationSteps.findIndex(s => s.key === stepKey);
    const currentIndex = generationSteps.findIndex(s => s.key === jobStatus);
    if (jobStatus === 'completed') return 'completed';
    if (jobStatus === 'failed') return currentIndex === stepIndex ? 'failed' : (stepIndex < currentIndex ? 'completed' : 'pending');
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  // Group translations by language
  const groupedTranslations = useMemo(() => {
    const groups: Record<string, TranslationEdition[]> = {};
    for (const t of translations) {
      const langName = getLanguageName(t.language);
      if (!groups[langName]) groups[langName] = [];
      groups[langName].push(t);
    }
    return groups;
  }, [translations]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm shrink-0">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-bold tracking-tight">{t.appName}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={videoConfigured ? "default" : "secondary"}
                className={`hidden sm:flex gap-1.5 ${videoConfigured ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              >
                {videoConfigured ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {VIDEO_SOURCES[videoSource].label}
              </Badge>
              <Badge
                variant={aiConfigured ? "default" : "secondary"}
                className={`hidden sm:flex gap-1.5 ${aiConfigured ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              >
                {aiConfigured ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {AI_PROVIDER_MODELS[aiProvider].label}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="cursor-pointer"
                aria-label="GitHub"
              >
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  <Code2 className="h-5 w-5" />
                </a>
              </Button>
              <Select value={locale} onValueChange={(v) => { setLocale(v as Locale); localStorage.setItem('locale', v); }}>
                <SelectTrigger className="cursor-pointer w-auto gap-1.5 border-0 shadow-none h-9 px-2" aria-label="Language">
                  <Globe className="h-4 w-4" />
                  <span className="text-xs font-medium hidden sm:inline">{LOCALE_OPTIONS.find(l => l.code === locale)?.flag}</span>
                </SelectTrigger>
                <SelectContent>
                  {LOCALE_OPTIONS.map(l => (
                    <SelectItem key={l.code} value={l.code} className="cursor-pointer">
                      {l.flag} {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="cursor-pointer"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="cursor-pointer" aria-label="Settings">
                    <Settings className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px] gap-0">
                  <DialogHeader className="pb-3">
                    <DialogTitle className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                        <Settings className="h-4 w-4" />
                      </div>
                      {t.apiSettings}
                    </DialogTitle>
                    <DialogDescription>{t.apiSettingsDesc}</DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-1">
                    {/* AI Provider Card */}
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Sparkles className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold leading-tight">{t.aiProvider}</h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {AI_PROVIDER_MODELS[aiProvider].label}
                              {aiProvider === 'openrouter' && ' · Free models'}
                              {aiProvider === 'ollama' && ' · Local'}
                            </p>
                          </div>
                        </div>
                        {aiConfigured ? (
                          <Badge className="bg-emerald-600 text-white text-xs shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" />{t.connected}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs shrink-0"><XCircle className="h-3 w-3 mr-1" />{t.notSet}</Badge>
                        )}
                      </div>

                      <div className="grid gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-provider" className="text-xs text-muted-foreground">{t.aiProvider}</Label>
                          <Select value={aiProvider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
                            <SelectTrigger id="ai-provider" className="cursor-pointer">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(AI_PROVIDER_MODELS) as AIProvider[]).map(p => (
                                <SelectItem key={p} value={p} className="cursor-pointer">
                                  <span className="flex items-center gap-2">
                                    {AI_PROVIDER_MODELS[p].label}
                                    {p === 'openrouter' && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Free</Badge>}
                                    {p === 'ollama' && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Local</Badge>}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="ai-model" className="text-xs text-muted-foreground">{t.aiModel}</Label>
                          <Select value={aiModel} onValueChange={setAiModel}>
                            <SelectTrigger id="ai-model" className="cursor-pointer font-mono text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-60">
                                {AI_PROVIDER_MODELS[aiProvider].models.map(m => (
                                  <SelectItem key={m} value={m} className="cursor-pointer font-mono text-xs">{m}</SelectItem>
                                ))}
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                        </div>

                        {AI_PROVIDER_MODELS[aiProvider].requiresKey && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="ai-api-key" className="text-xs text-muted-foreground">{t.aiApiKey}</Label>
                              {effectiveAiApiKey ? (
                                <Badge className="bg-emerald-600 text-white text-[10px] h-5"><CheckCircle2 className="h-3 w-3 mr-1" />{t.connected}</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] h-5"><XCircle className="h-3 w-3 mr-1" />{t.notSet}</Badge>
                              )}
                            </div>
                            <Input
                              id="ai-api-key"
                              type="password"
                              placeholder={AI_PROVIDER_MODELS[aiProvider].keyLabel}
                              value={aiApiKey}
                              onChange={e => setAiApiKey(e.target.value)}
                              className="font-mono text-sm"
                            />
                            <a
                              href={AI_PROVIDER_MODELS[aiProvider].keyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t.getApiKey}
                            </a>
                          </div>
                        )}

                        {aiProvider === 'ollama' && (
                          <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-2.5 text-xs text-blue-700 dark:text-blue-300">
                            <Info className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>Local Ollama runs on <span className="font-mono">http://localhost:11434</span> — no API key required.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Video Source Card */}
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Film className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold leading-tight">{t.videoSource}</h3>
                            <p className="text-xs text-muted-foreground truncate">{VIDEO_SOURCES[videoSource].label}</p>
                          </div>
                        </div>
                        {videoConfigured ? (
                          <Badge className="bg-emerald-600 text-white text-xs shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" />{t.connected}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs shrink-0"><XCircle className="h-3 w-3 mr-1" />{t.notSet}</Badge>
                        )}
                      </div>

                      <div className="grid gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="video-source" className="text-xs text-muted-foreground">{t.videoSource}</Label>
                          <Select value={videoSource} onValueChange={(v) => handleVideoSourceChange(v as VideoSource)}>
                            <SelectTrigger id="video-source" className="cursor-pointer">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(VIDEO_SOURCES) as VideoSource[]).map(s => (
                                <SelectItem key={s} value={s} className="cursor-pointer">{VIDEO_SOURCES[s].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="video-api-key" className="text-xs text-muted-foreground">{t.videoApiKey}</Label>
                            {effectiveVideoApiKey ? (
                              <Badge className="bg-emerald-600 text-white text-[10px] h-5"><CheckCircle2 className="h-3 w-3 mr-1" />{t.connected}</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] h-5"><XCircle className="h-3 w-3 mr-1" />{t.notSet}</Badge>
                            )}
                          </div>
                          <Input
                            id="video-api-key"
                            type="password"
                            placeholder={VIDEO_SOURCES[videoSource].keyLabel}
                            value={videoApiKey}
                            onChange={e => setVideoApiKey(e.target.value)}
                            className="font-mono text-sm"
                          />
                          <a
                            href={VIDEO_SOURCES[videoSource].keyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t.getApiKey}
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0 pt-4">
                    <Button onClick={saveSettings} className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white w-full h-10">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {t.saveSettings}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                      <Info className="h-3 w-3" />
                      Settings are stored locally in your browser only.
                    </p>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <Tabs defaultValue="create" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
            <TabsTrigger value="create" className="cursor-pointer gap-1.5">
              <PlusCircle className="h-4 w-4" />
              {t.createVideo}
            </TabsTrigger>
            <TabsTrigger value="videos" className="cursor-pointer gap-1.5">
              <FolderOpen className="h-4 w-4" />
              {t.myVideos}
            </TabsTrigger>
          </TabsList>

          {/* Create Video Tab */}
          <TabsContent value="create" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Step 1: Select Verses */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-emerald-600" />
                    {t.selectVerses}
                  </CardTitle>
                  <CardDescription>{t.selectVersesDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Surah */}
                  <div className="space-y-2">
                    <Label>{t.surah}</Label>
                    <Select value={selectedSurah} onValueChange={handleSurahChange}>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder={t.surah} />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-72">
                          {dataLoading ? (
                            <div className="p-4 text-center">
                              <Loader2 className="h-5 w-5 animate-spin mx-auto text-emerald-600" />
                            </div>
                          ) : (
                            surahs.map(s => (
                              <SelectItem key={s.number} value={String(s.number)} className="cursor-pointer">
                                {s.number}. {s.englishName} ({s.name})
                              </SelectItem>
                            ))
                          )}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Ayah Range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t.startAyah}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={currentSurah?.numberOfAyahs || 286}
                        value={startAyah}
                        onChange={e => setStartAyah(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.endAyah}</Label>
                      <Input
                        type="number"
                        min={startAyah}
                        max={currentSurah?.numberOfAyahs || 286}
                        value={endAyah}
                        onChange={e => setEndAyah(Math.min(currentSurah?.numberOfAyahs || 286, parseInt(e.target.value) || 1))}
                      />
                    </div>
                  </div>

                  {/* Reciter */}
                  <div className="space-y-2">
                    <Label>{t.reciter}</Label>
                    <Select value={selectedReciter} onValueChange={setSelectedReciter}>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder={t.reciter} />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-72">
                          {reciters.map(r => (
                            <SelectItem key={r.identifier} value={r.identifier} className="cursor-pointer">
                              {r.englishName}
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Translation */}
                  <div className="space-y-2">
                    <Label>{t.translation}</Label>
                    <Select value={selectedTranslation} onValueChange={setSelectedTranslation}>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder={t.translation} />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-72">
                          {Object.entries(groupedTranslations).map(([langName, editions]) => (
                            <SelectGroup key={langName}>
                              <SelectLabel className="text-xs font-semibold text-muted-foreground">
                                {langName}
                              </SelectLabel>
                              {editions.map(te => (
                                <SelectItem key={te.identifier} value={te.identifier} className="cursor-pointer">
                                  {te.englishName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Orientation */}
                  <div className="space-y-2">
                    <Label>{t.videoOrientation}</Label>
                    <Select value={orientation} onValueChange={setOrientation}>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORIENTATION_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="cursor-pointer">
                            {t[opt.value]} ({opt.resolution})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Subtitle Visibility */}
                  <div className="space-y-2">
                    <Label>{t.subtitleVisibility}</Label>
                    <Select value={subtitleMode} onValueChange={(v) => updateSubtitleMode(v as SubtitleMode)}>
                      <SelectTrigger className="cursor-pointer w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBTITLE_MODE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="cursor-pointer">
                            {(t as Record<string, string>)[opt.labelKey]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Subtitle Position */}
                  <div className="space-y-2">
                    <Label>{t.subtitlePosition}</Label>
                    <Select
                      value={subtitlePosition}
                      onValueChange={(v) => updateSubtitlePosition(v as SubtitlePosition)}
                      disabled={subtitleMode === 'none'}
                    >
                      <SelectTrigger className="cursor-pointer w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom" className="cursor-pointer">{t.positionBottom}</SelectItem>
                        <SelectItem value="center" className="cursor-pointer">{t.positionCenter}</SelectItem>
                        <SelectItem value="top" className="cursor-pointer">{t.positionTop}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Logo Text */}
                  <div className="space-y-2">
                    <Label htmlFor="logo-text">{t.logoText}</Label>
                    <Input
                      id="logo-text"
                      type="text"
                      maxLength={60}
                      placeholder={t.logoTextPlaceholder}
                      value={logoText}
                      onChange={e => updateLogoText(e.target.value)}
                      className="cursor-text"
                    />
                  </div>

                  {/* Logo Position */}
                  <div className="space-y-2">
                    <Label>{t.logoPosition}</Label>
                    <Select
                      value={logoPosition}
                      onValueChange={(v) => updateLogoPosition(v as LogoPosition)}
                      disabled={!logoText.trim()}
                    >
                      <SelectTrigger className="cursor-pointer w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top-left" className="cursor-pointer">{t.logoPositionTopLeft}</SelectItem>
                        <SelectItem value="top-center" className="cursor-pointer">{t.logoPositionTopCenter}</SelectItem>
                        <SelectItem value="top-right" className="cursor-pointer">{t.logoPositionTopRight}</SelectItem>
                        <SelectItem value="bottom-left" className="cursor-pointer">{t.logoPositionBottomLeft}</SelectItem>
                        <SelectItem value="bottom-center" className="cursor-pointer">{t.logoPositionBottomCenter}</SelectItem>
                        <SelectItem value="bottom-right" className="cursor-pointer">{t.logoPositionBottomRight}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handlePreview}
                      disabled={previewLoading || !selectedSurah}
                      className="cursor-pointer flex-1"
                    >
                      {previewLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Eye className="h-4 w-4 mr-2" />
                      )}
                      {t.preview}
                    </Button>
                    <Button
                      onClick={handleGenerate}
                      disabled={generating || !selectedSurah}
                      className="cursor-pointer flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Video className="h-4 w-4 mr-2" />
                      )}
                      {t.generateVideo}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Step 2: Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-5 w-5 text-emerald-600" />
                    {t.preview}
                  </CardTitle>
                  <CardDescription>{t.previewDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={previewTab} onValueChange={(v) => {
                    setPreviewTab(v as 'verse' | 'video');
                    if (v === 'video') {
                      setVideoPreviewOrientation((orientation || 'landscape') as 'portrait' | 'landscape' | 'square');
                    }
                  }}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="verse" className="cursor-pointer gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" />
                        {t.versePreview}
                      </TabsTrigger>
                      <TabsTrigger value="video" className="cursor-pointer gap-1.5">
                        <Film className="h-3.5 w-3.5" />
                        {t.videoPreviewTab}
                      </TabsTrigger>
                    </TabsList>

                    {/* Verse Preview Tab */}
                    <TabsContent value="verse" className="mt-0">
                      {!previewData ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <BookOpen className="h-12 w-12 mb-3 opacity-30" />
                          <p className="text-sm">{t.previewPlaceholder}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col min-h-[320px]">
                          {/* Ayah display */}
                          <ScrollArea className="flex-1 h-64">
                            <div className="space-y-3 pr-3">
                              {previewData.arabic.ayahs.map((ayah, i) => (
                                <div
                                  key={ayah.numberInSurah}
                                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                                    i === currentAyahIndex ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-border'
                                  }`}
                                  onClick={() => setCurrentAyahIndex(i)}
                                >
                                  <div className="flex items-start gap-2">
                                    <Badge variant="outline" className="text-xs shrink-0 mt-1">
                                      {ayah.numberInSurah}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                      {subtitleMode !== 'translation' && subtitleMode !== 'none' && (
                                        <p className="text-right text-lg font-arabic leading-relaxed break-words overflow-wrap-anywhere" dir="rtl">
                                          {ayah.text}
                                        </p>
                                      )}
                                      {subtitleMode !== 'arabic' && subtitleMode !== 'none' && previewData.translated.ayahs[i] && (
                                        <p className="text-sm text-muted-foreground mt-1 break-words overflow-wrap-anywhere">
                                          {previewData.translated.ayahs[i].text}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>

                          {/* Audio controls - pinned to bottom */}
                          {previewData.arabic.ayahs[currentAyahIndex]?.audio && (
                            <div className="flex items-center justify-center gap-3 pt-4 mt-auto">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => navigateAyah('prev')}
                                disabled={currentAyahIndex === 0}
                                className="cursor-pointer"
                              >
                                <SkipBack className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={togglePlayPause}
                                className="cursor-pointer h-10 w-10"
                              >
                                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => navigateAyah('next')}
                                disabled={currentAyahIndex === (previewData.arabic.ayahs.length - 1)}
                                className="cursor-pointer"
                              >
                                <SkipForward className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          <div className="text-center text-xs text-muted-foreground mt-2">
                            {t.ayah} {currentAyahIndex + 1} {t.ayahOf} {previewData.arabic.ayahs.length}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* Video Preview Tab (mock) */}
                    <TabsContent value="video" className="mt-0">
                      {!previewData ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Film className="h-12 w-12 mb-3 opacity-30" />
                          <p className="text-sm">{t.noPreviewYet}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {/* Orientation tabs */}
                          <div className="flex items-center justify-center gap-1 p-1 bg-muted rounded-lg self-center">
                            {(['portrait', 'landscape', 'square'] as const).map(o => (
                              <button
                                key={o}
                                type="button"
                                onClick={() => setVideoPreviewOrientation(o)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                                  videoPreviewOrientation === o
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {o === 'portrait' && t.portraitShort}
                                {o === 'landscape' && t.landscapeShort}
                                {o === 'square' && t.squareShort}
                              </button>
                            ))}
                          </div>

                          {/* Mock video frame */}
                          <div className="flex justify-center">
                            <div
                              className={`relative rounded-lg overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border border-border/50 shadow-lg ${
                                videoPreviewOrientation === 'portrait' ? 'w-full max-w-[220px] aspect-[9/16]'
                                : videoPreviewOrientation === 'square' ? 'w-full max-w-[300px] aspect-square'
                                : 'w-full aspect-video'
                              }`}
                            >
                              {/* Decorative scenery overlay (simulated video background) */}
                              <div className="absolute inset-0 opacity-30 pointer-events-none">
                                <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-emerald-800/40 to-transparent" />
                                <div className="absolute top-1/4 right-1/4 h-16 w-16 rounded-full bg-amber-200/20 blur-xl" />
                              </div>

                              {/* Center play icon (decorative video indicator) */}
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                  <Play className="h-5 w-5 text-white/70 fill-white/70 ml-0.5" />
                                </div>
                              </div>

                              {/* User text logo — positioned dynamically based on logoPosition */}
                              {logoText.trim() && (
                                <div
                                  className={`absolute px-2 py-1 rounded bg-black/40 backdrop-blur-sm max-w-[70%] ${
                                    logoPosition === 'top-left' ? 'top-2 left-2'
                                    : logoPosition === 'top-center' ? 'top-2 left-1/2 -translate-x-1/2'
                                    : logoPosition === 'top-right' ? 'top-2 right-2'
                                    : logoPosition === 'bottom-left' ? 'bottom-2 left-2'
                                    : logoPosition === 'bottom-center' ? 'bottom-2 left-1/2 -translate-x-1/2'
                                    : 'bottom-2 right-2'
                                  }`}
                                >
                                  <span className="text-[10px] font-semibold text-white/90 leading-none truncate block">{logoText.trim()}</span>
                                </div>
                              )}

                              {/* Orientation badge (hidden when logo occupies top-right to avoid overlap) */}
                              {!(logoText.trim() && logoPosition === 'top-right') && (
                                <div className="absolute top-2 right-2">
                                  <Badge className="text-[10px] bg-black/50 text-white border-0 backdrop-blur-sm" variant="secondary">
                                    {videoPreviewOrientation === 'portrait' && '9:16'}
                                    {videoPreviewOrientation === 'landscape' && '16:9'}
                                    {videoPreviewOrientation === 'square' && '1:1'}
                                  </Badge>
                                </div>
                              )}

                              {/* Subtitles */}
                              {subtitleMode !== 'none' && (
                                <div
                                  className={`absolute inset-x-0 px-3 flex flex-col items-center gap-1 text-center ${
                                    subtitlePosition === 'top' ? 'top-3'
                                    : subtitlePosition === 'center' ? 'top-1/2 -translate-y-1/2'
                                    : 'bottom-3'
                                  }`}
                                >
                                  {subtitleMode !== 'translation' && (
                                    <p
                                      className="font-arabic text-white leading-snug break-words overflow-wrap-anywhere"
                                      style={{
                                        fontSize: videoPreviewOrientation === 'portrait' ? '0.95rem' : videoPreviewOrientation === 'square' ? '1.05rem' : '1.15rem',
                                        textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
                                        maxWidth: '95%',
                                      }}
                                      dir="rtl"
                                    >
                                      {previewData.arabic.ayahs[currentAyahIndex]?.text}
                                    </p>
                                  )}
                                  {subtitleMode !== 'arabic' && previewData.translated.ayahs[currentAyahIndex]?.text && (
                                    <p
                                      className="text-white/85 leading-snug break-words overflow-wrap-anywhere"
                                      style={{
                                        fontSize: videoPreviewOrientation === 'portrait' ? '0.65rem' : '0.75rem',
                                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                                        maxWidth: '95%',
                                      }}
                                    >
                                      {previewData.translated.ayahs[currentAyahIndex].text}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Note */}
                          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            {t.videoPreviewNote}
                          </p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* Step 3: Generation Progress */}
            {(generating || job) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="h-5 w-5 text-emerald-600" />
                    {t.generationProgress}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{job?.message || 'Starting...'}</span>
                      <span>{job?.progress || 0}%</span>
                    </div>
                    <Progress value={job?.progress || 0} className="h-2" />
                  </div>

                  {/* Steps */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {generationSteps.map((step) => {
                      const status = getStepStatus(step.key, job?.status || 'pending');
                      return (
                        <div
                          key={step.key}
                          className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center ${
                            status === 'active'
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                              : status === 'completed'
                              ? 'border-green-200 bg-green-50 dark:bg-green-950/20'
                              : status === 'failed'
                              ? 'border-red-200 bg-red-50 dark:bg-red-950/20'
                              : 'border-border'
                          }`}
                        >
                          {status === 'active' ? (
                            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                          ) : status === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : status === 'failed' ? (
                            <XCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <step.icon className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className="text-xs">{(t as Record<string, string>)[step.labelKey]}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Error display */}
                  {job?.status === 'failed' && job.error && (
                    <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">{t.generationFailed}</p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{job.error}</p>
                      </div>
                    </div>
                  )}

                  {/* Completed result */}
                  {job?.status === 'completed' && job.result && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{t.videoGenerated}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.duration}: {formatDuration(job.result.duration)} | {t.size}: {formatFileSize(job.result.fileSize)} | {t.clips}: {job.result.clipCount}
                            {orientation && ` | ${formatOrientation(orientation)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleDownloadVideo(job.id, job.config.surahName)}
                          variant="outline"
                          className="cursor-pointer"
                        >
                          <Download className="h-4 w-4 mr-1" /> {t.download}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setPlayingVideoId(job.id)}
                          className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Play className="h-4 w-4 mr-1" /> {t.play}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* My Videos Tab */}
          <TabsContent value="videos" className="space-y-0">
            {videos.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Video className="h-16 w-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">{t.noVideos}</p>
                  <p className="text-sm">{t.noVideosDesc}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {videos.map(video => {
                  return (
                    <Card key={video.id} className="overflow-hidden group py-0 flex flex-col">
                      {/* Video Thumbnail — uniform 16:9 container; video cropped with object-cover so all cards align */}
                      <div
                        className="relative bg-black cursor-pointer aspect-video shrink-0 overflow-hidden"
                        onClick={() => setPlayingVideoId(video.id)}
                      >
                        <video
                          src={`/api/videos/${video.id}`}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] group-hover:brightness-75 transition-all duration-200"
                          muted
                          preload="metadata"
                          onMouseEnter={(e) => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
                          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                          <div className="bg-black/50 rounded-full p-3 ring-1 ring-white/20">
                            <Play className="h-6 w-6 text-white" />
                          </div>
                        </div>
                        {video.orientation && (
                          <Badge className="absolute top-2 right-2 text-xs bg-black/70 text-white border-0 backdrop-blur-sm" variant="secondary">
                            {formatOrientation(video.orientation)}
                          </Badge>
                        )}
                        <div className="absolute bottom-2 right-2">
                          <Badge className="text-xs bg-black/70 text-white border-0 backdrop-blur-sm" variant="secondary">
                            {formatDuration(video.duration)}
                          </Badge>
                        </div>
                      </div>
                      <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
                        <h3 className="font-semibold text-sm leading-tight line-clamp-2">{video.surahName}</h3>
                        <p className="text-xs text-muted-foreground">
                          {t.ayah} {video.startAyah} - {video.endAyah}
                        </p>
                        {video.reciterName && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Volume2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{video.reciterName}</span>
                          </div>
                        )}
                        {video.translationName && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <BookOpen className="h-3 w-3 shrink-0" />
                            <span className="truncate">{video.translationName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                          <span>{formatFileSize(video.fileSize)}</span>
                          {video.createdAt && (
                            <>
                              <span>•</span>
                              <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-2 mt-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPlayingVideoId(video.id)}
                            className="cursor-pointer flex-1 min-h-[36px]"
                          >
                            <Play className="h-3 w-3 mr-1" /> {t.play}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadVideo(video.id, video.surahName)}
                            className="cursor-pointer min-h-[36px]"
                            title={t.download}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 min-h-[36px]">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t.deleteVideo}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t.deleteConfirm}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="cursor-pointer">{t.cancel}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteVideo(video.id)}
                                  className="cursor-pointer bg-red-600 hover:bg-red-700"
                                >
                                  {t.delete}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Video Player Dialog */}
      <Dialog open={!!playingVideoId} onOpenChange={(open) => { if (!open) setPlayingVideoId(null); }}>
        <DialogContent
          className={[
            // Constrain modal to viewport height, use flex column so header/footer stay pinned
            'max-h-[92vh] flex flex-col gap-3 p-3 sm:p-4 overflow-hidden',
            // Width adapts to orientation, but never overflows the viewport
            'w-full max-w-[calc(100vw-1.5rem)]',
            (() => {
              const playingVideo = videos.find(v => v.id === playingVideoId);
              if (playingVideo?.orientation === 'portrait') return 'sm:max-w-[420px]';
              if (playingVideo?.orientation === 'square') return 'sm:max-w-[640px]';
              return 'sm:max-w-5xl';
            })(),
            // Enhance the default close button so it's always visible over the video
            '[&_[data-slot=dialog-close]]:top-2.5 [&_[data-slot=dialog-close]]:right-2.5',
            '[&_[data-slot=dialog-close]]:z-20 [&_[data-slot=dialog-close]]:size-8',
            '[&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-white/20',
            '[&_[data-slot=dialog-close]]:bg-black/60 [&_[data-slot=dialog-close]]:text-white',
            '[&_[data-slot=dialog-close]]:backdrop-blur-sm [&_[data-slot=dialog-close]]:opacity-100',
            '[&_[data-slot=dialog-close]]:hover:bg-black/80 [&_[data-slot=dialog-close]]:hover:opacity-100',
            '[&_[data-slot=dialog-close]]:shadow-lg',
          ].join(' ')}
        >
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Film className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="truncate">
                {(() => {
                  const playingVideo = videos.find(v => v.id === playingVideoId);
                  return playingVideo?.surahName || t.videoPlayer;
                })()}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Video player with playback controls and download option
            </DialogDescription>
          </DialogHeader>
          {playingVideoId && (
            // Video stage: scrollable if needed, video sized to fit within ~72vh while keeping aspect ratio
            <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-lg bg-black">
              <video
                key={playingVideoId}
                src={`/api/videos/${playingVideoId}`}
                controls
                autoPlay
                className="block max-h-[72vh] max-w-full w-auto h-auto object-contain"
              />
            </div>
          )}
          {playingVideoId && (() => {
            const playingVideo = videos.find(v => v.id === playingVideoId);
            return (
              <div className="shrink-0 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  {playingVideo && (
                    <>
                      <span>{t.ayah} {playingVideo.startAyah} - {playingVideo.endAyah}</span>
                      {playingVideo.orientation && (
                        <Badge variant="secondary" className="text-xs">{formatOrientation(playingVideo.orientation)}</Badge>
                      )}
                      <span>{formatDuration(playingVideo?.duration || 0)}</span>
                      <span className="hidden sm:inline">{formatFileSize(playingVideo?.fileSize || 0)}</span>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadVideo(playingVideoId, playingVideo?.surahName)}
                  className="cursor-pointer shrink-0"
                >
                  <Download className="h-4 w-4 mr-1" /> {t.download}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t bg-background mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {t.footerText}
              </p>
            <div className="flex items-center gap-2">
              <a
                href="https://ikhlasly.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                Powered by ikhlasly.com
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
