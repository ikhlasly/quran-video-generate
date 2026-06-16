import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { deleteVideoMetadata } from '@/lib/generation';
import { STORAGE_PATHS } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const videoPath = path.join(STORAGE_PATHS.renders, `${id}.mp4`);

    if (!fs.existsSync(videoPath)) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const stat = fs.statSync(videoPath);
    const range = request.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(videoPath, { start, end });

      // Convert readable stream to Response
      const readableStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => {
            controller.enqueue(chunk);
          });
          fileStream.on('end', () => {
            controller.close();
          });
          fileStream.on('error', (err) => {
            controller.error(err);
          });
        },
      });

      return new Response(readableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': 'video/mp4',
        },
      });
    }

    // No range - stream full file
    const fileStream = fs.createReadStream(videoPath);
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        fileStream.on('end', () => {
          controller.close();
        });
        fileStream.on('error', (err) => {
          controller.error(err);
        });
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Length': String(stat.size),
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('Failed to stream video:', error);
    return NextResponse.json({ error: 'Failed to stream video' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    deleteVideoMetadata(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete video:', error);
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 });
  }
}
