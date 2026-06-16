import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import https from 'https';
import http from 'http';
import type { SubtitlePosition, LogoPosition } from '@/types/quran';

export const ORIENTATION_PRESETS = {
  landscape: { width: 1920, height: 1080, label: 'Landscape (16:9)' },
  portrait: { width: 1080, height: 1920, label: 'Portrait (9:16)' },
  square: { width: 1080, height: 1080, label: 'Square (1:1)' },
} as const;

export type Orientation = keyof typeof ORIENTATION_PRESETS;

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

export async function getAudioDuration(filePath: string): Promise<number> {
  return ffprobeDuration(filePath);
}

export async function getVideoDuration(filePath: string): Promise<number> {
  return ffprobeDuration(filePath);
}

export function scaleVideo(
  input: string,
  output: string,
  orientation: Orientation
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        '-vf', `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-r', '30',
        '-an',
      ])
      .output(output)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Generate a simple gradient background video using FFmpeg (direct spawn)
export function generateBackgroundVideo(
  output: string,
  orientation: Orientation,
  duration: number = 60
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];
  const w = preset.width;
  const h = preset.height;

  return new Promise((resolve, reject) => {
    try {
      child_process.execFileSync('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=0x0d1b2a:s=${w}x${h}:d=${duration}:r=30`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-r', '30',
        '-an',
        '-pix_fmt', 'yuv420p',
        '-t', String(duration),
        '-y',
        output,
      ], { timeout: 120000 });
      resolve();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      reject(error);
    }
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
  logoSub?: string
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];

  // Build subtitle filter chain
  const subtitleFilters: string[] = [];
  if (showArabic && fs.existsSync(arabicSub)) {
    subtitleFilters.push(
      `subtitles='${arabicSub.replace(/'/g, "\\'").replace(/:/g, "\\:")}'`
    );
  }
  if (showTranslation && fs.existsSync(translationSub) && translationSub !== arabicSub) {
    subtitleFilters.push(
      `subtitles='${translationSub.replace(/'/g, "\\'").replace(/:/g, "\\:")}'`
    );
  }
  if (logoSub && fs.existsSync(logoSub)) {
    subtitleFilters.push(
      `subtitles='${logoSub.replace(/'/g, "\\'").replace(/:/g, "\\:")}'`
    );
  }

  // Calculate how many times to loop clips to cover audio duration
  const targetDuration = audioDuration && audioDuration > 0 ? audioDuration : 0;
  let totalClipDuration = 0;
  if (targetDuration > 0) {
    for (const clip of clipPaths) {
      try {
        totalClipDuration += await getVideoDuration(clip);
      } catch {
        totalClipDuration += 15; // assume 15s per clip if probe fails
      }
    }
  }

  const loopMultiplier = totalClipDuration > 0 && targetDuration > totalClipDuration
    ? Math.ceil(targetDuration / totalClipDuration) + 1
    : 1;

  // Create concat list (with loops if needed)
  const concatListPath = path.join(jobDir, 'concat.txt');
  const lines: string[] = [];
  for (let loop = 0; loop < loopMultiplier; loop++) {
    for (const clip of clipPaths) {
      lines.push(`file '${clip.replace(/'/g, "'\\''")}'`);
    }
  }
  fs.writeFileSync(concatListPath, lines.join('\n'));

  // Build combined filter: scale → pad → subtitles
  const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black,fps=24`;
  const allFilters = [scaleFilter, ...subtitleFilters];
  const vfChain = allFilters.join(',');

  const outputOpts = [
    '-vf', vfChain,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-pix_fmt', 'yuv420p',
  ];

  if (targetDuration > 0) {
    outputOpts.push('-t', String(Math.ceil(targetDuration)));
  }
  outputOpts.push('-shortest');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(audio)
      .outputOptions(outputOpts)
      .output(output)
      .on('end', () => {
        try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
        resolve();
      })
      .on('error', (err) => {
        try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
        reject(err);
      })
      .run();
  });
}

/**
 * Render video without audio but with subtitles, handling looping of clips
 * to ensure the video covers the full target duration.
 */
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
  logoSub?: string
): Promise<void> {
  const preset = ORIENTATION_PRESETS[orientation];

  // Build subtitle filter chain
  const subtitleFilters: string[] = [];
  if (showArabic && fs.existsSync(arabicSub)) {
    subtitleFilters.push(
      `subtitles='${arabicSub.replace(/'/g, "\\'").replace(/:/g, "\\:")}'`
    );
  }
  if (showTranslation && fs.existsSync(translationSub) && translationSub !== arabicSub) {
    subtitleFilters.push(
      `subtitles='${translationSub.replace(/'/g, "\\'").replace(/:/g, "\\:")}'`
    );
  }
  if (logoSub && fs.existsSync(logoSub)) {
    subtitleFilters.push(
      `subtitles='${logoSub.replace(/'/g, "\\'").replace(/:/g, "\\:")}'`
    );
  }

  // Calculate loop multiplier
  const duration = targetDuration && targetDuration > 0 ? targetDuration : 0;
  let totalClipDuration = 0;
  if (duration > 0) {
    for (const clip of clipPaths) {
      try {
        totalClipDuration += await getVideoDuration(clip);
      } catch {
        totalClipDuration += 15;
      }
    }
  }

  const loopMultiplier = totalClipDuration > 0 && duration > totalClipDuration
    ? Math.ceil(duration / totalClipDuration) + 1
    : 1;

  // Create concat list
  const concatListPath = path.join(jobDir, 'concat_noaudio.txt');
  const lines: string[] = [];
  for (let loop = 0; loop < loopMultiplier; loop++) {
    for (const clip of clipPaths) {
      lines.push(`file '${clip.replace(/'/g, "'\\''")}'`);
    }
  }
  fs.writeFileSync(concatListPath, lines.join('\n'));

  // Build combined filter
  const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:black,fps=24`;
  const allFilters = [scaleFilter, ...subtitleFilters];
  const vfChain = allFilters.join(',');

  const outputOpts = [
    '-vf', vfChain,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-an',
    '-pix_fmt', 'yuv420p',
  ];

  if (duration > 0) {
    outputOpts.push('-t', String(Math.ceil(duration)));
  }

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(outputOpts)
      .output(output)
      .on('end', () => {
        try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
        resolve();
      })
      .on('error', (err) => {
        try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
        reject(err);
      })
      .run();
  });
}

export function downloadFile(url: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(output);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(output);
    const protocol = url.startsWith('https') ? https : http;

    const doRequest = (requestUrl: string) => {
      protocol.get(requestUrl, (response) => {
        // Handle redirects
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          doRequest(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlinkSync(output);
        reject(err);
      });
    };

    doRequest(url);
  });
}

// Text wrapping utilities (kept for backwards compatibility)
export function wrapArabicText(text: string, _orientation: Orientation): string[] {
  return ['\u202B' + text];
}

export function wrapTranslationText(text: string, orientation: Orientation): string[] {
  const maxChars = orientation === 'portrait' ? 30 : 44;
  if (text.length <= maxChars) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

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

  // Max 2 lines
  if (lines.length > 2) {
    return [lines.slice(0, Math.ceil(lines.length / 2)).join(' '), lines.slice(Math.ceil(lines.length / 2)).join(' ')];
  }
  return lines;
}

// ASS subtitle generation
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

/**
 * Get ASS alignment value and margin based on subtitle position.
 * ASS uses numpad notation: 1-3 bottom, 4-6 middle, 7-9 top.
 * We use center alignment: 2 (bottom), 5 (middle), 8 (top).
 */
function getSubtitlePositionConfig(position: SubtitlePosition = 'bottom', orientation: Orientation): { alignment: number; marginV: number } {
  const isPortrait = orientation === 'portrait';
  switch (position) {
    case 'top':
      // Top center
      return { alignment: 8, marginV: isPortrait ? 15 : 35 };
    case 'center':
      // Middle center
      return { alignment: 5, marginV: 0 };
    case 'bottom':
    default:
      // Bottom center
      return { alignment: 2, marginV: isPortrait ? 15 : 35 };
  }
}

/**
 * Get ASS alignment and margins for a logo position (6 positions: 3 top + 3 bottom).
 * ASS numpad alignment: 7=top-left, 8=top-center, 9=top-right,
 *                       1=bottom-left, 2=bottom-center, 3=bottom-right.
 */
function getLogoPositionConfig(position: LogoPosition, orientation: Orientation): { alignment: number; marginV: number; marginL: number; marginR: number } {
  const isPortrait = orientation === 'portrait';
  const marginH = isPortrait ? 12 : 30;
  const marginVTop = isPortrait ? 12 : 30;
  const marginVBottom = isPortrait ? 12 : 30;
  switch (position) {
    case 'top-left':
      return { alignment: 7, marginV: marginVTop, marginL: marginH, marginR: 0 };
    case 'top-center':
      return { alignment: 8, marginV: marginVTop, marginL: 0, marginR: 0 };
    case 'top-right':
      return { alignment: 9, marginV: marginVTop, marginL: 0, marginR: marginH };
    case 'bottom-left':
      return { alignment: 1, marginV: marginVBottom, marginL: marginH, marginR: 0 };
    case 'bottom-center':
      return { alignment: 2, marginV: marginVBottom, marginL: 0, marginR: 0 };
    case 'bottom-right':
    default:
      return { alignment: 3, marginV: marginVBottom, marginL: 0, marginR: marginH };
  }
}

/**
 * Generate an ASS file for a persistent text logo overlay.
 * The logo is displayed for the entire video duration at the chosen position.
 * Uses a semi-transparent white text with a dark outline for visibility on any background.
 */
export function generateLogoASS(
  logoText: string,
  position: LogoPosition,
  orientation: Orientation,
  duration: number
): string {
  const isPortrait = orientation === 'portrait';
  const fontSize = isPortrait ? 11 : 18;
  const { alignment, marginV, marginL, marginR } = getLogoPositionConfig(position, orientation);

  // Escape any braces/newlines in the logo text to avoid ASS override parsing issues
  const safeText = logoText
    .replace(/\\/g, '')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\n/g, ' ');

  const header = `\ufeff[Script Info]
Title: Logo Overlay
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Logo,Arial,${fontSize},&HCCFFFFFF,&HCCFFFFFF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,${alignment},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, Time, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Single dialogue entry spanning the full video duration
  const start = formatASSTime(0);
  const end = formatASSTime(Math.max(duration, 1));
  const text = `{\\q0}${safeText}`;
  const events = `Dialogue: 0,${start},${end},Logo,,0,0,0,,${text}`;

  return header + events + '\n';
}

/**
 * Split text into N roughly equal parts at word boundaries.
 */
function splitTextIntoParts(text: string, numParts: number): string[] {
  if (numParts <= 1) return [text];

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [text];
  if (words.length <= numParts) {
    // If fewer words than parts, distribute words
    const parts: string[] = [];
    for (const w of words) parts.push(w);
    // Pad with empty strings if needed
    while (parts.length < numParts) parts.push('');
    return parts;
  }

  const wordsPerPart = Math.ceil(words.length / numParts);
  const parts: string[] = [];

  for (let i = 0; i < numParts; i++) {
    const start = i * wordsPerPart;
    const end = Math.min(start + wordsPerPart, words.length);
    if (start < words.length) {
      parts.push(words.slice(start, end).join(' '));
    }
  }

  // Filter out empty parts
  return parts.filter(p => p.length > 0);
}

/**
 * Segment a long verse into multiple subtitle segments.
 * Each segment contains matching Arabic and translation text.
 * Returns an array of segments with proportional timing shares.
 */
interface VerseSegment {
  arabic: string;
  translation: string;
}

function segmentVerse(
  arabicText: string,
  translationText: string,
  orientation: Orientation
): VerseSegment[] {
  const isPortrait = orientation === 'portrait';
  const isSquare = orientation === 'square';

  // Character thresholds before we split.
  // Arabic chars are ~1.5x wider than Latin, so thresholds are lower.
  const maxArabicChars = isPortrait ? 50 : (isSquare ? 80 : 100);
  const maxTranslationChars = isPortrait ? 60 : (isSquare ? 90 : 120);

  const arabicNeedsSplit = arabicText.length > maxArabicChars;
  const translationNeedsSplit = translationText.length > maxTranslationChars;

  if (!arabicNeedsSplit && !translationNeedsSplit) {
    return [{ arabic: arabicText, translation: translationText }];
  }

  // Determine number of segments needed
  const arabicSegments = arabicNeedsSplit
    ? Math.ceil(arabicText.length / maxArabicChars)
    : 1;
  const translationSegments = translationNeedsSplit
    ? Math.ceil(translationText.length / maxTranslationChars)
    : 1;
  const numSegments = Math.max(arabicSegments, translationSegments, 2);

  // Split both texts into matching number of parts at word boundaries
  const arabicParts = splitTextIntoParts(arabicText, numSegments);
  const translationParts = splitTextIntoParts(translationText, numSegments);

  // Combine matching parts
  const actualSegments = Math.max(arabicParts.length, translationParts.length);
  const segments: VerseSegment[] = [];
  for (let i = 0; i < actualSegments; i++) {
    segments.push({
      arabic: arabicParts[i] || '',
      translation: translationParts[i] || '',
    });
  }

  return segments;
}

/**
 * Generate ASS subtitles for Arabic-only display.
 * Supports bottom/center/top positioning with segmentation for long verses.
 */
export function generateASS(entries: ASSEntry[], options: ASSOptions): string {
  const { orientation, fontName = 'Amiri', subtitlePosition = 'bottom' } = options;
  const isPortrait = orientation === 'portrait';
  const isSquare = orientation === 'square';
  const fontSize = isPortrait ? 10 : (isSquare ? 20 : 22);
  const marginL = isPortrait ? 10 : 50;
  const marginR = isPortrait ? 10 : 50;

  // Get alignment and vertical margin based on position
  const { alignment, marginV: posMarginV } = getSubtitlePositionConfig(subtitlePosition, orientation);

  const header = `\ufeff[Script Info]
Title: Arabic Subtitles
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,${alignment},${marginL},${marginR},${posMarginV},1

[Events]
Format: Layer, Start, Time, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];

  for (const entry of entries) {
    // Segment long Arabic verses
    const maxChars = isPortrait ? 50 : (isSquare ? 80 : 100);
    const needsSplit = entry.text.length > maxChars;

    if (needsSplit) {
      const parts = splitTextIntoParts(entry.text, Math.ceil(entry.text.length / maxChars));
      const duration = entry.end - entry.start;
      const partDuration = duration / parts.length;

      for (let i = 0; i < parts.length; i++) {
        const segStart = entry.start + (i * partDuration);
        const segEnd = segStart + partDuration;
        const rtlText = '\u202B' + parts[i];
        const text = `{\\q0}${rtlText}`;
        events.push(`Dialogue: 0,${formatASSTime(segStart)},${formatASSTime(segEnd)},Default,,0,0,0,,${text}`);
      }
    } else {
      const start = formatASSTime(entry.start);
      const end = formatASSTime(entry.end);
      const rtlText = '\u202B' + entry.text;
      const text = `{\\q0}${rtlText}`;
      events.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
    }
  }

  return header + events.join('\n') + '\n';
}

/**
 * Generate a combined ASS file with a UNIFIED subtitle block layout.
 *
 * Design:
 * - Single "Default" style with configurable alignment (bottom/center/top)
 * - Each subtitle entry contains BOTH Arabic and Translation in one block
 *   using \N (forced line break) to separate them
 * - Arabic uses inline {\fnAmiri}{\fsXX} override for proper font/size
 * - Translation uses inline {\fnArial}{\fsYY} override
 * - Long verses are automatically segmented into multiple subtitle entries
 *   with proportional timing
 * - Both texts stay within the subtitle region
 * - No overlap, no detached positioning
 */
export function generateCombinedASS(
  arabicEntries: ASSEntry[],
  translationEntries: ASSEntry[],
  options: ASSOptions
): string {
  const { orientation, fontName = 'Amiri', subtitlePosition = 'bottom' } = options;
  const isPortrait = orientation === 'portrait';
  const isSquare = orientation === 'square';

  // Base font sizes (used via inline overrides in dialogue text)
  const arFontSize = isPortrait ? 10 : (isSquare ? 20 : 22);
  const trFontSize = isPortrait ? 9 : (isSquare ? 16 : 16);

  // Style margins (horizontal only — vertical comes from position config)
  const marginL = isPortrait ? 10 : 50;
  const marginR = isPortrait ? 10 : 50;

  // Get alignment and vertical margin based on position
  const { alignment, marginV: posMarginV } = getSubtitlePositionConfig(subtitlePosition, orientation);

  // Use a base font size for the style (will be overridden inline)
  const baseFontSize = isPortrait ? 10 : 18;

  const header = `\ufeff[Script Info]
Title: Quran Subtitles
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${baseFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,${alignment},${marginL},${marginR},${posMarginV},1

[Events]
Format: Layer, Start, Time, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];

  const count = Math.max(arabicEntries.length, translationEntries.length);

  for (let i = 0; i < count; i++) {
    const arEntry = arabicEntries[i] || { start: 0, end: 0, text: '' };
    const trEntry = translationEntries[i] || { start: 0, end: 0, text: '' };

    // Use Arabic entry timing as the base (it's the primary text)
    const entryStart = arEntry.start || trEntry.start;
    const entryEnd = arEntry.end || trEntry.end;
    const entryDuration = entryEnd - entryStart;

    const arabicText = arEntry.text || '';
    const translationText = trEntry.text || '';

    // Segment long verses into readable chunks
    const segments = segmentVerse(arabicText, translationText, orientation);
    const segmentDuration = entryDuration / segments.length;

    for (let seg = 0; seg < segments.length; seg++) {
      const segStart = entryStart + (seg * segmentDuration);
      const segEnd = segStart + segmentDuration;

      // Build the combined text block with inline font overrides
      let combinedText = '';

      if (segments[seg].arabic && segments[seg].translation) {
        // Both Arabic and Translation: Arabic on first line, Translation on second line
        const rtlArabic = '\u202B' + segments[seg].arabic;
        combinedText = `{\\fn${fontName}}{\\fs${arFontSize}}{\\q0}${rtlArabic}\\N{\\fnArial}{\\fs${trFontSize}}{\\q0}${segments[seg].translation}`;
      } else if (segments[seg].arabic) {
        // Arabic only
        const rtlArabic = '\u202B' + segments[seg].arabic;
        combinedText = `{\\fn${fontName}}{\\fs${arFontSize}}{\\q0}${rtlArabic}`;
      } else if (segments[seg].translation) {
        // Translation only
        combinedText = `{\\fnArial}{\\fs${trFontSize}}{\\q0}${segments[seg].translation}`;
      }

      if (combinedText) {
        events.push(`Dialogue: 0,${formatASSTime(segStart)},${formatASSTime(segEnd)},Default,,0,0,0,,${combinedText}`);
      }
    }
  }

  return header + events.join('\n') + '\n';
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// SRT subtitle generation for translations
interface SRTEntry {
  start: number;
  end: number;
  text: string;
}

interface SRTOptions {
  orientation?: Orientation;
}

export function generateSRT(entries: SRTEntry[], options?: SRTOptions): string {
  const orientation = options?.orientation || 'landscape';
  const srtEntries = entries.map((entry, i) => {
    const start = formatSRTTime(entry.start);
    const end = formatSRTTime(entry.end);
    const wrappedLines = wrapTranslationText(entry.text, orientation);
    return `${i + 1}\n${start} --> ${end}\n${wrappedLines.join('\n')}`;
  });

  return srtEntries.join('\n\n') + '\n';
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// Concatenate audio files
export function concatenateAudio(audioPaths: string[], output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (audioPaths.length === 0) {
      return reject(new Error('No audio files to concatenate'));
    }

    if (audioPaths.length === 1) {
      fs.copyFileSync(audioPaths[0], output);
      resolve();
      return;
    }

    const concatListPath = output + '.concat.txt';
    const lines = audioPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`);
    fs.writeFileSync(concatListPath, lines.join('\n'));

    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
      ])
      .output(output)
      .on('end', () => {
        try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
        resolve();
      })
      .on('error', (err) => {
        try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
        reject(err);
      })
      .run();
  });
}
