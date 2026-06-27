import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { GenerationJob, GenerationConfig, GenerationResult, VideoInfo, VisualConcept, PexelsVideo, PexelsVideoFile, AIProvider } from '@/types/quran';
import { VIDEO_SOURCES } from '@/types/quran';
import { ensureStorageDirs, ensureJobDir, getRenderPath, cleanupJobDir, STORAGE_PATHS, readJsonFile, writeJsonFile } from '@/lib/storage';
import { getAyahs, getSurahs } from '@/lib/quran-api';
import {
  downloadFile,
  generateASS,
  generateCombinedASS,
  generateLogoASS,
  renderVideo,
  renderVideoWithoutAudio,
  getAudioDuration,
  concatenateAudio,
  generateBackgroundVideo,
  type Orientation,
  ORIENTATION_PRESETS,
} from '@/lib/ffmpeg';

// In-memory job store (also persisted to disk)
const jobs = new Map<string, GenerationJob>();

// Initialize
ensureStorageDirs();

// Load existing jobs from disk
function loadJobs(): void {
  const saved = readJsonFile<GenerationJob[]>(STORAGE_PATHS.jobsFile);
  if (saved) {
    for (const job of saved) {
      jobs.set(job.id, job);
    }
  }
}

function saveJobs(): void {
  writeJsonFile(STORAGE_PATHS.jobsFile, Array.from(jobs.values()));
}

loadJobs();

function updateJob(job: GenerationJob): void {
  job.updatedAt = new Date().toISOString();
  jobs.set(job.id, job);
  saveJobs();
}

// Extract visual concepts using AI provider
interface AIProviderEndpoint {
  url: string;
  headers: Record<string, string>;
  body: (prompt: string) => unknown;
  parse: (data: Record<string, unknown>) => string;
}

function getProviderEndpoint(provider: AIProvider, model: string, apiKey: string): AIProviderEndpoint {
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
      body: (prompt) => ({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      parse: (data) => {
        const candidates = data?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
        return candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      },
    };
  }

  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: (prompt) => ({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      parse: (data) => {
        const content = data?.content as Array<{ type: string; text?: string }> | undefined;
        return content?.[0]?.text || '[]';
      },
    };
  }

  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    glm: 'https://open.bigmodel.cn/api/paas/v4',
    openrouter: 'https://openrouter.ai/api/v1',
    ollama: 'http://localhost:11434/v1',
  };

  const baseUrl = baseUrls[provider] || baseUrls.openai;

  return {
    url: `${baseUrl}/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      ...(provider === 'ollama' ? {} : { Authorization: `Bearer ${apiKey}` }),
    },
    body: (prompt) => ({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
    parse: (data) => {
      const choices = data?.choices as Array<{ message?: { content?: string } }> | undefined;
      return choices?.[0]?.message?.content || '[]';
    },
  };
}

async function extractConceptsWithAI(
  ayahTexts: string[],
  provider: AIProvider,
  model: string,
  apiKey: string
): Promise<VisualConcept[]> {
  try {
    const prompt = `You are an expert at extracting visual concepts from Quran verses for video generation.

Given these Quran verses (Arabic text), extract 3-5 visual concepts that could be used as search queries for stock video clips. Focus on nature, landscapes, celestial objects, water, light, and other visual elements mentioned in the verses.

Verses:
${ayahTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Respond with a JSON array of objects, each with:
- "concept": a brief description of the visual concept
- "searchQuery": a search query (1-3 words, in English)
- "ayahReferences": array of verse numbers (1-based index) that relate to this concept

Only respond with the JSON array, nothing else.`;

    const endpoint = getProviderEndpoint(provider, model, apiKey);

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: JSON.stringify(endpoint.body(prompt)),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
    }

    const data = await response.json();
    const content = endpoint.parse(data);

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as VisualConcept[];
    }
    return [];
  } catch (err) {
    console.error(`AI concept extraction failed (${provider}/${model}):`, err);
    throw err;
  }
}

function generateFallbackConcepts(ayahTexts: string[]): VisualConcept[] {
  const queries = ['nature', 'sunset', 'ocean', 'mountains', 'sky', 'stars', 'river', 'forest', 'desert', 'clouds'];
  const concepts: VisualConcept[] = [];
  const usedQueries = new Set<string>();

  for (let i = 0; i < Math.min(5, ayahTexts.length); i++) {
    const queryIdx = i % queries.length;
    const query = queries[queryIdx];
    if (!usedQueries.has(query)) {
      usedQueries.add(query);
      concepts.push({
        concept: `Visual theme for verses`,
        searchQuery: query,
        ayahReferences: [i + 1],
      });
    }
  }

  if (concepts.length === 0) {
    concepts.push({
      concept: 'Nature landscape',
      searchQuery: 'nature',
      ayahReferences: [1],
    });
  }

  return concepts;
}

// Search Pexels for videos
async function searchPexelsVideos(
  query: string,
  apiKey: string,
  orientation: string = 'landscape',
  perPage: number = 10
): Promise<string[]> {
  try {
    const orientParam = orientation === 'portrait' ? 'portrait' : (orientation === 'square' ? 'square' : 'landscape');
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientParam}&size=medium`,
      { headers: { Authorization: apiKey } }
    );
    const data = await res.json();
    const videos: PexelsVideo[] = data.videos || [];
    return videos.map(v => {
      const bestFile = selectBestVideoFile(v, orientation as Orientation);
      return bestFile?.link || '';
    }).filter(Boolean);
  } catch (err) {
    console.error('Pexels search failed:', err);
    return [];
  }
}

// Search Pixabay for videos
async function searchPixabayVideos(
  query: string,
  apiKey: string,
  orientation: string = 'landscape',
  perPage: number = 10
): Promise<string[]> {
  try {
    const orientParam = orientation === 'portrait' ? 'vertical' : 'horizontal';
    const res = await fetch(
      `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientParam}&video_type=film`,
    );
    const data = await res.json();
    const hits = data.hits || [];
    return hits.map((hit: { videos: Record<string, { url: string }> }) => {
      // Prefer medium quality, fallback to small, then large
      const video = hit.videos?.medium || hit.videos?.small || hit.videos?.large;
      return video?.url || '';
    }).filter(Boolean);
  } catch (err) {
    console.error('Pixabay search failed:', err);
    return [];
  }
}

// Search videos from the configured source
async function searchVideos(
  query: string,
  source: 'pexels' | 'pixabay',
  apiKey: string,
  orientation: string = 'landscape',
  perPage: number = 10
): Promise<string[]> {
  if (source === 'pixabay') {
    return searchPixabayVideos(query, apiKey, orientation, perPage);
  }
  return searchPexelsVideos(query, apiKey, orientation, perPage);
}

function selectBestVideoFile(
  video: PexelsVideo,
  orientation: Orientation
): PexelsVideoFile | null {
  const preset = ORIENTATION_PRESETS[orientation];
  // Prefer files that match target aspect ratio
  const targetRatio = preset.width / preset.height;
  let best: PexelsVideoFile | null = null;
  let bestDiff = Infinity;

  for (const file of video.video_files) {
    if (file.file_type !== 'video/mp4') continue;
    const fileRatio = file.width / file.height;
    const diff = Math.abs(fileRatio - targetRatio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = file;
    }
  }

  // Fallback to any mp4
  if (!best) {
    best = video.video_files.find(f => f.file_type === 'video/mp4') || null;
  }

  // Fallback to any file
  if (!best) {
    best = video.video_files[0] || null;
  }

  return best;
}

// Main pipeline
export async function startGeneration(config: GenerationConfig): Promise<string> {
  const jobId = uuidv4();
  const jobDir = ensureJobDir(jobId);

  const job: GenerationJob = {
    id: jobId,
    status: 'pending',
    progress: 0,
    message: 'Starting generation...',
    config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  updateJob(job);

  // Run pipeline asynchronously
  runPipeline(jobId, jobDir, config).catch(err => {
    const j = jobs.get(jobId);
    if (j) {
      j.status = 'failed';
      const rawMsg = err instanceof Error ? err.message : String(err);
      if (rawMsg.toLowerCase().includes('ffmpeg') || rawMsg.toLowerCase().includes('cannot find')) {
        j.error = 'FFmpeg is not installed or not in PATH. Install FFmpeg to generate videos: https://ffmpeg.org/download.html';
      } else {
        j.error = rawMsg;
      }
      j.message = j.error;
      updateJob(j);
    }
    // Clean up temp job files on failure
    cleanupJobDir(jobId);
  });

  return jobId;
}

async function runPipeline(
  jobId: string,
  jobDir: string,
  config: GenerationConfig
): Promise<void> {
  const orientation: Orientation = config.orientation || 'landscape';
  const showArabic = config.showArabic !== false;
  const showTranslation = config.showTranslation !== false;

  // Step 1: Fetch verses
  const job = jobs.get(jobId)!;
  job.status = 'fetching_verses';
  job.progress = 10;
  job.message = 'Fetching verses from alquran.cloud...';
  updateJob(job);

  const { arabic, translated } = await getAyahs(
    config.surah,
    config.startAyah,
    config.endAyah,
    config.reciter,
    config.translation
  );

  // Override audio URLs for QuranPedia reciters
  if (config.reciterSource === 'quranpedia' && config.reciterMoshafServer) {
    try {
      const base = config.reciterMoshafServer.endsWith('/')
        ? config.reciterMoshafServer
        : `${config.reciterMoshafServer}/`;
      const moshafType = config.reciterMoshafType ?? 'unknown';
      const surahStr = String(config.surah).padStart(3, '0');
      arabic.ayahs = arabic.ayahs.map((a, idx) => {
        const ayahNum = a.numberInSurah;
        if (moshafType === 'versebyverse') {
          return { ...a, audio: `${base}${surahStr}${String(ayahNum).padStart(3, '0')}.mp3` };
        }
        if (moshafType === 'gapless' && idx === 0) {
          return { ...a, audio: `${base}${surahStr}.mp3` };
        }
        return { ...a, audio: undefined };
      });
    } catch (err) {
      console.error('[generation] QuranPedia audio URL override failed:', err);
    }
  }

  // Get surah name
  let surahName = config.surahName || '';
  if (!surahName) {
    try {
      const surahs = await getSurahs();
      const surahInfo = surahs.find(s => s.number === config.surah);
      surahName = surahInfo ? `${surahInfo.englishName} - ${surahInfo.name}` : `Surah ${config.surah}`;
    } catch {
      surahName = `Surah ${config.surah}`;
    }
  }

  const ayahCount = arabic.ayahs.length;

  // Step 2: Download audio FIRST so we know the target duration
  job.status = 'fetching_verses'; // reuse status for audio download
  job.progress = 20;
  job.message = 'Downloading audio recitation...';
  updateJob(job);

  const audioPaths: string[] = [];
  const ayahAudioDurations: number[] = []; // per-ayah audio durations
  for (let i = 0; i < arabic.ayahs.length; i++) {
    const ayah = arabic.ayahs[i];
    const audioPath = path.join(jobDir, `audio_${i}.mp3`);
    try {
      if (ayah.audio) {
        await downloadFile(ayah.audio, audioPath);
        audioPaths.push(audioPath);
        // Get individual ayah audio duration
        try {
          const dur = await getAudioDuration(audioPath);
          ayahAudioDurations.push(dur);
        } catch {
          ayahAudioDurations.push(0);
        }
      } else {
        ayahAudioDurations.push(0);
      }
    } catch (err) {
      console.error(`Failed to download audio for ayah ${i}:`, err);
      ayahAudioDurations.push(0);
    }
  }

  // Concatenate audio
  const combinedAudioPath = path.join(jobDir, 'combined_audio.mp3');
  if (audioPaths.length > 0) {
    try {
      await concatenateAudio(audioPaths, combinedAudioPath);
    } catch (err) {
      console.error('Audio concatenation failed:', err);
      // Fallback: try using the first audio file directly
      if (audioPaths.length === 1) {
        fs.copyFileSync(audioPaths[0], combinedAudioPath);
      } else if (audioPaths.length > 0 && fs.existsSync(audioPaths[0])) {
        fs.copyFileSync(audioPaths[0], combinedAudioPath);
        job.message = 'FFmpeg not found — using first audio file only. Install FFmpeg for full audio concatenation.';
        updateJob(job);
      }
    }
  }

  // Get total audio duration
  let audioDuration = 0;
  const audioFileExists = fs.existsSync(combinedAudioPath) && fs.statSync(combinedAudioPath).size > 0;
  if (audioFileExists) {
    try {
      audioDuration = await getAudioDuration(combinedAudioPath);
    } catch {
      audioDuration = 0;
    }
  }

  // If no audio duration, estimate from per-ayah durations or use default
  if (audioDuration <= 0 && ayahAudioDurations.some(d => d > 0)) {
    audioDuration = ayahAudioDurations.reduce((sum, d) => sum + d, 0);
  }
  if (audioDuration <= 0) {
    audioDuration = ayahCount * 6; // default 6 seconds per ayah
  }

  // Step 3: Extract visual concepts
  job.status = 'extracting_concepts';
  job.progress = 35;
  job.message = 'Extracting visual concepts with AI...';
  updateJob(job);

  let concepts: VisualConcept[];
  // Determine AI provider and API key
  const aiProvider = config.aiProvider || 'gemini';
  const aiModel = config.aiModel || 'gemini-2.5-flash';
  const aiApiKey = config.aiApiKey || config.geminiApiKey || '';

  let aiError = '';
  if (aiApiKey || aiProvider === 'ollama') {
    try {
      concepts = await extractConceptsWithAI(
        arabic.ayahs.map(a => a.text),
        aiProvider,
        aiModel,
        aiApiKey
      );
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
      concepts = generateFallbackConcepts(arabic.ayahs.map(a => a.text));
    }
  } else {
    concepts = generateFallbackConcepts(arabic.ayahs.map(a => a.text));
  }

  if (aiError) {
    job.message = `AI concept extraction failed (${aiProvider}/${aiModel}): ${aiError}. Using fallback keywords.`;
    updateJob(job);
  }

  // Step 4: Search videos from configured source
  job.status = 'searching_videos';
  job.progress = 45;
  job.message = 'Searching for matching video clips...';
  updateJob(job);

  const videoUrls: string[] = [];
  const usedSearchQueries = new Set<string>();

  // Determine video source and API key
  const videoSource = config.videoSource || 'pexels';
  const videoApiKey = config.videoApiKey || config.pexelsApiKey || '';

  let videoError = '';
  if (videoApiKey && concepts.length > 0) {
    try {
      for (const concept of concepts) {
        if (usedSearchQueries.has(concept.searchQuery)) continue;
        usedSearchQueries.add(concept.searchQuery);

        const foundUrls = await searchVideos(
          concept.searchQuery,
          videoSource,
          videoApiKey,
          orientation,
          10
        );

        // Take up to 2 clips per concept for visual variety
        const maxClipsPerConcept = 2;
        let clipsAdded = 0;
        for (const url of foundUrls) {
          if (clipsAdded >= maxClipsPerConcept) break;
          videoUrls.push(url);
          clipsAdded++;
        }
      }
    } catch (err) {
      videoError = err instanceof Error ? err.message : String(err);
    }
  }

  if (videoError) {
    const prevMsg = job.message;
    job.message = `${prevMsg} — Video search failed (${VIDEO_SOURCES[videoSource].label}): ${videoError}. Generating background video instead.`;
    updateJob(job);
  }

  // Step 5: Download clips
  job.status = 'downloading_clips';
  job.progress = 55;
  job.message = `Downloading ${videoUrls.length} video clips...`;
  updateJob(job);

  const clipPaths: string[] = [];
  // Download clips in parallel with concurrency limit
  const CONCURRENCY = 3;
  for (let batch = 0; batch < videoUrls.length; batch += CONCURRENCY) {
    const batchUrls = videoUrls.slice(batch, batch + CONCURRENCY);
    const results = await Promise.allSettled(
      batchUrls.map(async (url, batchIdx) => {
        const clipIdx = batch + batchIdx;
        const clipPath = path.join(jobDir, `clip_${clipIdx}.mp4`);
        await downloadFile(url, clipPath);
        return { clipPath, clipIdx };
      })
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        clipPaths.push(result.value.clipPath);
      } else {
        console.error(`Failed to download clip:`, result.reason);
      }
    }
  }

  // Fallback: generate a gradient background video if no clips could be downloaded
  // Use audio duration to set background video length
  if (clipPaths.length === 0) {
    job.message = 'No clips downloaded — generating background video...';
    updateJob(job);
    const bgClipPath = path.join(jobDir, 'background.mp4');
    try {
      const bgDuration = Math.max(Math.ceil(audioDuration) + 5, 30);
      await generateBackgroundVideo(bgClipPath, orientation, bgDuration);
      clipPaths.push(bgClipPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        msg.includes('ffmpeg') || msg.includes('FFmpeg')
          ? 'FFmpeg is not installed or not in PATH. Please install FFmpeg to generate videos. See https://ffmpeg.org/download.html'
          : `Background video generation failed: ${msg}`
      );
    }
  }

  // Step 6: Generate subtitles with per-ayah timing
  job.status = 'generating_subtitles';
  job.progress = 75;
  job.message = 'Generating subtitles...';
  updateJob(job);

  // Calculate per-ayah timing using individual audio durations when available
  // Fallback to even distribution if per-ayah durations aren't available
  const subtitleTimings: { start: number; end: number }[] = [];
  let currentTime = 0;

  for (let i = 0; i < ayahCount; i++) {
    let ayahDur: number;
    if (ayahAudioDurations[i] > 0) {
      // Use actual per-ayah audio duration
      ayahDur = ayahAudioDurations[i];
    } else if (audioDuration > 0 && ayahAudioDurations.some(d => d > 0)) {
      // This ayah's audio failed but others succeeded — estimate proportionally
      const totalKnownDuration = ayahAudioDurations.reduce((sum, d) => sum + d, 0);
      const unknownCount = ayahAudioDurations.filter(d => d <= 0).length;
      const remainingTime = audioDuration - totalKnownDuration;
      ayahDur = unknownCount > 0 && remainingTime > 0 ? remainingTime / unknownCount : audioDuration / ayahCount;
    } else {
      // No per-ayah data — divide evenly
      ayahDur = audioDuration > 0 ? audioDuration / ayahCount : 6;
    }
    subtitleTimings.push({ start: currentTime, end: currentTime + ayahDur });
    currentTime += ayahDur;
  }

  // Generate subtitles using combined ASS with unified subtitle block layout
  // Arabic and Translation are displayed together in a single block (bottom-center),
  // with automatic segmentation for long verses to prevent overflow
  const arabicAssEntries = arabic.ayahs.map((ayah, i) => ({
    start: subtitleTimings[i].start,
    end: subtitleTimings[i].end,
    text: ayah.text,
  }));

  // Align translation entries with Arabic by matching numberInSurah.
  // Different editions may index ayahs differently (e.g. bismillah as separate verse).
  const translatedBySurah = new Map(translated.ayahs.map(a => [a.numberInSurah, a]));
  const translationAssEntries = arabic.ayahs.map((_, i) => {
    const ayahNum = arabic.ayahs[i].numberInSurah;
    const match = translatedBySurah.get(ayahNum);
    return {
      start: subtitleTimings[i].start,
      end: subtitleTimings[i].end,
      text: match?.text ?? '',
    };
  });

  let arabicSubPath: string;
  let translationSubPath: string;

  // Determine subtitle position (bottom/center/top)
  const subtitlePosition = config.subtitlePosition || 'bottom';

  if (showArabic && showTranslation) {
    // Both Arabic and Translation: use combined ASS with configurable position
    const combinedAssContent = generateCombinedASS(arabicAssEntries, translationAssEntries, { orientation, subtitlePosition });
    const combinedSubPath = path.join(jobDir, 'combined.ass');
    fs.writeFileSync(combinedSubPath, combinedAssContent);
    // Both point to the same file — the renderer will apply it once
    arabicSubPath = combinedSubPath;
    translationSubPath = combinedSubPath;
  } else if (showArabic) {
    // Arabic only
    const assContent = generateASS(arabicAssEntries, { orientation, subtitlePosition });
    arabicSubPath = path.join(jobDir, 'arabic.ass');
    fs.writeFileSync(arabicSubPath, assContent);
    translationSubPath = arabicSubPath; // same file, won't be applied twice
  } else if (showTranslation) {
    // Translation only — use combined ASS with empty Arabic
    const combinedAssContent = generateCombinedASS([], translationAssEntries, { orientation, subtitlePosition });
    const combinedSubPath = path.join(jobDir, 'combined.ass');
    fs.writeFileSync(combinedSubPath, combinedAssContent);
    arabicSubPath = combinedSubPath;
    translationSubPath = combinedSubPath;
  } else {
    // No subtitles at all
    arabicSubPath = path.join(jobDir, 'empty.ass');
    translationSubPath = arabicSubPath;
  }

  // Step 6: Render video
  job.status = 'rendering_video';
  job.progress = 85;
  job.message = 'Rendering final video with subtitles...';
  updateJob(job);

  const outputPath = path.join(jobDir, 'output.mp4');

  // Generate text logo ASS overlay (if logo text provided)
  let logoSubPath: string | undefined;
  const logoText = (config.logoText || '').trim();
  if (logoText) {
    const logoPosition = config.logoPosition || 'top-left';
    // Use a generous duration so the logo covers the whole video;
    // the actual video length is bounded by -t/-shortest in the renderer
    const logoDuration = Math.max(audioDuration > 0 ? audioDuration : 60, 60);
    const logoAssContent = generateLogoASS(logoText, logoPosition, orientation, logoDuration);
    logoSubPath = path.join(jobDir, 'logo.ass');
    fs.writeFileSync(logoSubPath, logoAssContent);
  }

  // Check if combined audio file is valid
  const hasValidAudio = audioFileExists && fs.statSync(combinedAudioPath).size > 0;

  if (hasValidAudio) {
    await renderVideo(
      clipPaths,
      combinedAudioPath,
      arabicSubPath,
      translationSubPath,
      outputPath,
      jobDir,
      orientation,
      audioDuration > 0 ? audioDuration : undefined,
      showArabic,
      showTranslation,
      logoSubPath
    );
  } else {
    // No valid audio - render video with subtitles only (no audio track)
    // renderVideoWithoutAudio handles looping clips to cover the full duration
    await renderVideoWithoutAudio(
      clipPaths,
      arabicSubPath,
      translationSubPath,
      outputPath,
      jobDir,
      orientation,
      audioDuration > 0 ? audioDuration : undefined,
      showArabic,
      showTranslation,
      logoSubPath
    );
  }

  // Get output file info
  const stat = fs.statSync(outputPath);
  let videoDuration = 0;
  try {
    videoDuration = await getAudioDuration(outputPath);
  } catch {
    videoDuration = audioDuration;
  }

  // Move final video to renders/ and clean up job temp files
  const finalVideoPath = getRenderPath(jobId);
  fs.copyFileSync(outputPath, finalVideoPath);

  // Clean up the entire job temp directory
  cleanupJobDir(jobId);

  // Complete
  const result: GenerationResult = {
    videoPath: finalVideoPath,
    videoUrl: `/api/videos/${jobId}`,
    duration: videoDuration,
    fileSize: stat.size,
    concepts: concepts.map(c => c.concept),
    clipCount: clipPaths.length,
  };

  job.status = 'completed';
  job.progress = 100;
  job.message = 'Video generated successfully!';
  job.result = result;
  updateJob(job);

  // Update video metadata
  saveVideoMetadata({
    id: jobId,
    surah: config.surah,
    surahName,
    startAyah: config.startAyah,
    endAyah: config.endAyah,
    reciter: config.reciter,
    reciterName: config.reciterName,
    translation: config.translation,
    translationName: config.translationName,
    videoUrl: `/api/videos/${jobId}`,
    duration: videoDuration,
    fileSize: stat.size,
    createdAt: new Date().toISOString(),
    orientation,
  });
}

export function getJobStatus(jobId: string): GenerationJob | null {
  return jobs.get(jobId) || null;
}

// Video metadata
function saveVideoMetadata(info: VideoInfo): void {
  const metadata = getVideoMetadata();
  metadata.push(info);
  writeJsonFile(STORAGE_PATHS.metadata, metadata);
}

export function getVideoMetadata(): VideoInfo[] {
  const videos = readJsonFile<VideoInfo[]>(STORAGE_PATHS.metadata) || [];
  return videos.reverse();
}

export function deleteVideoMetadata(id: string): void {
  const metadata = getVideoMetadata().filter(v => v.id !== id);
  writeJsonFile(STORAGE_PATHS.metadata, metadata);

  // Delete rendered video file
  const renderPath = path.join(STORAGE_PATHS.renders, `${id}.mp4`);
  if (fs.existsSync(renderPath)) {
    fs.unlinkSync(renderPath);
  }

  // Also clean up any leftover job temp files
  cleanupJobDir(id);

  // Delete from jobs map
  jobs.delete(id);
  saveJobs();
}
