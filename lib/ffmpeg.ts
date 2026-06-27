import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import https from "https";
import http from "http";
import type { SubtitlePosition, LogoPosition } from "@/types/quran";

export const ORIENTATION_PRESETS = {
  landscape: { width: 1920, height: 1080, label: "Landscape (16:9)" },
  portrait: { width: 1080, height: 1920, label: "Portrait (9:16)" },
  square: { width: 1080, height: 1080, label: "Square (1:1)" },
} as const;

export type Orientation = keyof typeof ORIENTATION_PRESETS;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Output frame-rate used everywhere — single source of truth. */
const OUTPUT_FPS = 30;

/** Fallback per-clip duration when ffprobe fails (seconds). */
const CLIP_DURATION_FALLBACK_S = 15;

// ---------------------------------------------------------------------------
// ffprobe helpers
// ---------------------------------------------------------------------------

/**
 * Probe a single file for its duration.
 * Uses the format-level duration first, falling back to the first stream.
 */
function ffprobeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const dur = metadata.format?.duration ?? metadata.streams?.[0]?.duration;
      if (dur !== undefined) {
        resolve(parseFloat(String(dur)));
      } else {
        reject(new Error(`Could not determine duration of ${filePath}`));
      }
    });
  });
}

export const getAudioDuration = (filePath: string): Promise<number> =>
  ffprobeDuration(filePath);

export const getVideoDuration = (filePath: string): Promise<number> =>
  ffprobeDuration(filePath);

/**
 * Probe all clip paths concurrently.
 * Falls back to CLIP_DURATION_FALLBACK_S for any file that fails.
 *
 * ⚡ Key optimisation: parallel ffprobe calls instead of sequential awaits.
 */
async function probeClipDurations(clipPaths: string[]): Promise<number> {
  const results = await Promise.allSettled(
    clipPaths.map((p) => ffprobeDuration(p)),
  );
  return results.reduce<number>((sum, r) => {
    return (
      sum + (r.status === "fulfilled" ? r.value : CLIP_DURATION_FALLBACK_S)
    );
  }, 0);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Escape a file path for use inside an ASS/SRT subtitles= filter value.
 * Must escape single-quotes and colons for the FFmpeg filter-graph parser.
 */
function escapeSubtitlePath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

/**
 * Build a filter_complex graph that concatenates all video clip inputs,
 * scales/pads to the target resolution, and applies subtitle overlays.
 *
 * The concat filter decodes each clip to raw frames, concatenates them,
 * then re-encodes — so clips with different codec parameters render
 * correctly without freezing.
 */
function buildConcatFilterGraph(
  clipCount: number,
  preset: { width: number; height: number },
  arabicSub: string,
  translationSub: string,
  showArabic: boolean,
  showTranslation: boolean,
  logoSub?: string,
): string {
  let fc = "";
  for (let i = 0; i < clipCount; i++) {
    fc += `[${i}:v]`;
  }
  fc += `concat=n=${clipCount}:v=1:a=0[v0]`;
  fc += `;[v0]scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${OUTPUT_FPS},setsar=sar=1[v1]`;

  let current = "v1";
  let subIdx = 2;
  if (showArabic && fs.existsSync(arabicSub)) {
    fc += `;[${current}]subtitles='${escapeSubtitlePath(arabicSub)}'[v${subIdx}]`;
    current = `v${subIdx}`;
    subIdx++;
  }
  if (showTranslation && translationSub !== arabicSub && fs.existsSync(translationSub)) {
    fc += `;[${current}]subtitles='${escapeSubtitlePath(translationSub)}'[v${subIdx}]`;
    current = `v${subIdx}`;
    subIdx++;
  }
  if (logoSub && fs.existsSync(logoSub)) {
    fc += `;[${current}]subtitles='${escapeSubtitlePath(logoSub)}'[v${subIdx}]`;
    current = `v${subIdx}`;
    subIdx++;
  }
  fc += `;[${current}]null[outv]`;

  return fc;
}

async function prepareClipInputs(
  clipPaths: string[],
  targetDuration: number,
): Promise<{ clips: string[]; count: number }> {
  let finalClips = clipPaths;
  if (targetDuration > 0 && clipPaths.length > 0) {
    const total = await probeClipDurations(clipPaths);
    if (total > 0 && targetDuration > total) {
      const loopMultiplier = Math.ceil(targetDuration / total) + 1;
      finalClips = [];
      for (let loop = 0; loop < loopMultiplier; loop++) {
        finalClips.push(...clipPaths);
      }
    }
  }
  if (finalClips.length === 0) {
    throw new Error("No valid video clips available");
  }
  return { clips: finalClips, count: finalClips.length };
}

// ---------------------------------------------------------------------------
// Public API — video operations
// ---------------------------------------------------------------------------

export function scaleVideo(
  input: string,
  output: string,
  orientation: Orientation,
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        "-vf",
        [
          `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease`,
          `pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black`,
        ].join(","),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-r",
        String(OUTPUT_FPS),
        "-an",
      ])
      .output(output)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

/**
 * Generate a solid-colour background video using lavfi.
 *
 * ⚡ Changed from execFileSync (blocks the Node event loop) to execFile
 *    (async, callback-based) so the server can handle other requests while
 *    FFmpeg runs.
 */
export function generateBackgroundVideo(
  output: string,
  orientation: Orientation,
  duration: number = 60,
): Promise<void> {
  const { width: w, height: h } = ORIENTATION_PRESETS[orientation];

  return new Promise((resolve, reject) => {
    child_process.execFile(
      "ffmpeg",
      [
        "-f",
        "lavfi",
        "-i",
        `color=c=0x0d1b2a:s=${w}x${h}:d=${duration}:r=${OUTPUT_FPS}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "30",
        "-r",
        String(OUTPUT_FPS),
        "-an",
        "-pix_fmt",
        "yuv420p",
        "-t",
        String(duration),
        "-y",
        output,
      ],
      { timeout: 120_000 },
      (err) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve();
      },
    );
  });
}

export async function renderVideo(
  clipPaths: string[],
  audio: string,
  arabicSub: string,
  translationSub: string,
  output: string,
  jobDir: string,
  orientation: Orientation,
  audioDuration?: number,
  showArabic: boolean = true,
  showTranslation: boolean = true,
  logoSub?: string,
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];
  const targetDuration = audioDuration && audioDuration > 0 ? audioDuration : 0;
  const { clips, count } = await prepareClipInputs(clipPaths, targetDuration);

  const filterGraph = buildConcatFilterGraph(
    count, preset, arabicSub, translationSub,
    showArabic, showTranslation, logoSub,
  );

  const audioInputIdx = count;

  const outputOpts: string[] = [
    "-filter_complex", filterGraph,
    "-map", "[outv]",
    "-map", `${audioInputIdx}:a:0`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-vsync", "cfr",
  ];

  if (targetDuration > 0) {
    outputOpts.push("-t", String(Math.ceil(targetDuration)));
  } else {
    outputOpts.push("-shortest");
  }

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    for (const clip of clips) {
      command.input(clip);
    }
    command.input(audio);

    command
      .outputOptions(outputOpts)
      .output(output)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export async function renderVideoWithoutAudio(
  clipPaths: string[],
  arabicSub: string,
  translationSub: string,
  output: string,
  jobDir: string,
  orientation: Orientation,
  targetDuration?: number,
  showArabic: boolean = true,
  showTranslation: boolean = true,
  logoSub?: string,
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];
  const duration = targetDuration && targetDuration > 0 ? targetDuration : 0;
  const { clips, count } = await prepareClipInputs(clipPaths, duration);

  const filterGraph = buildConcatFilterGraph(
    count, preset, arabicSub, translationSub,
    showArabic, showTranslation, logoSub,
  );

  const outputOpts: string[] = [
    "-filter_complex", filterGraph,
    "-map", "[outv]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-an",
    "-pix_fmt", "yuv420p",
    "-vsync", "cfr",
  ];

  if (duration > 0) {
    outputOpts.push("-t", String(Math.ceil(duration)));
  }

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    for (const clip of clips) {
      command.input(clip);
    }

    command
      .outputOptions(outputOpts)
      .output(output)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

// ---------------------------------------------------------------------------
// File download
// ---------------------------------------------------------------------------

export function downloadFile(url: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const file = fs.createWriteStream(output);

    const doRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 10) {
        reject(new Error("Too many redirects"));
        return;
      }

      const protocol = requestUrl.startsWith("https") ? https : http;

      protocol
        .get(requestUrl, (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            doRequest(response.headers.location, redirectCount + 1);
            return;
          }

          if (response.statusCode !== 200) {
            reject(
              new Error(`Download failed with status ${response.statusCode}`),
            );
            return;
          }

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        })
        .on("error", (err) => {
          fs.unlink(output, () => reject(err));
        });
    };

    doRequest(url);
  });
}

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

export function wrapArabicText(
  text: string,
  _orientation: Orientation,
): string[] {
  return ["\u202B" + text];
}

export function wrapTranslationText(
  text: string,
  orientation: Orientation,
): string[] {
  const maxChars = orientation === "portrait" ? 30 : 44;
  if (text.length <= maxChars) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  if (lines.length > 2) {
    const mid = Math.ceil(lines.length / 2);
    return [lines.slice(0, mid).join(" "), lines.slice(mid).join(" ")];
  }
  return lines;
}

// ---------------------------------------------------------------------------
// ASS subtitle generation
// ---------------------------------------------------------------------------

interface ASSEntry {
  start: number;
  end: number;
  text: string;
}

interface ASSOptions {
  orientation: Orientation;
  fontName?: string;
  subtitlePosition?: SubtitlePosition;
}

function getSubtitlePositionConfig(
  position: SubtitlePosition = "bottom",
  orientation: Orientation,
): { alignment: number; marginV: number } {
  const isPortrait = orientation === "portrait";
  switch (position) {
    case "top":
      return { alignment: 8, marginV: isPortrait ? 15 : 35 };
    case "center":
      return { alignment: 5, marginV: 0 };
    case "bottom":
    default:
      return { alignment: 2, marginV: isPortrait ? 15 : 35 };
  }
}

function getLogoPositionConfig(
  position: LogoPosition,
  orientation: Orientation,
): { alignment: number; marginV: number; marginL: number; marginR: number } {
  const isPortrait = orientation === "portrait";
  const marginH = isPortrait ? 12 : 30;
  const marginVv = isPortrait ? 12 : 30;

  switch (position) {
    case "top-left":
      return { alignment: 7, marginV: marginVv, marginL: marginH, marginR: 0 };
    case "top-center":
      return { alignment: 8, marginV: marginVv, marginL: 0, marginR: 0 };
    case "top-right":
      return { alignment: 9, marginV: marginVv, marginL: 0, marginR: marginH };
    case "bottom-left":
      return { alignment: 1, marginV: marginVv, marginL: marginH, marginR: 0 };
    case "bottom-center":
      return { alignment: 2, marginV: marginVv, marginL: 0, marginR: 0 };
    case "bottom-right":
    default:
      return { alignment: 3, marginV: marginVv, marginL: 0, marginR: marginH };
  }
}

// Shared ASS script-info + styles header generator.
function buildASSHeader(title: string, styleLine: string): string {
  return `\ufeff[Script Info]
Title: ${title}
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine}

[Events]
Format: Layer, Start, Time, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

export function generateLogoASS(
  logoText: string,
  position: LogoPosition,
  orientation: Orientation,
  duration: number,
): string {
  const isPortrait = orientation === "portrait";
  const fontSize = isPortrait ? 11 : 18;
  const { alignment, marginV, marginL, marginR } = getLogoPositionConfig(
    position,
    orientation,
  );

  const safeText = logoText
    .replace(/\\/g, "")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\n/g, " ");

  const styleLine = `Style: Logo,Arial,${fontSize},&HCCFFFFFF,&HCCFFFFFF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,${alignment},${marginL},${marginR},${marginV},1`;
  const header = buildASSHeader("Logo Overlay", styleLine);

  const start = formatASSTime(0);
  const end = formatASSTime(Math.max(duration, 1));
  return `${header}Dialogue: 0,${start},${end},Logo,,0,0,0,,{\\q0}${safeText}\n`;
}

// ---------------------------------------------------------------------------
// Verse segmentation helpers
// ---------------------------------------------------------------------------

function splitTextIntoParts(text: string, numParts: number): string[] {
  if (numParts <= 1) return [text];

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [text];

  const wordsPerPart = Math.ceil(words.length / numParts);
  const parts: string[] = [];

  for (let i = 0; i < numParts; i++) {
    const slice = words.slice(i * wordsPerPart, (i + 1) * wordsPerPart);
    if (slice.length > 0) parts.push(slice.join(" "));
  }

  return parts;
}

interface VerseSegment {
  arabic: string;
  translation: string;
}

function segmentVerse(
  arabicText: string,
  translationText: string,
  orientation: Orientation,
): VerseSegment[] {
  const isPortrait = orientation === "portrait";
  const isSquare = orientation === "square";

  const maxArabicChars = isPortrait ? 40 : isSquare ? 65 : 80;
  const maxTranslationChars = isPortrait ? 45 : isSquare ? 70 : 95;

  const arabicNeedsSplit = arabicText.length > maxArabicChars;
  const translationNeedsSplit = translationText.length > maxTranslationChars;

  if (!arabicNeedsSplit && !translationNeedsSplit) {
    return [{ arabic: arabicText, translation: translationText }];
  }

  const numSegments = Math.max(
    arabicNeedsSplit ? Math.ceil(arabicText.length / maxArabicChars) : 1,
    translationNeedsSplit
      ? Math.ceil(translationText.length / maxTranslationChars)
      : 1,
    2,
  );

  const arabicParts = splitTextIntoParts(arabicText, numSegments);
  const translationParts = splitTextIntoParts(translationText, numSegments);

  const len = Math.max(arabicParts.length, translationParts.length);
  const segments: VerseSegment[] = [];
  for (let i = 0; i < len; i++) {
    segments.push({
      arabic: arabicParts[i] ?? "",
      translation: translationParts[i] ?? "",
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// ASS subtitle export functions
// ---------------------------------------------------------------------------

export function generateASS(entries: ASSEntry[], options: ASSOptions): string {
  const {
    orientation,
    fontName = "Amiri",
    subtitlePosition = "bottom",
  } = options;
  const isPortrait = orientation === "portrait";
  const isSquare = orientation === "square";

  const fontSize = isPortrait ? 18 : isSquare ? 32 : 36;
  const marginL = isPortrait ? 10 : 50;
  const marginR = isPortrait ? 10 : 50;
  const maxChars = isPortrait ? 50 : isSquare ? 80 : 100;

  const { alignment, marginV: posMarginV } = getSubtitlePositionConfig(
    subtitlePosition,
    orientation,
  );

  const styleLine = `Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,${alignment},${marginL},${marginR},${posMarginV},1`;
  const header = buildASSHeader("Arabic Subtitles", styleLine);

  const events: string[] = [];

  for (const entry of entries) {
    if (entry.text.length > maxChars) {
      const parts = splitTextIntoParts(
        entry.text,
        Math.ceil(entry.text.length / maxChars),
      );
      const partDuration = (entry.end - entry.start) / parts.length;

      for (let i = 0; i < parts.length; i++) {
        const segStart = entry.start + i * partDuration;
        events.push(
          `Dialogue: 0,${formatASSTime(segStart)},${formatASSTime(segStart + partDuration)},Default,,0,0,0,,{\\q0}\u202B${parts[i]}`,
        );
      }
    } else {
      events.push(
        `Dialogue: 0,${formatASSTime(entry.start)},${formatASSTime(entry.end)},Default,,0,0,0,,{\\q0}\u202B${entry.text}`,
      );
    }
  }

  return header + events.join("\n") + "\n";
}

export function generateCombinedASS(
  arabicEntries: ASSEntry[],
  translationEntries: ASSEntry[],
  options: ASSOptions,
): string {
  const {
    orientation,
    fontName = "Amiri",
    subtitlePosition = "bottom",
  } = options;
  const isPortrait = orientation === "portrait";
  const isSquare = orientation === "square";

  const arFontSize = isPortrait ? 18 : isSquare ? 32 : 36;
  const trFontSize = isPortrait ? 12 : isSquare ? 20 : 20;
  const baseFontSize = isPortrait ? 14 : 18;
  const marginL = isPortrait ? 10 : 50;
  const marginR = isPortrait ? 10 : 50;

  const { alignment, marginV: posMarginV } = getSubtitlePositionConfig(
    subtitlePosition,
    orientation,
  );

  const styleLine = `Style: Default,${fontName},${baseFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,${alignment},${marginL},${marginR},${posMarginV},1`;
  const header = buildASSHeader("Quran Subtitles", styleLine);

  const events: string[] = [];
  const count = Math.max(arabicEntries.length, translationEntries.length);

  for (let i = 0; i < count; i++) {
    const arEntry = arabicEntries[i] ?? { start: 0, end: 0, text: "" };
    const trEntry = translationEntries[i] ?? { start: 0, end: 0, text: "" };

    const entryStart = arEntry.start || trEntry.start;
    const entryEnd = arEntry.end || trEntry.end;
    const entryDuration = entryEnd - entryStart;

    const segments = segmentVerse(arEntry.text, trEntry.text, orientation);
    const segmentDuration = entryDuration / segments.length;

    for (let seg = 0; seg < segments.length; seg++) {
      const segStart = entryStart + seg * segmentDuration;
      const segEnd = segStart + segmentDuration;

      const { arabic, translation } = segments[seg];
      let combinedText = "";

      if (arabic && translation) {
        combinedText =
          `{\\fn${fontName}}{\\fs${arFontSize}}{\\q0}\u202B${arabic}` +
          `\\N{\\fs4}\\N` +
          `{\\fnArial}{\\fs${trFontSize}}{\\q0}${translation}`;
      } else if (arabic) {
        combinedText = `{\\fn${fontName}}{\\fs${arFontSize}}{\\q0}\u202B${arabic}`;
      } else if (translation) {
        combinedText = `{\\fnArial}{\\fs${trFontSize}}{\\q0}${translation}`;
      }

      if (combinedText) {
        events.push(
          `Dialogue: 0,${formatASSTime(segStart)},${formatASSTime(segEnd)},Default,,0,0,0,,${combinedText}`,
        );
      }
    }
  }

  return header + events.join("\n") + "\n";
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// SRT subtitle generation
// ---------------------------------------------------------------------------

interface SRTEntry {
  start: number;
  end: number;
  text: string;
}
interface SRTOptions {
  orientation?: Orientation;
}

export function generateSRT(entries: SRTEntry[], options?: SRTOptions): string {
  const orientation = options?.orientation ?? "landscape";
  return (
    entries
      .map((entry, i) => {
        const wrappedLines = wrapTranslationText(entry.text, orientation);
        return `${i + 1}\n${formatSRTTime(entry.start)} --> ${formatSRTTime(entry.end)}\n${wrappedLines.join("\n")}`;
      })
      .join("\n\n") + "\n"
  );
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Audio concatenation
// ---------------------------------------------------------------------------

export function concatenateAudio(
  audioPaths: string[],
  output: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (audioPaths.length === 0) {
      return reject(new Error("No audio files to concatenate"));
    }

    if (audioPaths.length === 1) {
      fs.copyFileSync(audioPaths[0], output);
      return resolve();
    }

    const concatListPath = `${output}.concat.txt`;
    fs.writeFileSync(
      concatListPath,
      audioPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const cleanup = () => {
      try {
        fs.unlinkSync(concatListPath);
      } catch {
        /* ignore */
      }
    };

    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f", "concat", "-safe", "0", "-fflags", "+genpts"])
      .outputOptions(["-c:a", "libmp3lame", "-b:a", "192k"])
      .output(output)
      .on("end", () => {
        cleanup();
        resolve();
      })
      .on("error", (err) => {
        cleanup();
        reject(err);
      })
      .run();
  });
}
