// Dev helper: one screenshot per slide at time T -> <out>/<lesson>_NN.jpg
//   node sheet.mjs lessons/lesson-06-design-basics 4 /tmp/out
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { useVendor } from './offline.mjs';
const [dir, T, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await useVendor(p);
await p.goto(pathToFileURL(path.resolve(dir, 'slides.html')).href);
await p.waitForFunction(() => window.gsap && typeof go === 'function');
await p.evaluate(() => document.fonts.ready);
await p.addStyleTag({ content: '*{transition:none!important}' });
const n = await p.evaluate(() => document.querySelectorAll('.scene').length);
for (let i = 0; i < n; i++) {
  await p.evaluate((i) => { gsap.globalTimeline.pause(); go(i); window.__b = gsap.globalTimeline.time(); }, i);
  await p.evaluate((t) => { gsap.globalTimeline.time(window.__b + t); }, +T);
  await p.screenshot({ path: `${out}/${path.basename(dir)}_${String(i + 1).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70 });
}
await b.close();
