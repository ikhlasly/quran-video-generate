# AGENTS.md

## Build Commands

- `bun dev` — Start development server
- `bun run build` — Production build
- `bun start` — Start production server
- `bun run lint` — Run ESLint
- `npx tsc --noEmit` — TypeScript type check

## Project Overview

AI-powered Quran video generator. Next.js 16 App Router, Tailwind CSS v4, custom lightweight UI components (no external UI library).

## Key Architecture

- `app/page.tsx` — Single-page app with verse selection, preview, generation
- `app/api/` — REST API routes for Quran data, video generation, streaming
- `lib/generation.ts` — Main video generation pipeline (concept extraction → footage → FFmpeg render)
- `lib/ffmpeg.ts` — All FFmpeg operations (audio/video processing, ASS subtitles)
- `lib/quran-api.ts` — alquran.cloud API client with caching
- `lib/i18n.ts` — 26-language translation map
- `components/ui/` — Self-contained UI primitives (button, dialog, select, tabs, etc.) — no external UI dependencies
- `types/quran.ts` — All TypeScript interfaces

## Conventions

- `@/*` path alias maps to project root
- Tailwind classes use shadcn CSS variable naming (`bg-background`, `text-foreground`, etc.)
- Client components use `"use client"` directive
- API routes use standard Next.js App Router conventions
