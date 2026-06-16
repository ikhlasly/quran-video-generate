import { NextRequest, NextResponse } from 'next/server';
import { startGeneration, getJobStatus } from '@/lib/generation';
import type { GenerationConfig } from '@/types/quran';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as GenerationConfig;
    const jobId = await startGeneration(body);
    return NextResponse.json({ jobId });
  } catch (error) {
    console.error('Failed to start generation:', error);
    return NextResponse.json({ error: 'Failed to start generation' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const jobId = searchParams.get('id');
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }
    const job = getJobStatus(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (error) {
    console.error('Failed to get job status:', error);
    return NextResponse.json({ error: 'Failed to get job status' }, { status: 500 });
  }
}
