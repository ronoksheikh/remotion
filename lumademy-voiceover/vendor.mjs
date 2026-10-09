// Downloads every external file the slideshows use (GSAP, Google Fonts + their font files) into vendor/,
// so rendering never depends on the network. Run once: node vendor.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const dir = 'vendor';
fs.mkdirSync(dir, { recursive: true });
const manPath = path.join(dir, 'manifest.json');
const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {};
const urls = new Set();
for (const l of fs.readdirSync('lessons')) {
  const f = path.join('lessons', l, 'slides.html');
  if (!fs.existsSync(f)) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:href|src)="(https:\/\/[^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'));
}
async function get(url) {
  if (man[url] && fs.existsSync(path.join(dir, man[url].file))) return;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const type = res.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  const file = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + (path.extname(new URL(url).pathname) || (type.includes('css') ? '.css' : ''));
  fs.writeFileSync(path.join(dir, file), buf);
  man[url] = { file, type };
  console.log('  saved', url.slice(0, 90));
  if (type.includes('css')) for (const m of buf.toString().matchAll(/url\((https:[^)]+)\)/g)) await get(m[1]);
}
for (const u of urls) await get(u);
fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
console.log(`vendor/: ${Object.keys(man).length} files`);
