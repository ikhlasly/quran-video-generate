import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import type {
  GenerationJob,
  GenerationConfig,
  GenerationResult,
  VideoInfo,
  VisualConcept,
  PexelsVideo,
  PexelsVideoFile,
  AIProvider,
} from "@/types/quran";
import { VIDEO_SOURCES } from "@/types/quran";
import {
  ensureStorageDirs,
  ensureJobDir,
  getRenderPath,
  cleanupJobDir,
  STORAGE_PATHS,
  readJsonFile,
  writeJsonFile,
} from "@/lib/storage";
import { getAyahs, getSurahs } from "@/lib/quran-api";
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
} from "@/lib/ffmpeg";

const jobs = new Map<string, GenerationJob>();
ensureStorageDirs();

function loadJobs(): void {
  const saved = readJsonFile<GenerationJob[]>(STORAGE_PATHS.jobsFile);
  if (saved) for (const job of saved) jobs.set(job.id, job);
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

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const currentIndex = index++;
        try {
          results[currentIndex] = {
            status: "fulfilled",
            value: await mapper(items[currentIndex], currentIndex),
          };
        } catch (reason) {
          results[currentIndex] = { status: "rejected", reason };
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

interface AIProviderEndpoint {
  url: string;
  headers: Record<string, string>;
  body: (prompt: string) => unknown;
  parse: (data: Record<string, unknown>) => string;
}

function getProviderEndpoint(
  provider: AIProvider,
  model: string,
  apiKey: string,
): AIProviderEndpoint {
  if (provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { "Content-Type": "application/json" },
      body: (prompt) => ({ contents: [{ parts: [{ text: prompt }] }] }),
      parse: (data) =>
        (
          data?.candidates as
            | Array<{ content?: { parts?: Array<{ text?: string }> } }>
            | undefined
        )?.[0]?.content?.parts?.[0]?.text || "[]",
    };
  }
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: (prompt) => ({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      parse: (data) =>
        (
          data?.content as Array<{ type: string; text?: string }> | undefined
        )?.[0]?.text || "[]",
    };
  }
  const baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    glm: "https://open.bigmodel.cn/api/paas/v4",
    openrouter: "https://openrouter.ai/api/v1",
    ollama: "http://localhost:11434/v1",
  };
  const baseUrl = baseUrls[provider] || baseUrls.openai;
  return {
    url: `${baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      ...(provider === "ollama" ? {} : { Authorization: `Bearer ${apiKey}` }),
    },
    body: (prompt) => ({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
    parse: (data) =>
      (
        data?.choices as Array<{ message?: { content?: string } }> | undefined
      )?.[0]?.message?.content || "[]",
  };
}

async function extractConceptsWithAI(
  ayahTexts: string[],
  provider: AIProvider,
  model: string,
  apiKey: string,
): Promise<VisualConcept[]> {
  try {
    const prompt = `You are an expert at extracting visual concepts from Quran verses for video generation.\n\nGiven these Quran verses (Arabic text), extract 3-5 visual concepts that could be used as search queries for stock video clips. Focus on nature, landscapes, celestial objects, water, light, and other visual elements mentioned in the verses.\n\nVerses:\n${ayahTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nRespond with a JSON array of objects, each with:\n- "concept": a brief description of the visual concept\n- "searchQuery": a search query (1-3 words, in English)\n- "ayahReferences": array of verse numbers (1-based index) that relate to this concept\n\nOnly respond with the JSON array, nothing else.`;
    const endpoint = getProviderEndpoint(provider, model, apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: endpoint.headers,
        body: JSON.stringify(endpoint.body(prompt)),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `HTTP ${response.status}: ${await response.text().catch(() => "")}`,
        );
      const data = await response.json();
      const content = endpoint.parse(data);
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as VisualConcept[];
        } catch {
          return [];
        }
      }
      return [];
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error(`AI concept extraction failed (${provider}/${model}):`, err);
    throw err;
  }
}

function generateFallbackConcepts(ayahTexts: string[]): VisualConcept[] {
  const queries = [
    "nature",
    "sunset",
    "ocean",
    "mountains",
    "sky",
    "stars",
    "river",
    "forest",
    "desert",
    "clouds",
  ];
  const concepts: VisualConcept[] = [];
  const usedQueries = new Set<string>();
  for (let i = 0; i < Math.min(5, ayahTexts.length); i++) {
    const query = queries[i % queries.length];
    if (!usedQueries.has(query)) {
      usedQueries.add(query);
      concepts.push({
        concept: `Visual theme for verses`,
        searchQuery: query,
        ayahReferences: [i + 1],
      });
    }
  }
  return concepts.length === 0
    ? [
        {
          concept: "Nature landscape",
          searchQuery: "nature",
          ayahReferences: [1],
        },
      ]
    : concepts;
}

async function searchPexelsVideos(
  query: string,
  apiKey: string,
  orientation: string = "landscape",
  perPage: number = 10,
): Promise<string[]> {
  try {
    const orientParam =
      orientation === "portrait"
        ? "portrait"
        : orientation === "square"
          ? "square"
          : "landscape";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientParam}&size=medium`,
        { headers: { Authorization: apiKey }, signal: controller.signal },
      );
      const data = await res.json();
      return (data.videos || [])
        .map(
          (v: PexelsVideo) =>
            selectBestVideoFile(v, orientation as Orientation)?.link || "",
        )
        .filter(Boolean);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return [];
  }
}

async function searchPixabayVideos(
  query: string,
  apiKey: string,
  orientation: string = "landscape",
  perPage: number = 10,
): Promise<string[]> {
  try {
    const orientParam = orientation === "portrait" ? "vertical" : "horizontal";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientParam}&video_type=film`,
        { signal: controller.signal },
      );
      const data = await res.json();
      return (data.hits || [])
        .map(
          (hit: { videos: Record<string, { url: string }> }) =>
            (hit.videos?.medium || hit.videos?.small || hit.videos?.large)
              ?.url || "",
        )
        .filter(Boolean);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return [];
  }
}

async function searchVideos(
  query: string,
  source: "pexels" | "pixabay",
  apiKey: string,
  orientation: string = "landscape",
  perPage: number = 10,
): Promise<string[]> {
  return source === "pixabay"
    ? searchPixabayVideos(query, apiKey, orientation, perPage)
    : searchPexelsVideos(query, apiKey, orientation, perPage);
}

function selectBestVideoFile(
  video: PexelsVideo,
  orientation: Orientation,
): PexelsVideoFile | null {
  const preset = ORIENTATION_PRESETS[orientation];
  const targetRatio = preset.width / preset.height;
  let best: PexelsVideoFile | null = null;
  let bestDiff = Infinity;
  for (const file of video.video_files) {
    if (file.file_type !== "video/mp4") continue;
    const diff = Math.abs(file.width / file.height - targetRatio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = file;
    }
  }
  return (
    best ||
    video.video_files.find((f) => f.file_type === "video/mp4") ||
    video.video_files[0] ||
    null
  );
}

export async function startGeneration(
  config: GenerationConfig,
): Promise<string> {
  const jobId = uuidv4();
  const jobDir = ensureJobDir(jobId);
  const job: GenerationJob = {
    id: jobId,
    status: "pending",
    progress: 0,
    message: "Starting generation...",
    config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  updateJob(job);

  runPipeline(jobId, jobDir, config).catch((err) => {
    const j = jobs.get(jobId);
    if (j) {
      j.status = "failed";
      const rawMsg = err instanceof Error ? err.message : String(err);
      const lowerMsg = rawMsg.toLowerCase();
      j.error =
        lowerMsg.includes("cannot find ffmpeg") ||
        lowerMsg.includes("spawn ffmpeg enoent") ||
        lowerMsg.includes("ffmpeg was not found")
          ? "FFmpeg is not installed or not in PATH. Install FFmpeg to generate videos: https://ffmpeg.org/download.html"
          : rawMsg;
      j.message = j.error;
      updateJob(j);
    }
    cleanupJobDir(jobId);
  });

  return jobId;
}

async function runPipeline(
  jobId: string,
  jobDir: string,
  config: GenerationConfig,
): Promise<void> {
  const orientation: Orientation = config.orientation || "landscape";
  const showArabic = config.showArabic !== false;
  const showTranslation = config.showTranslation !== false;

  const job = jobs.get(jobId)!;
  job.status = "fetching_verses";
  job.progress = 10;
  job.message = "Fetching verses from alquran.cloud...";
  updateJob(job);

  const { arabic, translated } = await getAyahs(
    config.surah,
    config.startAyah,
    config.endAyah,
    config.reciter,
    config.translation,
  );

  const isGapless =
    config.reciterSource === "quranpedia" &&
    config.reciterMoshafType === "gapless";
  if (config.reciterSource === "quranpedia" && config.reciterMoshafServer) {
    try {
      const base = config.reciterMoshafServer.endsWith("/")
        ? config.reciterMoshafServer
        : `${config.reciterMoshafServer}/`;
      const surahStr = String(config.surah).padStart(3, "0");
      if (isGapless) {
        arabic.ayahs = arabic.ayahs.map((a, idx) => ({
          ...a,
          audio: idx === 0 ? `${base}${surahStr}.mp3` : undefined,
        }));
      } else if (config.reciterMoshafType === "versebyverse") {
        arabic.ayahs = arabic.ayahs.map((a) => ({
          ...a,
          audio: `${base}${surahStr}${String(a.numberInSurah).padStart(3, "0")}.mp3`,
        }));
      } else {
        arabic.ayahs = arabic.ayahs.map((a) => ({ ...a, audio: undefined }));
      }
    } catch (err) {
      console.error("[generation] QuranPedia audio URL override failed:", err);
    }
  }

  let surahName = config.surahName || "";
  if (!surahName) {
    try {
      const surahs = await getSurahs();
      const surahInfo = surahs.find((s) => s.number === config.surah);
      surahName = surahInfo
        ? `${surahInfo.englishName} - ${surahInfo.name}`
        : `Surah ${config.surah}`;
    } catch {
      surahName = `Surah ${config.surah}`;
    }
  }

  const ayahCount = arabic.ayahs.length;

  job.progress = 20;
  job.message = "Downloading audio recitation...";
  updateJob(job);

  const audioPaths: string[] = [];
  const ayahAudioDurations: number[] = new Array(ayahCount).fill(0);

  if (isGapless && arabic.ayahs[0]?.audio) {
    const audioPath = path.join(jobDir, "audio_gapless.mp3");
    try {
      await downloadFile(arabic.ayahs[0].audio, audioPath);
      audioPaths.push(audioPath);
      const totalDur = await getAudioDuration(audioPath);
      const perAyah = totalDur / ayahCount;
      for (let i = 0; i < ayahCount; i++) ayahAudioDurations[i] = perAyah;
    } catch (err) {
      console.error("Failed to download gapless audio:", err);
    }
  } else {
    const audioPromises = arabic.ayahs.map((ayah, i) => ({
      url: ayah.audio,
      path: path.join(jobDir, `audio_${i}.mp3`),
    }));
    const results = await mapConcurrent(audioPromises, 5, async (item) => {
      if (!item.url) return { path: item.path, duration: 0 };
      await downloadFile(item.url, item.path);
      return { path: item.path, duration: await getAudioDuration(item.path) };
    });
    results.forEach((res, i) => {
      if (res.status === "fulfilled") {
        if (res.value.duration > 0) audioPaths.push(res.value.path);
        ayahAudioDurations[i] = res.value.duration;
      }
    });
  }

  const combinedAudioPath = path.join(jobDir, "combined_audio.mp3");
  if (audioPaths.length > 0) {
    try {
      await concatenateAudio(audioPaths, combinedAudioPath);
    } catch (err) {
      console.error("Audio concatenation failed:", err);
      if (audioPaths.length > 0)
        await fs.promises.copyFile(audioPaths[0], combinedAudioPath);
    }
  }

  let audioDuration = 0;
  let audioFileExists = false;
  try {
    const stat = await fs.promises.stat(combinedAudioPath);
    audioFileExists = stat.size > 0;
  } catch {}
  if (audioFileExists) {
    try {
      audioDuration = await getAudioDuration(combinedAudioPath);
    } catch {}
  }
  if (audioDuration <= 0 && ayahAudioDurations.some((d) => d > 0))
    audioDuration = ayahAudioDurations.reduce((sum, d) => sum + d, 0);
  if (audioDuration <= 0) audioDuration = ayahCount * 6;

  job.status = "extracting_concepts";
  job.progress = 35;
  job.message = "Extracting visual concepts with AI...";
  updateJob(job);

  let concepts: VisualConcept[] = [];
  const aiProvider = config.aiProvider || "gemini";
  const aiModel = config.aiModel || "gemini-2.5-flash";
  const aiApiKey = config.aiApiKey || config.geminiApiKey || "";

  if (aiApiKey || aiProvider === "ollama") {
    try {
      concepts = await extractConceptsWithAI(
        arabic.ayahs.map((a) => a.text),
        aiProvider,
        aiModel,
        aiApiKey,
      );
    } catch (err) {
      concepts = generateFallbackConcepts(arabic.ayahs.map((a) => a.text));
    }
  } else {
    concepts = generateFallbackConcepts(arabic.ayahs.map((a) => a.text));
  }

  job.status = "searching_videos";
  job.progress = 45;
  job.message = "Searching for matching video clips...";
  updateJob(job);

  const videoUrls: string[] = [];
  const videoSource = config.videoSource || "pexels";
  const videoApiKey = config.videoApiKey || config.pexelsApiKey || "";

  if (videoApiKey && concepts.length > 0) {
    const uniqueQueries = Array.from(
      new Set(concepts.map((c) => c.searchQuery)),
    );
    const searchResults = await Promise.all(
      uniqueQueries.map((q) =>
        searchVideos(q, videoSource, videoApiKey, orientation, 10),
      ),
    );
    for (const urls of searchResults) {
      for (const url of urls.slice(0, 2)) videoUrls.push(url); // Max 2 clips per concept
    }
  }

  job.status = "downloading_clips";
  job.progress = 55;
  job.message = `Downloading ${videoUrls.length} video clips...`;
  updateJob(job);

  const clipPaths: string[] = [];
  const clipResults = await mapConcurrent(videoUrls, 3, async (url, idx) => {
    const clipPath = path.join(jobDir, `clip_${idx}.mp4`);
    await downloadFile(url, clipPath);
    return clipPath;
  });
  for (const res of clipResults) {
    if (res.status === "fulfilled") clipPaths.push(res.value);
  }

  if (clipPaths.length === 0) {
    job.message = "No clips downloaded — generating background video...";
    updateJob(job);
    const bgClipPath = path.join(jobDir, "background.mp4");
    try {
      await generateBackgroundVideo(
        bgClipPath,
        orientation,
        Math.max(Math.ceil(audioDuration) + 5, 30),
      );
      clipPaths.push(bgClipPath);
    } catch (err) {
      throw new Error(
        `Background video generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  job.status = "generating_subtitles";
  job.progress = 75;
  job.message = "Generating subtitles...";
  updateJob(job);

  const subtitleTimings: { start: number; end: number }[] = [];
  let currentTime = 0;
  const knownDurations = ayahAudioDurations.filter((d) => d > 0);
  const totalKnownDuration = knownDurations.reduce((sum, d) => sum + d, 0);
  const unknownCount = ayahAudioDurations.filter((d) => d <= 0).length;

  for (let i = 0; i < ayahCount; i++) {
    let ayahDur: number;
    if (ayahAudioDurations[i] > 0) {
      ayahDur = ayahAudioDurations[i];
    } else if (audioDuration > 0) {
      ayahDur =
        unknownCount > 0
          ? Math.max(0, audioDuration - totalKnownDuration) / unknownCount
          : audioDuration / ayahCount;
    } else {
      ayahDur = 6;
    }
    // Prevent 0 duration which breaks ASS subtitles at the end
    ayahDur = Math.max(0.5, ayahDur);

    subtitleTimings.push({ start: currentTime, end: currentTime + ayahDur });
    currentTime += ayahDur;
  }

  const arabicAssEntries = arabic.ayahs.map((ayah, i) => ({
    start: subtitleTimings[i].start,
    end: subtitleTimings[i].end,
    text: ayah.text,
  }));
  const translatedBySurah = new Map(
    translated.ayahs.map((a) => [a.numberInSurah, a]),
  );
  const translationAssEntries = arabic.ayahs.map((_, i) => {
    const match = translatedBySurah.get(arabic.ayahs[i].numberInSurah);
    return {
      start: subtitleTimings[i].start,
      end: subtitleTimings[i].end,
      text: match?.text ?? "",
    };
  });

  let arabicSubPath: string;
  let translationSubPath: string;
  const subtitlePosition = config.subtitlePosition || "bottom";

  if (showArabic && showTranslation) {
    const combinedSubPath = path.join(jobDir, "combined.ass");
    await fs.promises.writeFile(
      combinedSubPath,
      generateCombinedASS(arabicAssEntries, translationAssEntries, {
        orientation,
        subtitlePosition,
      }),
      "utf-8",
    );
    arabicSubPath = combinedSubPath;
    translationSubPath = combinedSubPath;
  } else if (showArabic) {
    arabicSubPath = path.join(jobDir, "arabic.ass");
    await fs.promises.writeFile(
      arabicSubPath,
      generateASS(arabicAssEntries, { orientation, subtitlePosition }),
      "utf-8",
    );
    translationSubPath = arabicSubPath;
  } else if (showTranslation) {
    const combinedSubPath = path.join(jobDir, "combined.ass");
    await fs.promises.writeFile(
      combinedSubPath,
      generateCombinedASS([], translationAssEntries, {
        orientation,
        subtitlePosition,
      }),
      "utf-8",
    );
    arabicSubPath = combinedSubPath;
    translationSubPath = combinedSubPath;
  } else {
    arabicSubPath = path.join(jobDir, "empty.ass");
    translationSubPath = arabicSubPath;
  }

  job.status = "rendering_video";
  job.progress = 85;
  job.message = "Rendering final video with subtitles...";
  updateJob(job);

  const outputPath = path.join(jobDir, "output.mp4");
  let logoSubPath: string | undefined;
  const logoText = (config.logoText || "").trim();
  if (logoText) {
    const logoAssContent = generateLogoASS(
      logoText,
      config.logoPosition || "top-left",
      orientation,
      Math.max(audioDuration > 0 ? audioDuration : 60, 60),
    );
    logoSubPath = path.join(jobDir, "logo.ass");
    await fs.promises.writeFile(logoSubPath, logoAssContent, "utf-8");
  }

  if (audioFileExists) {
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
      logoSubPath,
    );
  } else {
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
      logoSubPath,
    );
  }

  const stat = await fs.promises.stat(outputPath);
  let videoDuration = 0;
  try {
    videoDuration = await getAudioDuration(outputPath);
  } catch {
    videoDuration = audioDuration;
  }

  const finalVideoPath = getRenderPath(jobId);
  await fs.promises.copyFile(outputPath, finalVideoPath);
  cleanupJobDir(jobId);

  const result: GenerationResult = {
    videoPath: finalVideoPath,
    videoUrl: `/api/videos/${jobId}`,
    duration: videoDuration,
    fileSize: stat.size,
    concepts: concepts.map((c) => c.concept),
    clipCount: clipPaths.length,
  };

  job.status = "completed";
  job.progress = 100;
  job.message = "Video generated successfully!";
  job.result = result;
  updateJob(job);

  const metadata = readJsonFile<VideoInfo[]>(STORAGE_PATHS.metadata) || [];
  metadata.push({
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
  writeJsonFile(STORAGE_PATHS.metadata, metadata);
}

export function getJobStatus(jobId: string): GenerationJob | null {
  return jobs.get(jobId) || null;
}
export function getVideoMetadata(): VideoInfo[] {
  return (readJsonFile<VideoInfo[]>(STORAGE_PATHS.metadata) || []).reverse();
}

export async function deleteVideoMetadata(id: string): Promise<void> {
  const metadata = readJsonFile<VideoInfo[]>(STORAGE_PATHS.metadata) || [];
  writeJsonFile(
    STORAGE_PATHS.metadata,
    metadata.filter((v) => v.id !== id),
  );
  try {
    await fs.promises.unlink(path.join(STORAGE_PATHS.renders, `${id}.mp4`));
  } catch {}
  cleanupJobDir(id);
  jobs.delete(id);
  saveJobs();
}
