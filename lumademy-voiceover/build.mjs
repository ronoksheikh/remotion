#!/usr/bin/env node
// Lumademy slideshow -> narrated MP4
//
//   node build.mjs lessons/lesson-05            full render
//   node build.mjs lessons/lesson-05 --plan     make the voice + print cue timings, no video
//   node build.mjs lessons/lesson-05 --preview  fast low-fps draft
//   node build.mjs lessons/lesson-05 --slides 3,4   only re-render these slides (1-based)
//
// Needs: Node 18+, ffmpeg + ffprobe on PATH, ELEVENLABS_API_KEY in env or .env

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- args / env ----------
const argv = process.argv.slice(2);
const lessonDir = path.resolve(argv.find((a) => !a.startsWith('--')) || '');
const flag = (n) => argv.includes('--' + n);
const opt = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
if (!argv.find((a) => !a.startsWith('--')) || !fs.existsSync(lessonDir)) {
  console.error('Usage: node build.mjs <lesson-folder> [--plan] [--preview] [--slides 1,2] [--workers N]');
  process.exit(1);
}

for (const f of [path.join(HERE, '.env'), path.join(lessonDir, '.env')]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const cfg = { ...JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8')) };
const narrPath = path.join(lessonDir, 'narration.json');
const narr = fs.existsSync(narrPath) ? JSON.parse(fs.readFileSync(narrPath, 'utf8')) : { slides: [] };
Object.assign(cfg, narr.config || {});
if (flag('preview')) cfg.fps = 12;
if (opt('fps')) cfg.fps = +opt('fps');
const name = path.basename(lessonDir);
const buildDir = path.join(HERE, 'build', name);
const outDir = path.join(HERE, 'output');
fs.mkdirSync(path.join(buildDir, 'audio'), { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) throw new Error(`${cmd} not found. Install it and make sure it is on PATH.`);
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${r.stderr.slice(-1500)}`);
  return r.stdout;
};
const duration = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- ElevenLabs ----------
async function tts(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY missing. Put it in .env (see .env.example).');
  const body = { text, model_id: cfg.model, voice_settings: cfg.voiceSettings };
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}/with-timestamps?output_format=mp3_44100_128`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return res.json();
    const msg = (await res.text()).slice(0, 400);
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(2000 * attempt); continue; }
    throw new Error(`ElevenLabs ${res.status}: ${msg}`);
  }
}

async function getVoice(i, text) {
  const hash = crypto.createHash('sha1').update(JSON.stringify([text, cfg.voiceId, cfg.model, cfg.voiceSettings, cfg.tempo])).digest('hex').slice(0, 10);
  const base = path.join(buildDir, 'audio', `slide-${String(i + 1).padStart(2, '0')}-${hash}`);
  if (!fs.existsSync(base + '.mp3') || !fs.existsSync(base + '.json')) {
    process.stdout.write(`  voice  slide ${i + 1}: generating (${text.length} chars)... `);
    const r = await tts(text);
    fs.writeFileSync(base + '.raw.mp3', Buffer.from(r.audio_base64, 'base64'));
    if (cfg.tempo && cfg.tempo !== 1) run('ffmpeg', ['-y', '-v', 'error', '-i', base + '.raw.mp3', '-filter:a', `atempo=${cfg.tempo}`, base + '.mp3']);
    else fs.copyFileSync(base + '.raw.mp3', base + '.mp3');
    fs.writeFileSync(base + '.json', JSON.stringify(r.alignment || null));
    console.log('done');
  } else console.log(`  voice  slide ${i + 1}: cached`);
  const al = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  return { file: base + '.mp3', align: al, dur: duration(base + '.mp3') };
}

// ---------- cue timing ----------
// Turns narration phrases into seconds on the slide clock (0 = slide start, voice starts at leadSeconds).
function makeLocator(text, voice) {
  const al = voice.align;
  const S = al ? al.characters.join('') : text;
  const tempo = cfg.tempo || 1;
  let from = 0;
  return (phrase, label) => {
    let idx = S.indexOf(phrase, from);
    if (idx < 0) idx = S.indexOf(phrase);
    if (idx < 0) { console.warn(`  ! phrase not found (${label}): "${phrase}"`); return null; }
    from = idx + 1;
    const sec = al ? al.character_start_times_seconds[idx] / tempo : (idx / S.length) * voice.dur;
    return +(cfg.leadSeconds + sec).toFixed(3);
  };
}

function planSlide(i, text, voice, slideCfg) {
  const loc = makeLocator(text, voice);
  const cues = [];
  for (const c of slideCfg.cues || []) {
    const t = loc(c.at, `slide ${i + 1} cue`);
    if (t == null) continue;
    cues.push({ ...c, sels: [].concat(c.sel), start: Math.max(0, +(t + (c.shift ?? -0.1)).toFixed(3)) });
  }
  cues.sort((a, b) => a.start - b.start);
  // timeline warp: pairs of [real slide seconds, animation-timeline seconds]
  const loc2 = makeLocator(text, voice);
  const pts = [[0, 0]];
  for (const s of slideCfg.sync || []) {
    const t = s.t != null ? s.t : loc2(s.at, `slide ${i + 1} sync`);
    if (t == null) continue;
    const last = pts[pts.length - 1];
    if (t > last[0] + 0.05 && s.tl > last[1] + 0.01) pts.push([t, s.tl]);
    else console.warn(`  ! sync point out of order, skipped: "${s.at}"`);
  }
  const total = +(cfg.leadSeconds + voice.dur + cfg.tailSeconds).toFixed(3);
  return { cues, pts, total };
}
const warp = (pts, t) => {
  for (let k = 1; k < pts.length; k++) {
    if (t <= pts[k][0]) { const [t0, l0] = pts[k - 1], [t1, l1] = pts[k]; return l0 + ((t - t0) / (t1 - t0)) * (l1 - l0); }
  }
  const [t0, l0] = pts[pts.length - 1];
  return l0 + (t - t0);
};

// ---------- render one slide ----------
async function renderSlide(page, i, plan, voice, segPath) {
  const n = Math.round(plan.total * cfg.fps);
  await page.evaluate(({ i }) => { window.__ov.clear(); go(i); window.__base = gsap.globalTimeline.time(); }, { i });
  const missing = await page.evaluate((c) => window.__ov.setCues(c), plan.cues);
  if (missing.length) console.warn(`  ! slide ${i + 1}: selector(s) not found: ${missing.join(', ')}`);

  const leadMs = Math.round(cfg.leadSeconds * 1000);
  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(cfg.fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', voice.file,
    '-filter_complex', `[1:a]adelay=${leadMs}|${leadMs},apad[a]`,
    '-map', '0:v', '-map', '[a]', '-t', String(plan.total),
    '-c:v', 'libx264', '-preset', flag('preview') ? 'ultrafast' : 'medium', '-crf', flag('preview') ? '28' : '17',
    '-pix_fmt', 'yuv420p', '-r', String(cfg.fps),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    segPath,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('close', (c) => (c ? rej(new Error('ffmpeg exited ' + c)) : res())); ff.on('error', rej); });
  ff.stdin.on('error', () => {});

  for (let f = 0; f < n; f++) {
    const t = f / cfg.fps;
    await page.evaluate(([tl, t]) => { gsap.globalTimeline.time(window.__base + tl, false); window.__ov.draw(t); }, [warp(plan.pts, t), t]);
    const buf = await page.screenshot({ type: 'jpeg', quality: flag('preview') ? 70 : 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 90 === 0) process.stdout.write(`  slide ${i + 1}: ${Math.round((f / n) * 100)}%\n`);
  }
  ff.stdin.end();
  await done;
  console.log(`  slide ${i + 1}: done (${plan.total.toFixed(1)}s)`);
}

// ---------- main ----------
async function main() {
  const slidesFile = path.join(lessonDir, 'slides.html');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--force-device-scale-factor=1'] });
  const mkPage = async () => {
    const p = await browser.newPage({ viewport: { width: cfg.width, height: cfg.height }, deviceScaleFactor: 1 });
    p.on('pageerror', (e) => console.warn('  page error:', e.message));
    await p.goto(pathToFileURL(slidesFile).href, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => window.gsap && typeof go === 'function');
    await p.addStyleTag({ content: '*{transition:none !important;animation:none !important}' });
    await p.addScriptTag({ path: path.join(HERE, 'overlay.js') });
    await p.evaluate(() => { gsap.ticker.lagSmoothing(0); gsap.globalTimeline.pause(); });
    return p;
  };

  const first = await mkPage();
  const says = await first.evaluate(() => L.scenes.map((s) => s.say));
  const N = says.length;
  console.log(`\n${name}: ${N} slides, model ${cfg.model}, voice ${cfg.voiceId}\n`);

  const wanted = opt('slides') ? opt('slides').split(',').map((x) => +x - 1) : [...Array(N).keys()];
  const plans = [], voices = [];
  for (let i = 0; i < N; i++) {
    const sc = narr.slides?.[i] || {};
    const text = (sc.text || says[i]).trim();
    voices[i] = await getVoice(i, text);
    plans[i] = planSlide(i, text, voices[i], sc);
    console.log(`  plan   slide ${i + 1}: ${plans[i].total.toFixed(1)}s, cues: ${plans[i].cues.map((c) => c.start.toFixed(1)).join(' ') || '-'}`);
  }
  const totalSec = plans.reduce((s, p) => s + p.total, 0);
  console.log(`\nTotal length: ${Math.floor(totalSec / 60)}m ${Math.round(totalSec % 60)}s\n`);

  if (flag('plan')) { await browser.close(); return; }

  const workers = Math.max(1, +(opt('workers') || Math.min(3, os.cpus().length)));
  const pages = [first];
  for (let k = 1; k < workers; k++) pages.push(await mkPage());
  const queue = [...wanted];
  await Promise.all(pages.map(async (page) => {
    while (queue.length) {
      const i = queue.shift();
      const seg = path.join(buildDir, `seg-${String(i + 1).padStart(2, '0')}.mp4`);
      await renderSlide(page, i, plans[i], voices[i], seg);
    }
  }));
  await browser.close();

  const segs = [...Array(N).keys()].map((i) => path.join(buildDir, `seg-${String(i + 1).padStart(2, '0')}.mp4`));
  if (!segs.every((s) => fs.existsSync(s))) { console.log('Some slides have not been rendered yet; skipping final join.'); return; }
  const list = path.join(buildDir, 'list.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  const out = path.join(outDir, `${name}${flag('preview') ? '-preview' : ''}.mp4`);
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
  console.log(`\nDone: ${out}`);
}

main().catch((e) => { console.error('\nError:', e.message); process.exit(1); });
