import { NextResponse } from "next/server";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quran Video Generator — API Docs</title>
<style>
  :root {
    --bg: #ffffff;
    --fg: #0a0a0a;
    --muted: #6b7280;
    --border: #e5e7eb;
    --accent: #059669;
    --code-bg: #f3f4f6;
    --method-get: #3b82f6;
    --method-post: #059669;
    --method-delete: #ef4444;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0a;
      --fg: #fafafa;
      --muted: #9ca3af;
      --border: #27272a;
      --code-bg: #18181b;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }
  .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { font-size: 2rem; margin-bottom: 0.25rem; }
  .subtitle { color: var(--muted); margin-bottom: 2rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--accent); }
  h3 { font-size: 1rem; margin: 1.5rem 0 0.75rem; }
  .endpoint { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1.5rem; overflow: hidden; }
  .endpoint-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--code-bg); }
  .method { font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; color: #fff; text-transform: uppercase; }
  .method.get { background: var(--method-get); }
  .method.post { background: var(--method-post); }
  .method.delete { background: var(--method-delete); }
  .path { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.9rem; }
  .endpoint-body { padding: 1rem; }
  .endpoint-body p { margin-bottom: 0.5rem; color: var(--muted); font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0 1rem; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
  td code { background: var(--code-bg); padding: 1px 6px; border-radius: 3px; font-size: 0.8rem; }
  .type { color: var(--accent); font-family: monospace; font-size: 0.8rem; }
  pre { background: var(--code-bg); padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0 1rem; font-size: 0.8rem; line-height: 1.5; }
  .badge { display: inline-block; font-size: 0.7rem; padding: 1px 6px; border-radius: 3px; border: 1px solid var(--border); margin-left: 0.5rem; }
  .badge.required { border-color: var(--method-delete); color: var(--method-delete); }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; }
</style>
</head>
<body>
<div class="container">
<h1>Quran Video Generator</h1>
<p class="subtitle">API Reference — v0.1.0</p>

<h2>Quran Data</h2>

<div class="endpoint">
<div class="endpoint-header"><span class="method get">GET</span><span class="path">/api/quran/surahs</span></div>
<div class="endpoint-body">
<p>Returns the list of all 114 surahs.</p>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>surahs</code></td><td class="type">Surah[]</td><td>Array of surah objects</td></tr>
</table>
<h3>Surah Schema</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>number</code></td><td class="type">number</td><td>Surah number (1–114)</td></tr>
<tr><td><code>name</code></td><td class="type">string</td><td>Arabic name</td></tr>
<tr><td><code>englishName</code></td><td class="type">string</td><td>English transliteration</td></tr>
<tr><td><code>englishNameTranslation</code></td><td class="type">string</td><td>English translation of name</td></tr>
<tr><td><code>numberOfAyahs</code></td><td class="type">number</td><td>Total verses in the surah</td></tr>
<tr><td><code>revelationType</code></td><td class="type">string</td><td>"Meccan" or "Medinan"</td></tr>
</table>
</div>
</div>

<div class="endpoint">
<div class="endpoint-header"><span class="method get">GET</span><span class="path">/api/quran/ayahs</span></div>
<div class="endpoint-body">
<p>Returns ayah data with Arabic text, audio URLs, and translation for a specific verse range.</p>
<h3>Query Parameters</h3>
<table>
<tr><th>Parameter</th><th>Type</th><th>Default</th><th>Description</th></tr>
<tr><td><code>surah</code> <span class="badge required">required</span></td><td class="type">number</td><td>1</td><td>Surah number</td></tr>
<tr><td><code>startAyah</code></td><td class="type">number</td><td>1</td><td>Starting verse number</td></tr>
<tr><td><code>endAyah</code></td><td class="type">number</td><td>7</td><td>Ending verse number</td></tr>
<tr><td><code>reciter</code></td><td class="type">string</td><td>ar.alafasy</td><td>Reciter edition identifier</td></tr>
<tr><td><code>translation</code></td><td class="type">string</td><td>en.sahih</td><td>Translation edition identifier</td></tr>
</table>
<h3>Response</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>arabic</code></td><td class="type">AyahEdition</td><td>Arabic text with audio URLs</td></tr>
<tr><td><code>translated</code></td><td class="type">AyahEdition</td><td>Translation text</td></tr>
</table>
<h3>Ayah Schema</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>number</code></td><td class="type">number</td><td>Global ayah number</td></tr>
<tr><td><code>numberInSurah</code></td><td class="type">number</td><td>Ayah number within the surah</td></tr>
<tr><td><code>text</code></td><td class="type">string</td><td>Ayah text (Arabic or translation)</td></tr>
<tr><td><code>audio</code></td><td class="type">string?</td><td>Audio URL (Arabic editions only)</td></tr>
<tr><td><code>juz</code></td><td class="type">number</td><td>Juz' number</td></tr>
<tr><td><code>page</code></td><td class="type">number</td><td>Page number</td></tr>
</table>
</div>
</div>

<h2>Video Generation</h2>

<div class="endpoint">
<div class="endpoint-header"><span class="method post">POST</span><span class="path">/api/generate</span></div>
<div class="endpoint-body">
<p>Starts a video generation job. Returns immediately with a job ID — poll status via GET.</p>
<h3>Request Body</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr>
<tr><td><code>surah</code></td><td class="type">number</td><td>Yes</td><td>Surah number</td></tr>
<tr><td><code>startAyah</code></td><td class="type">number</td><td>Yes</td><td>Start verse</td></tr>
<tr><td><code>endAyah</code></td><td class="type">number</td><td>Yes</td><td>End verse</td></tr>
<tr><td><code>reciter</code></td><td class="type">string</td><td>Yes</td><td>Reciter identifier</td></tr>
<tr><td><code>translation</code></td><td class="type">string</td><td>Yes</td><td>Translation identifier</td></tr>
<tr><td><code>orientation</code></td><td class="type">string</td><td>No</td><td>"landscape" | "portrait" | "square" (default: landscape)</td></tr>
<tr><td><code>showArabic</code></td><td class="type">boolean</td><td>No</td><td>Show Arabic subtitles (default: true)</td></tr>
<tr><td><code>showTranslation</code></td><td class="type">boolean</td><td>No</td><td>Show translation subtitles (default: true)</td></tr>
<tr><td><code>subtitlePosition</code></td><td class="type">string</td><td>No</td><td>"bottom" | "center" | "top" (default: bottom)</td></tr>
<tr><td><code>aiProvider</code></td><td class="type">string</td><td>No</td><td>AI provider for concept extraction (default: gemini)</td></tr>
<tr><td><code>aiModel</code></td><td class="type">string</td><td>No</td><td>AI model ID (default: gemini-2.5-flash)</td></tr>
<tr><td><code>aiApiKey</code></td><td class="type">string</td><td>No</td><td>API key for AI provider</td></tr>
<tr><td><code>videoSource</code></td><td class="type">string</td><td>No</td><td>"pexels" | "pixabay" (default: pexels)</td></tr>
<tr><td><code>videoApiKey</code></td><td class="type">string</td><td>No</td><td>API key for video source</td></tr>
<tr><td><code>logoText</code></td><td class="type">string</td><td>No</td><td>Text logo overlay</td></tr>
<tr><td><code>logoPosition</code></td><td class="type">string</td><td>No</td><td>Logo position (6 options)</td></tr>
</table>

<h3>Example Request</h3>
<pre>{
  "surah": 1,
  "startAyah": 1,
  "endAyah": 7,
  "reciter": "ar.alafasy",
  "translation": "en.sahih",
  "orientation": "landscape",
  "aiProvider": "gemini",
  "aiModel": "gemini-2.5-flash",
  "aiApiKey": "sk-...",
  "videoSource": "pexels",
  "videoApiKey": "..."
}</pre>
<h3>Response</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>jobId</code></td><td class="type">string</td><td>UUID of the generation job</td></tr>
</table>
</div>
</div>

<div class="endpoint">
<div class="endpoint-header"><span class="method get">GET</span><span class="path">/api/generate?id={jobId}</span></div>
<div class="endpoint-body">
<p>Polls the status of a generation job.</p>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>id</code></td><td class="type">string</td><td>Job UUID</td></tr>
<tr><td><code>status</code></td><td class="type">string</td><td>pending | fetching_verses | extracting_concepts | searching_videos | downloading_clips | generating_subtitles | rendering_video | completed | failed</td></tr>
<tr><td><code>progress</code></td><td class="type">number</td><td>0–100 percentage</td></tr>
<tr><td><code>message</code></td><td class="type">string</td><td>Human-readable status message</td></tr>
<tr><td><code>error</code></td><td class="type">string?</td><td>Error message if status is failed</td></tr>
<tr><td><code>result</code></td><td class="type">object?</td><td>Generation result (duration, fileSize, concepts, clipCount) when completed</td></tr>
</table>
</div>
</div>

<h2>Video Management</h2>

<div class="endpoint">
<div class="endpoint-header"><span class="method get">GET</span><span class="path">/api/videos</span></div>
<div class="endpoint-body">
<p>Returns a list of all generated videos.</p>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>videos</code></td><td class="type">VideoInfo[]</td><td>Array of video metadata</td></tr>
</table>
<h3>VideoInfo Schema</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>id</code></td><td class="type">string</td><td>Video UUID</td></tr>
<tr><td><code>surah</code></td><td class="type">number</td><td>Surah number</td></tr>
<tr><td><code>surahName</code></td><td class="type">string</td><td>Display name</td></tr>
<tr><td><code>startAyah</code></td><td class="type">number</td><td>Start verse</td></tr>
<tr><td><code>endAyah</code></td><td class="type">number</td><td>End verse</td></tr>
<tr><td><code>reciter</code></td><td class="type">string</td><td>Reciter identifier</td></tr>
<tr><td><code>reciterName</code></td><td class="type">string?</td><td>Reciter display name</td></tr>
<tr><td><code>translation</code></td><td class="type">string</td><td>Translation identifier</td></tr>
<tr><td><code>translationName</code></td><td class="type">string?</td><td>Translation display name</td></tr>
<tr><td><code>videoUrl</code></td><td class="type">string</td><td>Relative URL to video file</td></tr>
<tr><td><code>duration</code></td><td class="type">number</td><td>Duration in seconds</td></tr>
<tr><td><code>fileSize</code></td><td class="type">number</td><td>File size in bytes</td></tr>
<tr><td><code>orientation</code></td><td class="type">string?</td><td>Video orientation</td></tr>
<tr><td><code>createdAt</code></td><td class="type">string</td><td>ISO 8601 timestamp</td></tr>
</table>
</div>
</div>

<div class="endpoint">
<div class="endpoint-header"><span class="method get">GET</span><span class="path">/api/videos/{id}</span></div>
<div class="endpoint-body">
<p>Streams or downloads a generated video file. Supports HTTP Range requests for seeking.</p>
<h3>Headers</h3>
<table>
<tr><th>Header</th><th>Description</th></tr>
<tr><td><code>Range</code></td><td>Optional byte range for partial content (e.g. <code>bytes=0-1048575</code>)</td></tr>
</table>
<h3>Response</h3>
<p>Returns <code>video/mp4</code> binary stream. Status 206 for range requests, 200 for full file.</p>
</div>
</div>

<div class="endpoint">
<div class="endpoint-header"><span class="method delete">DELETE</span><span class="path">/api/videos/{id}</span></div>
<div class="endpoint-body">
<p>Deletes a generated video and its metadata.</p>
<h3>Response</h3>
<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>success</code></td><td class="type">boolean</td><td>Always true on success</td></tr>
</table>
</div>
</div>

<h2>AI Providers</h2>

<table>
<tr><th>Provider</th><th>Type Key</th><th>Models</th><th>Requires Key</th></tr>
<tr><td>Gemini</td><td><code>gemini</code></td><td>gemini-3.5-flash, gemini-3.1-flash-lite, gemini-2.5-flash, gemini-2.5-pro</td><td>Yes</td></tr>
<tr><td>Anthropic</td><td><code>anthropic</code></td><td>claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4-1</td><td>Yes</td></tr>
<tr><td>OpenAI</td><td><code>openai</code></td><td>gpt-4o, gpt-4o-mini, o3-mini, gpt-4.1-nano</td><td>Yes</td></tr>
<tr><td>DeepSeek</td><td><code>deepseek</code></td><td>deepseek-v4-flash, deepseek-v4-pro</td><td>Yes</td></tr>
<tr><td>GLM</td><td><code>glm</code></td><td>glm-4.7-flash, glm-5.2, glm-5.1, glm-5</td><td>Yes</td></tr>
<tr><td>OpenRouter</td><td><code>openrouter</code></td><td>Multiple free models</td><td>Yes</td></tr>
<tr><td>Ollama</td><td><code>ollama</code></td><td>llama3.2, mistral, qwen2.5, gemma2, phi4</td><td>No</td></tr>
</table>

<h2>Video Sources</h2>

<table>
<tr><th>Source</th><th>Type Key</th><th>Requires Key</th></tr>
<tr><td>Pexels</td><td><code>pexels</code></td><td>Yes</td></tr>
<tr><td>Pixabay</td><td><code>pixabay</code></td><td>Yes</td></tr>
</table>

<h2>Video Orientations</h2>

<table>
<tr><th>Key</th><th>Resolution</th><th>Aspect Ratio</th></tr>
<tr><td><code>landscape</code></td><td>1920 × 1080</td><td>16:9</td></tr>
<tr><td><code>portrait</code></td><td>1080 × 1920</td><td>9:16</td></tr>
<tr><td><code>square</code></td><td>1080 × 1080</td><td>1:1</td></tr>
</table>

<h2>Subtitle Positions</h2>

<table>
<tr><th>Key</th><th>Description</th></tr>
<tr><td><code>bottom</code></td><td>Default — subtitles at the bottom of the video</td></tr>
<tr><td><code>center</code></td><td>Subtitles centered vertically</td></tr>
<tr><td><code>top</code></td><td>Subtitles at the top of the video</td></tr>
</table>

<h2>Logo Positions</h2>

<table>
<tr><th>Key</th><th>Description</th></tr>
<tr><td><code>top-left</code></td><td>Top left corner</td></tr>
<tr><td><code>top-center</code></td><td>Top center</td></tr>
<tr><td><code>top-right</code></td><td>Top right corner</td></tr>
<tr><td><code>bottom-left</code></td><td>Bottom left corner</td></tr>
<tr><td><code>bottom-center</code></td><td>Bottom center</td></tr>
<tr><td><code>bottom-right</code></td><td>Bottom right corner</td></tr>
</table>

<h2>Error Handling</h2>

<p>All endpoints return errors in this format:</p>
<pre>{
  "error": "Human-readable error message"
}</pre>
<table>
<tr><th>Status</th><th>Meaning</th></tr>
<tr><td><code>400</code></td><td>Missing required parameter (e.g. job ID)</td></tr>
<tr><td><code>404</code></td><td>Resource not found (job or video)</td></tr>
<tr><td><code>500</code></td><td>Internal server error</td></tr>
</table>

<p>During generation, if AI concept extraction or video search fails, the pipeline continues with fallbacks (keyword-based concepts, gradient background video). Error details are reported in the job status <code>message</code> field.</p>

<footer>Quran Video Generator — v0.1.0</footer>
</div>
</body>
</html>`;

export async function GET() {
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
