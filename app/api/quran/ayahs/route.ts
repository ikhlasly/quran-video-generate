import { NextRequest, NextResponse } from 'next/server';
import { getAyahs } from '@/lib/quran-api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const surah = parseInt(searchParams.get('surah') || '1');
    const startAyah = parseInt(searchParams.get('startAyah') || '1');
    const endAyah = parseInt(searchParams.get('endAyah') || '7');
    const reciter = searchParams.get('reciter') || 'ar.alafasy';
    const translation = searchParams.get('translation') || 'en.sahih';

    const result = await getAyahs(surah, startAyah, endAyah, reciter, translation);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch ayahs:', error);
    return NextResponse.json({ error: 'Failed to fetch ayahs' }, { status: 500 });
  }
}
