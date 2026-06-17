import { NextResponse } from "next/server";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quran Video Generator — API Docs</title>
<style>
  :root {
    --bg: #fafafa; --fg: #1a1a2e; --muted: #6b7280; --border: #e5e7eb;
    --accent: #059669; --accent-light: #d1fae5; --code-bg: #f3f4f6;
    --get: #3b82f6; --get-bg: #eff6ff; --post: #059669; --post-bg: #ecfdf5;
    --delete: #ef4444; --delete-bg: #fef2f2; --surface: #fff; --shadow: 0 1px 3px rgba(0,0,0,.08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #09090b; --fg: #fafafa; --muted: #71717a; --border: #27272a;
      --accent-light: #064e3b; --code-bg: #18181b;
      --get-bg: #1e293b; --post-bg: #0f2b1d; --delete-bg: #2b1010;
      --surface: #121214; --shadow: 0 1px 3px rgba(0,0,0,.4);
    }
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); line-height:1.6; }
  .sidebar { position:fixed; top:0; left:0; width:260px; height:100vh; background:var(--surface); border-right:1px solid var(--border); overflow-y:auto; padding:1.5rem 0; z-index:10; }
  .sidebar-header { padding:0 1.25rem 1.25rem; border-bottom:1px solid var(--border); margin-bottom:1rem; }
  .sidebar-header h1 { font-size:1rem; font-weight:700; }
  .sidebar-header p { font-size:.75rem; color:var(--muted); margin-top:.25rem; }
  .sidebar-nav { list-style:none; }
  .sidebar-nav a { display:block; padding:.5rem 1.25rem; font-size:.8rem; color:var(--muted); text-decoration:none; transition:all .15s; border-left:2px solid transparent; }
  .sidebar-nav a:hover { color:var(--fg); background:var(--code-bg); border-left-color:var(--accent); }
  .sidebar-nav a.active { color:var(--accent); background:var(--accent-light); border-left-color:var(--accent); }
  .main { margin-left:260px; padding:2rem 2.5rem; max-width:900px; }
  .main h2 { font-size:1.5rem; margin:2.5rem 0 1.5rem; padding-bottom:.5rem; border-bottom:2px solid var(--accent); }
  .tag-group { display:flex; align-items:center; gap:.5rem; margin-bottom:1.5rem; }
  .tag { font-size:.7rem; padding:2px 8px; border-radius:3px; font-weight:600; text-transform:uppercase; }
  .tag.get { color:var(--get); background:var(--get-bg); }
  .tag.post { color:var(--post); background:var(--post-bg); }
  .tag.delete { color:var(--delete); background:var(--delete-bg); }
  .endpoint { background:var(--surface); border:1px solid var(--border); border-radius:10px; margin-bottom:1rem; overflow:hidden; box-shadow:var(--shadow); }
  .ep-header { display:flex; align-items:center; gap:.75rem; padding:.85rem 1rem; cursor:pointer; user-select:none; transition:background .15s; }
  .ep-header:hover { background:var(--code-bg); }
  .ep-header .method { font-size:.7rem; font-weight:700; min-width:48px; text-align:center; padding:3px 0; border-radius:4px; color:#fff; }
  .ep-header .method.get { background:var(--get); } .ep-header .method.post { background:var(--post); } .ep-header .method.delete { background:var(--delete); }
  .ep-header .path { font-family:'SF Mono','Fira Code',monospace; font-size:.85rem; font-weight:500; }
  .ep-header .summary { margin-left:auto; font-size:.8rem; color:var(--muted); white-space:nowrap; }
  .ep-header .arrow { font-size:.7rem; color:var(--muted); transition:transform .2s; }
  .ep-header.open .arrow { transform:rotate(90deg); }
  .ep-body { display:none; padding:0 1rem 1rem; border-top:1px solid var(--border); }
  .ep-body.open { display:block; }
  .ep-body p.desc { color:var(--muted); font-size:.85rem; margin:1rem 0; }
  table { width:100%; border-collapse:collapse; margin:.75rem 0 1rem; font-size:.8rem; }
  th, td { text-align:left; padding:.45rem .6rem; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:600; font-size:.7rem; text-transform:uppercase; background:var(--code-bg); }
  td code { background:var(--code-bg); padding:1px 5px; border-radius:3px; font-size:.78rem; }
  .type { color:var(--accent); font-family:monospace; font-size:.78rem; }
  .required { display:inline-block; font-size:.65rem; padding:1px 5px; border-radius:3px; color:var(--delete); background:var(--delete-bg); margin-left:.35rem; }
  pre { background:var(--code-bg); padding:.85rem 1rem; border-radius:6px; overflow-x:auto; margin:.5rem 0 1rem; font-size:.78rem; line-height:1.5; }
  .schema-section { margin-top:1rem; }
  .schema-section h4 { font-size:.85rem; margin:.75rem 0 .5rem; }
  footer { margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--border); color:var(--muted); font-size:.8rem; }
  @media (max-width:768px) { .sidebar { display:none; } .main { margin-left:0; padding:1rem; } }
</style>
</head>
<body>
<nav class="sidebar">
<div class="sidebar-header"><h1>Quran Video API</h1><p>v0.1.0</p></div>
<ul class="sidebar-nav">
<li><a href="#quran-data">Quran Data</a></li>
<li><a href="#video-generation">Video Generation</a></li>
<li><a href="#video-management">Video Management</a></li>
<li><a href="#ai-providers">AI Providers</a></li>
<li><a href="#video-sources">Video Sources</a></li>
<li><a href="#orientations">Orientations</a></li>
<li><a href="#subtitle-positions">Subtitle Positions</a></li>
<li><a href="#logo-positions">Logo Positions</a></li>
<li><a href="#errors">Errors</a></li>
</ul>
</nav>

<main class="main">

<h2 id="quran-data">Quran Data</h2>

<div class="endpoint">
<div class="ep-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
<span class="method get">GET</span><span class="path">/api/quran/surahs</span><span class="summary">List all surahs</span><span class="arrow">▶</span>
</div>
<div class="ep-body">
<p class="desc">Returns the complete list of all 114 surahs with names and metadata.</p>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>surahs</code></td><td class="type">Surah[]</td><td>Array of surah objects</td></tr></table>
<div class="schema-section"><h4>Surah</h4>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>number</code></td><td class="type">number</td><td>1–114</td></tr>
<tr><td><code>name</code></td><td class="type">string</td><td>Arabic name</td></tr>
<tr><td><code>englishName</code></td><td class="type">string</td><td>Transliteration</td></tr>
<tr><td><code>englishNameTranslation</code></td><td class="type">string</td><td>Translation of name</td></tr>
<tr><td><code>numberOfAyahs</code></td><td class="type">number</td><td>Total verses</td></tr>
<tr><td><code>revelationType</code></td><td class="type">string</td><td>"Meccan" | "Medinan"</td></tr></table>
</div>
</div>
</div>

<div class="endpoint">
<div class="ep-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
<span class="method get">GET</span><span class="path">/api/quran/ayahs</span><span class="summary">Get ayah data</span><span class="arrow">▶</span>
</div>
<div class="ep-body">
<p class="desc">Returns Arabic text with audio URLs and translation for a verse range.</p>
<h4>Query Parameters</h4>
<table><tr><th>Parameter</th><th>Type</th><th>Default</th></tr>
<tr><td><code>surah</code> <span class="required">REQUIRED</span></td><td class="type">number</td><td>1</td></tr>
<tr><td><code>startAyah</code></td><td class="type">number</td><td>1</td></tr>
<tr><td><code>endAyah</code></td><td class="type">number</td><td>7</td></tr>
<tr><td><code>reciter</code></td><td class="type">string</td><td>ar.alafasy</td></tr>
<tr><td><code>translation</code></td><td class="type">string</td><td>en.sahih</td></tr></table>
<h4>Response</h4>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>arabic</code></td><td class="type">AyahEdition</td><td>Arabic with audio URLs</td></tr>
<tr><td><code>translated</code></td><td class="type">AyahEdition</td><td>Translation text</td></tr></table>
<div class="schema-section"><h4>Ayah</h4>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>number</code></td><td class="type">number</td><td>Global ayah number</td></tr>
<tr><td><code>numberInSurah</code></td><td class="type">number</td><td>Position within surah</td></tr>
<tr><td><code>text</code></td><td class="type">string</td><td>Ayah text</td></tr>
<tr><td><code>audio</code></td><td class="type">string?</td><td>Audio URL</td></tr>
<tr><td><code>juz</code></td><td class="type">number</td><td>Juz' number</td></tr>
<tr><td><code>page</code></td><td class="type">number</td><td>Page number</td></tr></table>
</div>
</div>
</div>

<h2 id="video-generation">Video Generation</h2>

<div class="endpoint">
<div class="ep-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
<span class="method post">POST</span><span class="path">/api/generate</span><span class="summary">Start generation</span><span class="arrow">▶</span>
</div>
<div class="ep-body">
<p class="desc">Starts a video generation job. Returns a job ID — poll via GET.</p>
<h4>Request Body</h4>
<table><tr><th>Field</th><th>Type</th><th>Default</th><th>Description</th></tr>
<tr><td><code>surah</code> <span class="required">REQUIRED</span></td><td class="type">number</td><td>—</td><td>Surah number</td></tr>
<tr><td><code>startAyah</code> <span class="required">REQUIRED</span></td><td class="type">number</td><td>—</td><td>Start verse</td></tr>
<tr><td><code>endAyah</code> <span class="required">REQUIRED</span></td><td class="type">number</td><td>—</td><td>End verse</td></tr>
<tr><td><code>reciter</code> <span class="required">REQUIRED</span></td><td class="type">string</td><td>—</td><td>Reciter identifier</td></tr>
<tr><td><code>translation</code> <span class="required">REQUIRED</span></td><td class="type">string</td><td>—</td><td>Translation identifier</td></tr>
<tr><td><code>orientation</code></td><td class="type">string</td><td>landscape</td><td>landscape | portrait | square</td></tr>
<tr><td><code>showArabic</code></td><td class="type">boolean</td><td>true</td><td>Show Arabic subtitles</td></tr>
<tr><td><code>showTranslation</code></td><td class="type">boolean</td><td>true</td><td>Show translation</td></tr>
<tr><td><code>subtitlePosition</code></td><td class="type">string</td><td>bottom</td><td>bottom | center | top</td></tr>
<tr><td><code>aiProvider</code></td><td class="type">string</td><td>gemini</td><td>AI provider key</td></tr>
<tr><td><code>aiModel</code></td><td class="type">string</td><td>gemini-2.5-flash</td><td>Model ID</td></tr>
<tr><td><code>aiApiKey</code></td><td class="type">string</td><td>—</td><td>AI provider API key</td></tr>
<tr><td><code>videoSource</code></td><td class="type">string</td><td>pexels</td><td>pexels | pixabay</td></tr>
<tr><td><code>videoApiKey</code></td><td class="type">string</td><td>—</td><td>Video source API key</td></tr>
<tr><td><code>logoText</code></td><td class="type">string</td><td>—</td><td>Overlay text</td></tr>
<tr><td><code>logoPosition</code></td><td class="type">string</td><td>top-left</td><td>6 positions</td></tr></table>

<h4>Example</h4>
<pre>POST /api/generate
Content-Type: application/json

{
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

<h4>Response 200</h4>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>jobId</code></td><td class="type">string</td><td>UUID for polling</td></tr></table>
</div>
</div>

<div class="endpoint">
<div class="ep-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
<span class="method get">GET</span><span class="path">/api/generate?id={jobId}</span><span class="summary">Poll job</span><span class="arrow">▶</span>
</div>
<div class="ep-body">
<p class="desc">Polls the status of a generation job. Poll every 2 seconds until status is <code>completed</code> or <code>failed</code>.</p>
<h4>Job Status Schema</h4>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>id</code></td><td class="type">string</td><td>Job UUID</td></tr>
<tr><td><code>status</code></td><td class="type">string</td><td>pending → fetching_verses → extracting_concepts → searching_videos → downloading_clips → generating_subtitles → rendering_video → completed | failed</td></tr>
<tr><td><code>progress</code></td><td class="type">number</td><td>0–100</td></tr>
<tr><td><code>message</code></td><td class="type">string</td><td>Status message</td></tr>
<tr><td><code>error</code></td><td class="type">string?</td><td>Error if failed</td></tr>
<tr><td><code>result</code></td><td class="type">object?</td><td>GenerationResult when completed</td></tr></table>
<div class="schema-section"><h4>GenerationResult</h4>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>videoUrl</code></td><td class="type">string</td><td>Relative video URL</td></tr>
<tr><td><code>duration</code></td><td class="type">number</td><td>Seconds</td></tr>
<tr><td><code>fileSize</code></td><td class="type">number</td><td>Bytes</td></tr>
<tr><td><code>concepts</code></td><td class="type">string[]</td><td>Visual concepts used</td></tr>
<tr><td><code>clipCount</code></td><td class="type">number</td><td>Clips used</td></tr></table>
</div>
</div>
</div>

<h2 id="video-management">Video Management</h2>

<div class="endpoint">
<div class="ep-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
<span class="method get">GET</span><span class="path">/api/videos</span><span class="summary">List videos</span><span class="arrow">▶</span>
</div>
<div class="ep-body">
<p class="desc">Returns all generated videos with metadata.</p>
<div class="schema-section"><h4>VideoInfo</h4>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>id</code></td><td class="type">string</td><td>Video UUID</td></tr>
<tr><td><code>surah</code></td><td class="type">number</td><td>Surah number</td></tr>
<tr><td><code>surahName</code></td><td class="type">string</td><td>Display name</td></tr>
<tr><td><code>startAyah</code></td><td class="type">number</td><td>—</td></tr>
<tr><td><code>endAyah</code></td><td class="type">number</td><td>—</td></tr>
<tr><td><code>reciter</code></td><td class="type">string</td><td>Reciter ID</td></tr>
<tr><td><code>reciterName</code></td><td class="type">string?</td><td>—</td></tr>
<tr><td><code>translation</code></td><td class="type">string</td><td>Translation ID</td></tr>
<tr><td><code>translationName</code></td><td class="type">string?</td><td>—</td></tr>
<tr><td><code>videoUrl</code></td><td class="type">string</td><td>Relative file URL</td></tr>
<tr><td><code>duration</code></td><td class="type">number</td><td>Seconds</td></tr>
<tr><td><code>fileSize</code></td><td class="type">number</td><td>Bytes</td></tr>
<tr><td><code>orientation</code></td><td class="type">string?</td><td>—</td></tr>
<tr><td><code>createdAt</code></td><td class="type">string</td><td>ISO 8601</td></tr></table>
</div>
</div>
</div>

<div class="endpoint">
<div class="ep-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
<span class="method get">GET</span><span class="path">/api/videos/{id}</span><span class="summary">Stream video</span><span class="arrow">▶</span>
</div>
<div class="ep-body">
<p class="desc">Streams or downloads a video file. Supports <code>Range</code> header for seeking.</p>
<table><tr><th>Header</th><th>Description</th></tr>
<tr><td><code>Range</code></td><td>Byte range (optional) — <code>bytes=0-1048575</code></td></tr></table>
<p class="desc"><strong>Response:</strong> <code>video/mp4</code> — 206 (partial) or 200 (full)</p>
</div>
</div>

<div class="endpoint">
<div class="ep-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
<span class="method delete">DELETE</span><span class="path">/api/videos/{id}</span><span class="summary">Delete video</span><span class="arrow">▶</span>
</div>
<div class="ep-body">
<p class="desc">Deletes a video file and its metadata.</p>
<h4>Response 200</h4>
<pre>{"success": true}</pre>
</div>
</div>

<h2 id="ai-providers">AI Providers</h2>
<table><tr><th>Provider</th><th>Key</th><th>Models</th><th>Auth</th></tr>
<tr><td>Gemini</td><td><code>gemini</code></td><td>gemini-3.5-flash, gemini-3.1-flash-lite, gemini-2.5-flash, gemini-2.5-pro</td><td>API Key</td></tr>
<tr><td>Anthropic</td><td><code>anthropic</code></td><td>claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4-1</td><td>API Key</td></tr>
<tr><td>OpenAI</td><td><code>openai</code></td><td>gpt-4o, gpt-4o-mini, o3-mini, gpt-4.1-nano</td><td>API Key</td></tr>
<tr><td>DeepSeek</td><td><code>deepseek</code></td><td>deepseek-v4-flash, deepseek-v4-pro</td><td>API Key</td></tr>
<tr><td>GLM</td><td><code>glm</code></td><td>glm-4.7-flash, glm-5.2, glm-5.1, glm-5</td><td>API Key</td></tr>
<tr><td>OpenRouter</td><td><code>openrouter</code></td><td>Multiple free models</td><td>API Key</td></tr>
<tr><td>Ollama</td><td><code>ollama</code></td><td>llama3.2, mistral, qwen2.5, gemma2, phi4</td><td>None</td></tr></table>

<h2 id="video-sources">Video Sources</h2>
<table><tr><th>Source</th><th>Key</th><th>Auth</th></tr>
<tr><td>Pexels</td><td><code>pexels</code></td><td>API Key</td></tr>
<tr><td>Pixabay</td><td><code>pixabay</code></td><td>API Key</td></tr></table>

<h2 id="orientations">Video Orientations</h2>
<table><tr><th>Key</th><th>Resolution</th><th>Aspect</th></tr>
<tr><td><code>landscape</code></td><td>1920 × 1080</td><td>16:9</td></tr>
<tr><td><code>portrait</code></td><td>1080 × 1920</td><td>9:16</td></tr>
<tr><td><code>square</code></td><td>1080 × 1080</td><td>1:1</td></tr></table>

<h2 id="subtitle-positions">Subtitle Positions</h2>
<table><tr><th>Key</th><th>Description</th></tr>
<tr><td><code>bottom</code></td><td>Default</td></tr>
<tr><td><code>center</code></td><td>Vertically centered</td></tr>
<tr><td><code>top</code></td><td>—</td></tr></table>

<h2 id="logo-positions">Logo Positions</h2>
<table><tr><th>Key</th><th>Key</th><th>Key</th></tr>
<tr><td><code>top-left</code></td><td><code>top-center</code></td><td><code>top-right</code></td></tr>
<tr><td><code>bottom-left</code></td><td><code>bottom-center</code></td><td><code>bottom-right</code></td></tr></table>

<h2 id="errors">Error Handling</h2>
<p class="desc">All endpoints return errors in a consistent format:</p>
<pre>{"error": "Human-readable error message"}</pre>
<table><tr><th>Status</th><th>Meaning</th></tr>
<tr><td><code>400</code></td><td>Missing required parameter</td></tr>
<tr><td><code>404</code></td><td>Resource not found</td></tr>
<tr><td><code>500</code></td><td>Internal server error</td></tr></table>
<p class="desc">During generation, API failures are surfaced in the job <code>message</code> field. The pipeline continues with fallbacks (keyword-based concepts, gradient background video).</p>

<footer>Quran Video Generator — v0.1.0 &middot; <a href="/">Back to app</a></footer>
</main>

<script>
// Expand first endpoint in each section by default
document.querySelectorAll('.ep-header').forEach((h,i) => { if(i===0) { h.classList.add('open'); h.nextElementSibling.classList.add('open'); }});
// Highlight active sidebar link on scroll
const sections = document.querySelectorAll('h2[id]');
const links = document.querySelectorAll('.sidebar-nav a');
window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(s => { if(window.scrollY >= s.offsetTop-80) current = s.id; });
  links.forEach(l => { l.classList.toggle('active', l.getAttribute('href')==='#'+current); });
});
</script>
</body>
</html>`;

export async function GET() {
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
