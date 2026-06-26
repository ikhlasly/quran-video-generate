import type { Reciter, UnifiedReciter } from '@/types/quran';
import { getReciters } from '@/lib/quran-api';
import type { ReciterProvider } from './provider';

/**
 * AlQuran Cloud provider.
 *
 * This is a thin adapter over the EXISTING `getReciters()` helper in
 * `lib/quran-api.ts`. We deliberately do NOT modify `quran-api.ts` so that the
 * original AlQuran integration remains 100% intact and all existing callers
 * (preview, generation, fallback lists) keep working unchanged.
 *
 * AlQuran's per-ayah audio URLs are embedded inside the ayah response returned
 * by `getAyahs()`, so `getAyahAudioUrls()` returns an empty array here — the
 * generation pipeline keeps using the existing `ayah.audio` field for the
 * AlQuran source.
 */
export class AlQuranProvider implements ReciterProvider {
  readonly name = 'alquran' as const;
  readonly label = 'AlQuran Cloud';

  async fetchReciters(): Promise<UnifiedReciter[]> {
    try {
      const reciters: Reciter[] = await getReciters();
      return reciters.map((r) => this.normalize(r));
    } catch (err) {
      // getReciters() already has its own fallback, but we guard anyway.
      console.error('[AlQuranProvider] fetchReciters failed:', err);
      return [];
    }
  }

  /**
   * AlQuran audio URLs are part of the ayah payload (versebyverse editions),
   * so there is no static per-ayah URL to compute here. The generation flow
   * uses `ayah.audio` directly when `reciterSource === 'alquran'`.
   */
  getAyahAudioUrls(): (string | null)[] {
    return [];
  }

  private normalize(r: Reciter): UnifiedReciter {
    return {
      id: `alquran:${r.identifier}`,
      source: 'alquran',
      providerId: r.identifier,
      identifier: r.identifier,
      name: r.name,
      englishName: r.englishName,
      language: r.language,
      format: r.format,
      type: r.type,
      direction: r.direction,
      metadata: 'Verse-by-verse',
    };
  }
}
