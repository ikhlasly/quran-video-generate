import type { UnifiedReciter, ReciterSource } from '@/types/quran';
import type { ReciterProvider } from './provider';
import { AlQuranProvider } from './alquran-provider';
import { QuranPediaProvider } from './quranpedia-provider';
import { normalizeReciterName } from './provider';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  reciters: UnifiedReciter[];
  byId: Map<string, UnifiedReciter>;
  fetchedAt: number;
}

/**
 * Unified reciter service.
 *
 * Holds a registry of `ReciterProvider` instances (dependency injection via
 * the constructor / `registerProvider`). On `listReciters()` it queries every
 * provider in parallel, merges the results, removes duplicates (preferring
 * AlQuran on a name collision since its audio flow is the most battle-tested
 * in this app), and caches the merged list for `CACHE_TTL_MS`.
 *
 * If a provider fails, the service still returns whatever the other providers
 * produced — never an empty list when at least one provider responded.
 */
export class ReciterService {
  private readonly providers: ReciterProvider[] = [];
  private cache: CacheEntry | null = null;
  private inflight: Promise<UnifiedReciter[]> | null = null;

  constructor(providers?: ReciterProvider[]) {
    if (providers && providers.length) {
      this.providers.push(...providers);
    } else {
      // Default registry: AlQuran first (preferred on dedup), QuranPedia second.
      this.providers.push(new AlQuranProvider(), new QuranPediaProvider());
    }
  }

  /** Register an additional provider at runtime (for future providers). */
  registerProvider(provider: ReciterProvider): void {
    if (!this.providers.some((p) => p.name === provider.name)) {
      this.providers.push(provider);
      this.invalidate();
    }
  }

  /** Force the next `listReciters()` call to re-fetch from all providers. */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * Return the merged, de-duplicated list of reciters from all providers.
   * Uses cached results when fresh; otherwise fetches in parallel.
   */
  async listReciters(): Promise<UnifiedReciter[]> {
    const cached = this.cache;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.reciters;
    }
    // De-duplicate concurrent callers onto a single fetch.
    if (this.inflight) return this.inflight;
    this.inflight = this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Find a single reciter by its unified id (e.g. `quranpedia:1`). */
  async getReciter(id: string): Promise<UnifiedReciter | null> {
    const byId = (await this.getIndex()).byId;
    return byId.get(id) ?? null;
  }

  /**
   * Synchronous lookup against the cache. Returns `null` if the cache is cold.
   * Useful inside the generation pipeline where we already have the moshaf
   * info on the config and just want a best-effort lookup.
   */
  getReciterSync(id: string): UnifiedReciter | null {
    return this.cache?.byId.get(id) ?? null;
  }

  /**
   * Filter the merged list by a free-text query. Matches against english name,
   * arabic name, style and letter. Case-insensitive.
   */
  async searchReciters(query: string): Promise<UnifiedReciter[]> {
    const all = await this.listReciters();
    const q = (query || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => {
      return (
        r.englishName?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q) ||
        r.style?.toLowerCase().includes(q) ||
        r.letter?.toLowerCase() === q
      );
    });
  }

  /** Convenience: get only reciters from a given source. */
  async listBySource(source: ReciterSource): Promise<UnifiedReciter[]> {
    const all = await this.listReciters();
    return all.filter((r) => r.source === source);
  }

  /**
   * Build per-ayah audio URLs for a reciter by delegating to its provider.
   * Returns an empty array if the reciter (or its provider) can't be found.
   * This keeps callers (e.g. the generation pipeline) decoupled from the
   * concrete provider classes.
   */
  async getAyahAudioUrls(
    id: string,
    surah: number,
    startAyah: number,
    endAyah: number,
  ): Promise<(string | null)[]> {
    const reciter = await this.getReciter(id);
    if (!reciter) return [];
    const provider = this.providers.find((p) => p.name === reciter.source);
    if (!provider) return [];
    return provider.getAyahAudioUrls(reciter, surah, startAyah, endAyah);
  }

  /** Synchronous variant using the cache (best-effort). */
  getAyahAudioUrlsSync(
    id: string,
    surah: number,
    startAyah: number,
    endAyah: number,
  ): (string | null)[] {
    const reciter = this.getReciterSync(id);
    if (!reciter) return [];
    const provider = this.providers.find((p) => p.name === reciter.source);
    if (!provider) return [];
    return provider.getAyahAudioUrls(reciter, surah, startAyah, endAyah);
  }

  // -----------------------------------------------------------------------

  private async getIndex(): Promise<CacheEntry> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache;
    }
    await this.listReciters();
    return this.cache!;
  }

  private async refresh(): Promise<UnifiedReciter[]> {
    // Query all providers in parallel; each is responsible for not throwing.
    const results = await Promise.all(
      this.providers.map(async (p) => {
        try {
          const list = await p.fetchReciters();
          return { provider: p, list };
        } catch (err) {
          console.error(`[ReciterService] provider "${p.name}" failed:`, err);
          return { provider: p, list: [] as UnifiedReciter[] };
        }
      }),
    );

    const merged = this.mergeAndDedup(results);

    const byId = new Map<string, UnifiedReciter>();
    for (const r of merged) byId.set(r.id, r);

    this.cache = { reciters: merged, byId, fetchedAt: Date.now() };
    return merged;
  }

  /**
   * Merge per-provider lists into one, removing duplicates.
   *
   * De-dup strategy: when two reciters (from different providers) share the
   * same normalized english name, the AlQuran entry wins (preferred source —
   * its audio flow is the most reliable in this app). The QuranPedia duplicate
   * is dropped. Within a single provider, duplicates are collapsed by
   * `providerId`.
   */
  private mergeAndDedup(
    results: { provider: ReciterProvider; list: UnifiedReciter[] }[],
  ): UnifiedReciter[] {
    // Order providers so AlQuran is processed first → its entries win dedup.
    const ordered = [...results].sort((a, b) => {
      if (a.provider.name === 'alquran') return -1;
      if (b.provider.name === 'alquran') return 1;
      return 0;
    });

    const seenProviderId = new Set<string>(); // `${source}:${providerId}`
    const seenName = new Set<string>(); // normalized english name
    const merged: UnifiedReciter[] = [];

    for (const { provider, list } of ordered) {
      for (const r of list) {
        const dedupKey = `${r.source}:${r.providerId}`;
        if (seenProviderId.has(dedupKey)) continue;

        const nameKey = normalizeReciterName(r.englishName || r.name);
        // AlQuran (processed first) claims the name. Later providers with the
        // same name are skipped to avoid duplicate entries.
        if (nameKey && seenName.has(nameKey) && provider.name !== 'alquran') {
          continue;
        }

        seenProviderId.add(dedupKey);
        if (nameKey) seenName.add(nameKey);
        merged.push(r);
      }
    }

    // Final A→Z sort for stable UI ordering.
    merged.sort((a, b) =>
      (a.englishName || a.name).localeCompare(b.englishName || b.name),
    );
    return merged;
  }
}
