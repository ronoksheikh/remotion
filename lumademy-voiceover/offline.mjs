// Serves the slideshow's external files (fonts, GSAP) from vendor/ so rendering works offline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor');
const manPath = path.join(dir, 'manifest.json');
const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {};
export async function useVendor(page) {
  await page.route(/^https?:\/\//, (route) => {
    const hit = man[route.request().url()];
    if (hit) return route.fulfill({ path: path.join(dir, hit.file), contentType: hit.type, headers: { 'access-control-allow-origin': '*' } });
    return route.continue();
  });
}
