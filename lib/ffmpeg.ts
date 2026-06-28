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

const OUTPUT_FPS = 30;
const CLIP_DURATION_FALLBACK_S = 5; // Safer fallback

const VIDEO_ENCODER = process.env.VIDEO_ENCODER || "libx264";
const VIDEO_PRESET = process.env.VIDEO_PRESET || "veryfast";
const VIDEO_CRF = process.env.VIDEO_CRF || "23";

// ---------------------------------------------------------------------------
// ffprobe helpers
// ---------------------------------------------------------------------------

function ffprobeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    child_process.execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 5000 },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        const dur = parseFloat(stdout.trim());
        if (!isNaN(dur) && dur > 0) resolve(dur);
        else reject(new Error(`Could not determine duration of ${filePath}`));
      },
    );
  });
}

export const getAudioDuration = (filePath: string): Promise<number> =>
  ffprobeDuration(filePath);
export const getVideoDuration = (filePath: string): Promise<number> =>
  ffprobeDuration(filePath);

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

function escapeSubtitlePath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

async function buildSubtitleFilters(
  arabicSub: string,
  translationSub: string,
  showArabic: boolean,
  showTranslation: boolean,
  logoSub?: string,
): Promise<string[]> {
  const filters: string[] = [];
  const checks: Promise<void>[] = [];

  if (showArabic) {
    checks.push(
      fs.promises
        .access(arabicSub)
        .then(() => {
          filters.push(`subtitles='${escapeSubtitlePath(arabicSub)}'`);
        })
        .catch(() => {}),
    );
  }
  if (showTranslation && translationSub !== arabicSub) {
    checks.push(
      fs.promises
        .access(translationSub)
        .then(() => {
          filters.push(`subtitles='${escapeSubtitlePath(translationSub)}'`);
        })
        .catch(() => {}),
    );
  }
  if (logoSub) {
    checks.push(
      fs.promises
        .access(logoSub)
        .then(() => {
          filters.push(`subtitles='${escapeSubtitlePath(logoSub)}'`);
        })
        .catch(() => {}),
    );
  }

  await Promise.all(checks);
  return filters;
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
        `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black`,
        "-c:v",
        VIDEO_ENCODER,
        "-preset",
        VIDEO_PRESET,
        "-crf",
        VIDEO_CRF,
        "-r",
        String(OUTPUT_FPS),
        "-an",
        "-movflags",
        "+faststart",
      ])
      .output(output)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

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
        VIDEO_ENCODER,
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
        "-movflags",
        "+faststart",
        "-y",
        output,
      ],
      { timeout: 120_000 },
      (err) =>
        err
          ? reject(err instanceof Error ? err : new Error(String(err)))
          : resolve(),
    );
  });
}

export async function renderVideo(
  clipPaths: string[],
  audio: string,
  arabicSub: string,
  translationSub: string,
  output: string,
  jobDir: string, // Kept for signature compatibility
  orientation: Orientation,
  audioDuration?: number,
  showArabic: boolean = true,
  showTranslation: boolean = true,
  logoSub?: string,
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];
  const targetDuration = audioDuration && audioDuration > 0 ? audioDuration : 0;

  // Calculate safe loop multiplier
  let loopMultiplier = 1;
  if (targetDuration > 0 && clipPaths.length > 0) {
    const totalClipDuration = await probeClipDurations(clipPaths);
    loopMultiplier =
      totalClipDuration > 0
        ? Math.ceil(targetDuration / totalClipDuration) + 2
        : Math.max(
            10,
            Math.ceil(
              targetDuration / (clipPaths.length * CLIP_DURATION_FALLBACK_S),
            ) + 2,
          );
  }

  const subtitleFilters = await buildSubtitleFilters(
    arabicSub,
    translationSub,
    showArabic,
    showTranslation,
    logoSub,
  );
  const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${OUTPUT_FPS},setsar=1`;

  // Build filter_complex dynamically to safely concat videos of varying resolutions
  const inputs: string[] = [];
  const filterParts: string[] = [];
  let inputIdx = 0;
  const videoLabels: string[] = [];

  for (let loop = 0; loop < loopMultiplier; loop++) {
    for (const clip of clipPaths) {
      inputs.push(clip);
      const label = `v${inputIdx}`;
      filterParts.push(`[${inputIdx}:v]${scaleFilter}[${label}]`);
      videoLabels.push(`[${label}]`);
      inputIdx++;
    }
  }

  const concatLabel = "[vconcat]";
  filterParts.push(
    `${videoLabels.join("")}concat=n=${videoLabels.length}:v=1:a=0${concatLabel}`,
  );

  if (subtitleFilters.length > 0) {
    filterParts.push(`${concatLabel}${subtitleFilters.join(",")}[vout]`);
  } else {
    filterParts.push(`${concatLabel}null[vout]`);
  }

  const outputOpts: string[] = [
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
    "-map",
    `${inputIdx}:a:0`, // Audio is the last input
    "-c:v",
    VIDEO_ENCODER,
    "-preset",
    VIDEO_PRESET,
    "-crf",
    VIDEO_CRF,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-fps_mode",
    "cfr",
    "-movflags",
    "+faststart",
    "-shortest", // Cuts video exactly when audio ends, preventing frozen frames
  ];

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    inputs.forEach((inp) => command.input(inp));
    command.input(audio);

    command
      .outputOptions(outputOpts)
      .output(output)
      .on("end", () => resolve())
      .on("error", reject)
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

  let loopMultiplier = 1;
  if (duration > 0 && clipPaths.length > 0) {
    const totalClipDuration = await probeClipDurations(clipPaths);
    loopMultiplier =
      totalClipDuration > 0
        ? Math.ceil(duration / totalClipDuration) + 2
        : Math.max(
            10,
            Math.ceil(
              duration / (clipPaths.length * CLIP_DURATION_FALLBACK_S),
            ) + 2,
          );
  }

  const subtitleFilters = await buildSubtitleFilters(
    arabicSub,
    translationSub,
    showArabic,
    showTranslation,
    logoSub,
  );
  const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${OUTPUT_FPS},setsar=1`;

  const inputs: string[] = [];
  const filterParts: string[] = [];
  let inputIdx = 0;
  const videoLabels: string[] = [];

  for (let loop = 0; loop < loopMultiplier; loop++) {
    for (const clip of clipPaths) {
      inputs.push(clip);
      const label = `v${inputIdx}`;
      filterParts.push(`[${inputIdx}:v]${scaleFilter}[${label}]`);
      videoLabels.push(`[${label}]`);
      inputIdx++;
    }
  }

  const concatLabel = "[vconcat]";
  filterParts.push(
    `${videoLabels.join("")}concat=n=${videoLabels.length}:v=1:a=0${concatLabel}`,
  );

  if (subtitleFilters.length > 0) {
    filterParts.push(`${concatLabel}${subtitleFilters.join(",")}[vout]`);
  } else {
    filterParts.push(`${concatLabel}null[vout]`);
  }

  const outputOpts: string[] = [
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
    "-c:v",
    VIDEO_ENCODER,
    "-preset",
    VIDEO_PRESET,
    "-crf",
    VIDEO_CRF,
    "-an",
    "-pix_fmt",
    "yuv420p",
    "-fps_mode",
    "cfr",
    "-movflags",
    "+faststart",
  ];

  if (duration > 0) outputOpts.push("-t", String(Math.ceil(duration)));

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    inputs.forEach((inp) => command.input(inp));

    command
      .outputOptions(outputOpts)
      .output(output)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

// ---------------------------------------------------------------------------
// File download
// ---------------------------------------------------------------------------

export function downloadFile(url: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.promises
      .mkdir(path.dirname(output), { recursive: true })
      .then(() => {
        const file = fs.createWriteStream(output);
        const doRequest = (requestUrl: string, redirectCount = 0) => {
          if (redirectCount > 10)
            return reject(new Error("Too many redirects"));

          const protocol = requestUrl.startsWith("https") ? https : http;
          const req = protocol.get(
            requestUrl,
            { timeout: 30000 },
            (response) => {
              if (
                response.statusCode &&
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location
              ) {
                response.resume();
                doRequest(response.headers.location, redirectCount + 1);
                return;
              }
              if (response.statusCode !== 200) {
                reject(
                  new Error(
                    `Download failed with status ${response.statusCode}`,
                  ),
                );
                file.close();
                fs.promises.unlink(output).catch(() => {});
                return;
              }
              response.pipe(file);
              file.on("finish", () => {
                file.close();
                resolve();
              });
            },
          );

          req.on("error", (err) => {
            file.close();
            fs.promises.unlink(output).catch(() => {});
            reject(err);
          });

          req.on("timeout", () =>
            req.destroy(
              new Error(`Request timed out downloading ${requestUrl}`),
            ),
          );
        };

        doRequest(url);
      })
      .catch(reject);
  });
}

// ---------------------------------------------------------------------------
// Text & Subtitles
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
) {
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
) {
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

function buildASSHeader(title: string, styleLine: string): string {
  return `\ufeff[Script Info]\nTitle: ${title}\nScriptType: v4.00+\nPlayResX: 384\nPlayResY: 288\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${styleLine}\n\n[Events]\nFormat: Layer, Start, Time, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
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
    // Prevent 0 or negative duration entries which corrupt ASS parsing
    const safeEnd = Math.max(entry.end, entry.start + 0.1);
    if (entry.text.length > maxChars) {
      const parts = splitTextIntoParts(
        entry.text,
        Math.ceil(entry.text.length / maxChars),
      );
      const partDuration = (safeEnd - entry.start) / parts.length;
      for (let i = 0; i < parts.length; i++) {
        const segStart = entry.start + i * partDuration;
        events.push(
          `Dialogue: 0,${formatASSTime(segStart)},${formatASSTime(segStart + partDuration)},Default,,0,0,0,,{\\q0}\u202B${parts[i]}`,
        );
      }
    } else {
      events.push(
        `Dialogue: 0,${formatASSTime(entry.start)},${formatASSTime(safeEnd)},Default,,0,0,0,,{\\q0}\u202B${entry.text}`,
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
    let entryEnd = arEntry.end || trEntry.end;

    // Prevent broken subtitles at the end: ensure duration is strictly positive
    if (entryEnd <= entryStart) entryEnd = entryStart + 0.5;

    const entryDuration = entryEnd - entryStart;
    const segments = segmentVerse(arEntry.text, trEntry.text, orientation);
    const segmentDuration = entryDuration / segments.length;

    for (let seg = 0; seg < segments.length; seg++) {
      const segStart = entryStart + seg * segmentDuration;
      const segEnd = segStart + segmentDuration;
      const { arabic, translation } = segments[seg];

      let combinedText = "";
      if (arabic && translation) {
        combinedText = `{\\fn${fontName}}{\\fs${arFontSize}}{\\q0}\u202B${arabic}\\N{\\fs4}\\N{\\fnArial}{\\fs${trFontSize}}{\\q0}${translation}`;
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
// SRT & Audio
// ---------------------------------------------------------------------------

export function generateSRT(
  entries: { start: number; end: number; text: string }[],
  options?: { orientation?: Orientation },
): string {
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

export async function concatenateAudio(
  audioPaths: string[],
  output: string,
): Promise<void> {
  if (audioPaths.length === 0) throw new Error("No audio files to concatenate");
  if (audioPaths.length === 1) {
    await fs.promises.copyFile(audioPaths[0], output);
    return;
  }

  const concatListPath = `${output}.concat.txt`;
  await fs.promises.writeFile(
    concatListPath,
    audioPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf-8",
  );

  return new Promise((resolve, reject) => {
    const cleanup = async () => {
      try {
        await fs.promises.unlink(concatListPath);
      } catch {}
    };
    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f", "concat", "-safe", "0", "-fflags", "+genpts"])
      .outputOptions(["-c:a", "libmp3lame", "-b:a", "192k"])
      .output(output)
      .on("end", async () => {
        await cleanup();
        resolve();
      })
      .on("error", async (err) => {
        await cleanup();
        reject(err);
      })
      .run();
  });
}
