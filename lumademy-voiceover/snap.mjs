// Dev helper: screenshot a slide at given animation times.
//   node snap.mjs lessons/lesson-01-three-layers 4 1,3.5,7 /tmp/out   -> /tmp/out_1.jpg ...
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { useVendor } from './offline.mjs';
const [dir, sl, ts, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await useVendor(p);
await p.goto(pathToFileURL(path.resolve(dir, 'slides.html')).href);
await p.waitForFunction(() => window.gsap && typeof go === 'function');
await p.evaluate(() => document.fonts.ready);
await p.addStyleTag({ content: '*{transition:none!important}' });
await p.evaluate((i) => { gsap.globalTimeline.pause(); go(i); window.__b = gsap.globalTimeline.time(); }, +sl - 1);
for (const t of ts.split(',')) {
  await p.evaluate((t) => { gsap.globalTimeline.time(window.__b + t); }, +t);
  await p.screenshot({ path: `${out}_${t}.jpg`, type: 'jpeg', quality: 75 });
}
await b.close();
