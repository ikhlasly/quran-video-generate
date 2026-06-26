import { NextRequest, NextResponse } from 'next/server';
import { getAyahs } from '@/lib/quran-api';
import { getReciterService } from '@/lib/reciters';
import type { ReciterSource } from '@/types/quran';

/**
 * GET /api/quran/ayahs?surah=1&startAyah=1&endAyah=7&reciter=ar.alafasy&translation=en.sahih
 *
 * Backward-compatible ayah endpoint. The `reciter` param is still an AlQuran
 * edition identifier and the default behavior is unchanged.
 *
 * Additional (optional) params for QuranPedia reciters:
 *  - reciterSource: 'alquran' | 'quranpedia'   (default 'alquran')
 *  - reciterUnifiedId: e.g. 'quranpedia:1'     (preferred lookup key)
 *  - reciterMoshafServer: direct server URL    (fallback if lookup misses)
 *  - reciterMoshafType: 'versebyverse' | 'gapless' | 'unknown'
 *
 * When `reciterSource === 'quranpedia'`, the Arabic text is fetched using a
 * stable AlQuran edition (`ar.alafasy`) and each ayah's `audio` field is then
 * overridden with the QuranPedia per-ayah URL so the in-browser preview can
 * play the correct reciter.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const surah = parseInt(searchParams.get('surah') || '1');
    const startAyah = parseInt(searchParams.get('startAyah') || '1');
    const endAyah = parseInt(searchParams.get('endAyah') || '7');
    const reciterParam = searchParams.get('reciter') || 'ar.alafasy';
    const translation = searchParams.get('translation') || 'en.sahih';

    const reciterSource = (searchParams.get('reciterSource') || 'alquran') as ReciterSource;
    const reciterUnifiedId = searchParams.get('reciterUnifiedId') || undefined;
    const moshafServerOverride = searchParams.get('reciterMoshafServer') || undefined;
    const moshafTypeOverride = searchParams.get('reciterMoshafType') as
      | 'versebyverse'
      | 'gapless'
      | 'unknown'
      | null;

    // For the AlQuran source, use the requested reciter directly (unchanged).
    // For QuranPedia, fall back to a stable AlQuran edition just to obtain the
    // Arabic text + ayah structure; audio will be overridden below.
    const alquranReciterForText =
      reciterSource === 'quranpedia' ? 'ar.alafasy' : reciterParam;

    const result = await getAyahs(
      surah,
      startAyah,
      endAyah,
      alquranReciterForText,
      translation,
    );

    // Override audio URLs for QuranPedia reciters.
    if (reciterSource === 'quranpedia') {
      try {
        const service = getReciterService();
        let moshafServer = moshafServerOverride;
        let moshafType = moshafTypeOverride ?? 'unknown';

        if (reciterUnifiedId) {
          const reciter = await service.getReciter(reciterUnifiedId);
          const moshaf = reciter?.preferredMoshaf ?? reciter?.moshaf?.[0];
          if (moshaf?.server) {
            moshafServer = moshaf.server;
            moshafType = moshaf.moshafType ?? moshafType;
          }
        }

        if (moshafServer) {
          const base = moshafServer.endsWith('/')
            ? moshafServer
            : `${moshafServer}/`;
          const surahStr = String(surah).padStart(3, '0');
          result.arabic.ayahs = result.arabic.ayahs.map((a, idx) => {
            const ayahNum = a.numberInSurah;
            if (moshafType === 'versebyverse') {
              return {
                ...a,
                audio: `${base}${surahStr}${String(ayahNum).padStart(3, '0')}.mp3`,
              };
            }
            // Gapless: only the first ayah carries the full-surah URL so the
            // preview can still play something; others are left without audio.
            if (moshafType === 'gapless' && idx === 0) {
              return { ...a, audio: `${base}${surahStr}.mp3` };
            }
            return { ...a, audio: undefined };
          });
        }
      } catch (err) {
        // Non-fatal: preview simply falls back to the AlQuran audio URLs.
        console.error('[ayahs] QuranPedia audio override failed:', err);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch ayahs:', error);
    return NextResponse.json({ error: 'Failed to fetch ayahs' }, { status: 500 });
  }
}
