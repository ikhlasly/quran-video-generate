import { NextResponse } from 'next/server';
import { getSurahs } from '@/lib/quran-api';

export async function GET() {
  try {
    const surahs = await getSurahs();
    return NextResponse.json({ surahs });
  } catch (error) {
    console.error('Failed to fetch surahs:', error);
    return NextResponse.json({ error: 'Failed to fetch surahs' }, { status: 500 });
  }
}
