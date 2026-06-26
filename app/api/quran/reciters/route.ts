import { NextRequest, NextResponse } from 'next/server';
import { getReciterService } from '@/lib/reciters';

/**
 * GET /api/quran/reciters
 * GET /api/quran/reciters?search=mishary
 * GET /api/quran/reciters?source=quranpedia
 *
 * Returns the merged, de-duplicated list of reciters from all registered
 * providers (AlQuran + QuranPedia). Results are cached server-side for 10 min.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = (searchParams.get('search') || '').trim();
    const source = searchParams.get('source'); // 'alquran' | 'quranpedia'

    const service = getReciterService();
    let reciters = search
      ? await service.searchReciters(search)
      : await service.listReciters();

    if (source === 'alquran' || source === 'quranpedia') {
      reciters = reciters.filter((r) => r.source === source);
    }

    return NextResponse.json({
      reciters,
      count: reciters.length,
      cached: true,
    });
  } catch (error) {
    console.error('Failed to fetch reciters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reciters', reciters: [], count: 0 },
      { status: 500 },
    );
  }
}
