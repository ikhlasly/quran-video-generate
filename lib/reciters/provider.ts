import type { UnifiedReciter } from '@/types/quran';

/**
 * Contract every reciter provider must implement.
 *
 * The provider pattern keeps each upstream API isolated behind a stable
 * interface so the rest of the app never needs to know whether a reciter came
 * from AlQuran, QuranPedia or any future source. New providers can be added
 * by implementing this interface and registering them in `ReciterService`.
 */
export interface ReciterProvider {
  /** Stable, unique name of the provider (matches `ReciterSource`). */
  readonly name: 'alquran' | 'quranpedia';

  /** Human-readable label for logs / UI. */
  readonly label: string;

  /**
   * Fetch the full list of reciters from the upstream API and normalize them
   * into `UnifiedReciter[]`. Implementations MUST:
   *  - never throw (return `[]` on failure so other providers still work),
   *  - populate `id` as `${name}:${providerId}`,
   *  - populate `source` as `this.name`.
   */
  fetchReciters(): Promise<UnifiedReciter[]>;

  /**
   * Build the per-ayah audio URLs for a given reciter and ayah range.
   *
   * For providers whose audio URLs are embedded in the ayah response
   * (AlQuran), this returns an empty array — the audio is fetched separately
   * through the existing `getAyahs()` flow. For providers that expose a static
   * audio server (QuranPedia), this returns one URL per ayah.
   *
   * @returns array of audio URLs, one per ayah in [startAyah, endAyah].
   *          A `null` entry means "no direct URL for this ayah".
   */
  getAyahAudioUrls(
    reciter: UnifiedReciter,
    surah: number,
    startAyah: number,
    endAyah: number,
  ): (string | null)[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with a timeout and optional retry. Returns the parsed JSON or
 * throws on terminal failure (callers wrap in try/catch).
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  opts: {
    timeoutMs?: number;
    retries?: number;
    backoffMs?: number;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const { timeoutMs = 15000, retries = 2, backoffMs = 600, headers } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(headers || {}) },
      });
      clearTimeout(timer);
      if (!res.ok) {
        // 4xx are not retryable; 5xx / network errors are.
        if (res.status >= 500 && attempt < retries) {
          await sleep(backoffMs * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}

/** Promise-based delay. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a reciter name for de-duplication across providers.
 * Lowercases, strips diacritics, punctuation and extra whitespace so that
 * "Mishary Rashid Alafasy", "mishary rashid alafasy" and "Mishary Rashid Alafasy (Gapless)"
 * collapse to a comparable key.
 */
export function normalizeReciterName(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/\(.*?\)/g, '') // drop parenthetical suffixes like "(Gapless)"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ensure a server URL ends with exactly one trailing slash. */
export function normalizeServerUrl(server: string): string {
  if (!server) return server;
  return server.endsWith('/') ? server : `${server}/`;
}

/** Pad a number to 3 digits with leading zeros (e.g. 1 -> "001"). */
export function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Classify a moshaf type string from an upstream payload into our enum.
 * QuranPedia uses values like "gapless", "no_gapless" / "versebyverse".
 */
export function classifyMoshafType(
  raw: unknown,
): 'versebyverse' | 'gapless' | 'unknown' {
  if (typeof raw !== 'string') return 'unknown';
  const v = raw.toLowerCase();
  if (v.includes('gapless') && !v.includes('no') && !v.includes('not')) {
    return 'gapless';
  }
  if (
    v.includes('verse') ||
    v.includes('no_gapless') ||
    v.includes('nogapless') ||
    v.includes('ayah')
  ) {
    return 'versebyverse';
  }
  return 'unknown';
}
