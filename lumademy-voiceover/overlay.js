// Injected into the slideshow page. Draws a spotlight ring + animated cursor + click ripple.
// Node calls __ov.setCues([...]) once per slide, then __ov.draw(t) for every frame.
(() => {
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;
  const TRAVEL = 0.5;

  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50;overflow:hidden';
  const spot = document.createElement('div');
  spot.style.cssText = 'position:absolute;box-sizing:border-box;border:6px solid #FFD84D;opacity:0';
  const ripple = document.createElement('div');
  ripple.style.cssText = 'position:absolute;width:80px;height:80px;margin:-40px 0 0 -40px;border-radius:50%;border:5px solid #fff;opacity:0';
  const cursor = document.createElement('div');
  cursor.style.cssText = 'position:absolute;left:0;top:0;width:52px;height:52px;opacity:0;filter:drop-shadow(0 6px 8px rgba(0,0,0,.35))';
  cursor.innerHTML = '<svg viewBox="0 0 40 40" width="52" height="52"><path d="M4 2 L4 31 L11.5 24 L16.5 36 L21.5 34 L16.5 22.5 L27 22.5 Z" fill="#fff" stroke="#0B1F4D" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  root.append(spot, ripple, cursor);
  document.body.append(root);

  let cues = [];

  function rectOf(c) {
    const q = c.sels.map((s) => '.scene.on ' + s).join(',');
    const els = [...document.querySelectorAll(q)];
    if (!els.length) return null;
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const e of els) {
      const r = e.getBoundingClientRect();
      x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
    }
    const br = parseFloat(getComputedStyle(els[0]).borderRadius) || 0;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, br };
  }
  const AN = { br: [0.86, 0.78], center: [0.5, 0.5], tl: [0.14, 0.25], tr: [0.86, 0.25], bl: [0.14, 0.78], bc: [0.5, 0.85], cl: [0.12, 0.5] };
  function tip(r, c) {
    const [fx, fy] = AN[c.anchor] || AN.br;
    return { x: r.x + r.w * fx, y: r.y + r.h * fy };
  }

  window.__ov = {
    setCues(list) {
      cues = list.map((c, i) => ({ ...c, pad: c.pad ?? 18, dur: c.dur ?? 3.5 }));
      cues.forEach((c, i) => {
        const nx = cues[i + 1];
        c.end = c.start + c.dur;
        c.contiguous = false;
        if (nx && nx.start - 0.4 <= c.end) { c.end = nx.start; c.contiguous = true; }
      });
      return cues.filter((c) => !rectOf(c)).map((c) => c.sels.join('|'));
    },
    hide() { spot.style.opacity = 0; cursor.style.opacity = 0; ripple.style.opacity = 0; },
    clear() { cues = []; this.hide(); },
    draw(t) {
      let a = -1;
      cues.forEach((c, i) => { if (t >= c.start - TRAVEL) a = i; });
      if (a < 0) { this.hide(); return; }
      const c = cues[a], prev = a > 0 ? cues[a - 1] : null;
      const rc = rectOf(c) || { x: 960, y: 540, w: 10, h: 10, br: 0 };
      const rp = prev ? rectOf(prev) || rc : null;
      const k = ease(clamp((t - (c.start - TRAVEL)) / TRAVEL));
      const to = tip(rc, c);
      const from = rp ? tip(rp, prev) : { x: 1780, y: 1020 };
      const sway = 4 * Math.sin(t * 3);
      const cx = lerp(from.x, to.x, k) + sway, cy = lerp(from.y, to.y, k) + sway * 0.6;
      cursor.style.transform = `translate(${cx - 4}px,${cy - 2}px)`;
      cursor.style.opacity = a === 0 ? clamp((t - (c.start - TRAVEL)) / 0.25) : 1;

      const linked = !!(prev && prev.contiguous);
      const r = linked && k < 1 ? { x: lerp(rp.x, rc.x, k), y: lerp(rp.y, rc.y, k), w: lerp(rp.w, rc.w, k), h: lerp(rp.h, rc.h, k), br: lerp(rp.br, rc.br, k) } : rc;
      const aIn = linked ? 1 : clamp((t - (c.start - 0.2)) / 0.3);
      const aOut = c.contiguous ? 1 : clamp((c.end - t) / 0.3);
      const al = c.nospot ? 0 : Math.min(aIn, aOut);
      const p = c.pad;
      spot.style.left = r.x - p + 'px'; spot.style.top = r.y - p + 'px';
      spot.style.width = r.w + 2 * p + 'px'; spot.style.height = r.h + 2 * p + 'px';
      spot.style.borderRadius = Math.max(22, r.br + p) + 'px';
      const glow = 28 + 10 * Math.sin(t * 5);
      spot.style.boxShadow = `0 0 0 4000px rgba(6,18,56,.5), 0 0 ${glow}px 8px rgba(255,216,77,.85), inset 0 0 22px rgba(255,216,77,.28)`;
      spot.style.opacity = al;

      const tt = t - c.start;
      if (tt >= 0 && tt < 0.6) {
        const q = tt / 0.6;
        ripple.style.left = to.x + 'px'; ripple.style.top = to.y + 'px';
        ripple.style.transform = `scale(${0.3 + 1.6 * q})`; ripple.style.opacity = 1 - q;
      } else ripple.style.opacity = 0;
    },
  };
})();
