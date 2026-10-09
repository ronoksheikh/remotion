// Dev helper: node inspect.mjs lessons/lesson-02 [slideNumber]
// Prints every visible element (selector hints) and the animation timeline of each slide, for writing narration.json cues/sync.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = path.resolve(process.argv[2]);
const only = process.argv[3] ? +process.argv[3] - 1 : null;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(path.join(dir, 'slides.html')).href);
await p.waitForFunction(() => window.gsap && typeof go === 'function');
const n = await p.evaluate(() => sc.length);
for (let i = 0; i < n; i++) {
  if (only !== null && i !== only) continue;
  const r = await p.evaluate((i) => {
    go(i);
    const scene = sc[i];
    const els = [...scene.querySelectorAll('*')].filter((e) => !['SVG', 'path', 'circle', 'rect', 'line', 'g', 'tspan'].includes(e.tagName) && e.getBoundingClientRect().width > 0 && !e.closest('svg') || e.tagName.toLowerCase() === 'svg').slice(0, 60).map((e) => {
      const q = e.getBoundingClientRect();
      const sel = e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
      return `${sel}  [${Math.round(q.x)},${Math.round(q.y)} ${Math.round(q.width)}x${Math.round(q.height)}] ${(e.children.length ? '' : e.textContent).trim().slice(0, 40)}`;
    });
    const tl = cur.getChildren(false).map((c) => `${c.startTime().toFixed(2)}+${c.duration() > 100 ? 'inf' : c.duration().toFixed(2)}`);
    return { els, tl };
  }, i);
  console.log(`\n=== slide ${i + 1}\nTIMELINE: ${r.tl.join('  ')}\n${r.els.join('\n')}`);
}
await b.close();
