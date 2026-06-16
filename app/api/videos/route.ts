import { NextResponse } from 'next/server';
import { getVideoMetadata } from '@/lib/generation';

export async function GET() {
  try {
    const videos = getVideoMetadata();
    return NextResponse.json({ videos });
  } catch (error) {
    console.error('Failed to fetch videos:', error);
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}
