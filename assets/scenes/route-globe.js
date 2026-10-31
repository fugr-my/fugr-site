// FUGR / scenes / route-globe.js
// "Weeks, months, or not directly." as a scroll scene: a dotted globe turns from Malaysia while a route
// draws to each example destination, and that destination's explanation comes in beside it the moment
// the route arrives, one at a time. The United Kingdom, Singapore and Japan get an orange route; Australia's is dashed grey and
// broken, because there is no direct route from Malaysia.
//
// Markup (index.html, #timing): section.scene.globe > .scene-stage > .globe__wrap with .globe__head
//   (h2 + lead), figure.globe__fig > canvas.globe__canvas + .globe__labels > [data-place] labels, and
//   .ladder > .route x4 (United Kingdom, Singapore, Japan, Australia, in that order) + p.ladder__after.
// Land: window.FUGR_LAND (assets/scenes/land-dots.js), int16 pairs of lon and lat in tenths of a degree.
// Finished composition (reduced motion): the last view, every route drawn, every label shown, and the
// four explanations listed under the globe.
(() => {
  const RAD = Math.PI / 180;
  const ORIGIN = { lon: 101.7, lat: 3.1 };
  const PLACES = {
    uk: { lon: -0.13, lat: 51.5, lift: 0.16 },
    sg: { lon: 103.82, lat: 1.35, lift: 0.02 },
    jp: { lon: 139.7, lat: 35.7, lift: 0.10 },
    au: { lon: 151.2, lat: -33.9, lift: 0.12, broken: true },
  };

  const land = (() => {
    try {
      const bin = atob(window.FUGR_LAND || '');
      const n = bin.length >> 1, out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
        if (v > 32767) v -= 65536;
        out[i] = v / 10;
      }
      return out;
    } catch { return new Float32Array(0); }
  })();

  // A coarser grid for small globes (phones): every other row, and every other dot along each row, so the
  // dots keep the same open spacing as on the big globe instead of running together.
  const coarse = (() => {
    const rows = new Map();
    for (let i = 0; i < land.length; i += 2) {
      const r = Math.round((land[i + 1] + 90) / 1.5);
      if (r % 2) continue;
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push(land[i]);
    }
    const out = [];
    for (const [r, lons] of rows) { lons.sort((x, y) => x - y); lons.forEach((lon, k) => { if (k % 2 === 0) out.push(lon, r * 1.5 - 90); }); }
    return new Float32Array(out);
  })();

  const toVec = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  const toLL = (v) => ({ lon: Math.atan2(v[1], v[0]) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD });
  const slerp = (a, b, t) => {
    const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), w = Math.acos(d), s = Math.sin(w) || 1;
    const k0 = Math.sin((1 - t) * w) / s, k1 = Math.sin(t * w) / s;
    return [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1];
  };
  // Orthographic projection centred on (lon0, lat0); k lifts a point off the surface.
  const project = (lon, lat, v, k = 1) => {
    const l = (lon - v.lon0) * RAD, p = lat * RAD, p0 = v.lat0 * RAD;
    const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l);
    return {
      x: v.cx + k * v.r * cp * Math.sin(l),
      y: v.cy - k * v.r * (Math.cos(p0) * sp - Math.sin(p0) * cp * cl),
      z: Math.sin(p0) * sp + Math.cos(p0) * cp * cl,
    };
  };
  const lerpKeys = (p, keys) => {
    if (p <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [p1, v1] = keys[i], [p0, v0] = keys[i - 1];
      if (p <= p1) {
        const t = (p - p0) / ((p1 - p0) || 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        return Array.isArray(v0) ? v0.map((a, j) => a + (v1[j] - a) * e) : v0 + (v1 - v0) * e;
      }
    }
    return keys[keys.length - 1][1];
  };

  // Scroll plan: where the globe faces, how far each route has drawn, and which explanation shows
  // (from that point on, until the next one).
  const VIEW = [[0, [102, 12]], [0.06, [102, 12]], [0.18, [50, 30]], [0.30, [50, 30]], [0.38, [110, 10]],
    [0.50, [110, 10]], [0.58, [120, 22]], [0.70, [120, 22]], [0.78, [126, -8]], [0.90, [126, -8]], [1, [92, 14]]];
  const DRAW = { uk: [[0.08, 0], [0.20, 1]], sg: [[0.36, 0], [0.42, 1]], jp: [[0.56, 0], [0.66, 1]], au: [[0.75, 0], [0.83, 1]] };
  // each explanation comes in the moment its route reaches the place (the end of its DRAW), and stays
  // until the next route arrives
  const CARDS = [DRAW.uk[1][0], DRAW.sg[1][0], DRAW.jp[1][0], DRAW.au[1][0], 0.94];   // United Kingdom, Singapore, Japan, Australia, "Going somewhere else?"
  const END = { lon: 92, lat: 14 };

  Scenes['route-globe'] = (root, opts = {}) => {
    const canvas = root.querySelector('.globe__canvas');
    if (!canvas || !land.length) return null;
    const ctx = canvas.getContext('2d');
    const labels = Object.fromEntries([...root.querySelectorAll('[data-place]')].map((el) => [el.dataset.place, el]));
    const css = getComputedStyle(root);
    const C = {
      land: css.getPropertyValue('--globe-land').trim() || '#013A7C',
      disc: css.getPropertyValue('--globe-disc').trim() || '#FFFFFF',
      route: css.getPropertyValue('--globe-route').trim() || '#EB7001',
      broken: css.getPropertyValue('--globe-broken').trim() || '#6B7280',
      dot: css.getPropertyValue('--globe-dot').trim() || '#013A7C',
    };
    const cards = [...root.querySelectorAll('.ladder .route'), root.querySelector('.ladder__after')].filter(Boolean);
    const wrapEl = root.querySelector('.globe__wrap'), title = root.querySelector('.globe__head h2');
    let W = 0, H = 0, dpr = 1, live = false, phone = false, state = { lon0: END.lon, lat0: END.lat, d: { uk: 1, sg: 1, jp: 1, au: 1 } };
    let lastCard = null, cardTop = '';

    // Wide screens: the globe on the right, the words on the left. Narrow ones (phones, and tablets held
    // upright): the globe under the title, the words under the globe.
    const stacked = () => phone || W < 960;
    const layout = () => {
      if (live && !stacked()) {
        const r = Math.min(H * 0.40, W * 0.27);
        return { cx: W * 0.68, cy: H * 0.54, r };
      }
      if (live) {
        // on short phone screens the globe gives up room so the country card ends above the WhatsApp bar
        const r = Math.min(W * 0.36, H * (W < 600 ? (H < 620 ? 0.09 : H < 720 ? 0.115 : 0.15) : 0.2));
        return { cx: W / 2, cy: Math.max(r + 96, H * 0.29), r };
      }
      const r = Math.min(W, H) * 0.42;
      return { cx: W / 2, cy: H / 2, r };
    };

    // Where the explanations sit: under the title on wide screens (the lead's place), under the globe on
    // narrow ones.
    const placeCards = () => {
      const st = live && stacked();
      root.classList.toggle('is-stack', st);
      let y;
      if (st) { const L = layout(); y = L.cy + L.r + 24; }
      else y = title.getBoundingClientRect().bottom - wrapEl.getBoundingClientRect().top + 24;
      const v = Math.round(y) + 'px';
      if (v !== cardTop) { root.style.setProperty('--card-top', v); cardTop = v; }
    };
    const showCard = (p) => {
      let c = -1;
      CARDS.forEach((at, i) => { if (p >= at) c = i; });
      if (c === lastCard) return;
      cards.forEach((el, i) => el.classList.toggle('is-active', i === c));
      root.dataset.card = String(c);
      lastCard = c;
    };

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };

    const routePath = (from, to, v, t, lift) => {
      const a = toVec(from.lon, from.lat), b = toVec(to.lon, to.lat), pts = [];
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * t, ll = toLL(slerp(a, b, s)), k = 1 + lift * Math.sin(Math.PI * s);
        pts.push(project(ll.lon, ll.lat, v, k));
      }
      return pts;
    };

    const draw = () => {
      const L = layout(), v = { ...L, lon0: state.lon0, lat0: state.lat0 };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // the globe
      ctx.fillStyle = C.disc;
      ctx.beginPath(); ctx.arc(v.cx, v.cy, v.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.land;
      const small = v.r < 200, dots = small ? coarse : land;
      const base = small ? Math.max(1.1, v.r / 110) : Math.max(1, v.r / 230);
      for (let i = 0; i < dots.length; i += 2) {
        const q = project(dots[i], dots[i + 1], v);
        if (q.z <= 0.02) continue;
        const s = base * (0.9 + 0.8 * q.z);
        ctx.globalAlpha = 0.24 + 0.56 * q.z;
        ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      // routes
      for (const [key, P] of Object.entries(PLACES)) {
        const t = state.d[key];
        if (t <= 0) continue;
        const pts = routePath(ORIGIN, P, v, t, P.lift);
        ctx.lineWidth = Math.max(2, v.r / 150); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = P.broken ? C.broken : C.route;
        ctx.setLineDash(P.broken ? [v.r / 40, v.r / 36] : []);
        ctx.beginPath();
        let on = false;
        pts.forEach((q, i) => {
          const s = (i / (pts.length - 1)) * t;
          const gap = P.broken && s > 0.42 && s < 0.58;      // the break: no direct route
          if (q.z < -0.08 || gap) { on = false; return; }
          if (!on) { ctx.moveTo(q.x, q.y); on = true; } else ctx.lineTo(q.x, q.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        if (t >= 0.999) {
          const e = project(P.lon, P.lat, v);
          if (e.z > 0.02) { ctx.fillStyle = P.broken ? C.broken : C.route; ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(4, v.r / 70), 0, Math.PI * 2); ctx.fill(); }
        }
      }
      // origin
      const o = project(ORIGIN.lon, ORIGIN.lat, v);
      if (o.z > 0) {
        ctx.fillStyle = C.dot; ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(5, v.r / 55), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.disc; ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(2, v.r / 140), 0, Math.PI * 2); ctx.fill();
      }
      // labels follow their places; when two labels are on at once (the finished view, or a small globe)
      // a label that would land on one already placed tries its other sides, and keeps the side that is clear
      const placed = [];
      const place = (el, lon, lat, show) => {
        if (!el) return;
        const q = project(lon, lat, v);
        const ok = show && q.z > 0.12;
        el.classList.toggle('is-on', ok);
        if (!ok) return;
        const w = el.offsetWidth, h = el.offsetHeight, gapX = 14;
        let side = el.dataset.side || 'right';
        const fitsRight = q.x + gapX + w <= W - 8, fitsLeft = q.x - gapX - w >= 8;
        if (side === 'right' && !fitsRight && fitsLeft) side = 'left';
        else if (side === 'left' && !fitsLeft && fitsRight) side = 'right';
        const at = (sd) => {
          let x = sd === 'left' ? q.x - w - gapX : (sd === 'below' || sd === 'above') ? q.x - w / 2 : q.x + gapX;
          let y = sd === 'below' ? q.y + 14 : sd === 'above' ? q.y - h - 14 : q.y - h / 2;
          x = Math.max(8, Math.min(W - w - 8, x)); y = Math.max(8, Math.min(H - h - 8, y));
          return { x, y };
        };
        const hits = (r) => placed.some((o) => r.x < o.x + o.w + 6 && o.x < r.x + w + 6 && r.y < o.y + o.h + 4 && o.y < r.y + h + 4);
        let pos = at(side);
        if (hits(pos)) {
          for (const sd of ['right', 'below', 'left', 'above']) {
            if (sd === side) continue;
            const r = at(sd);
            if (!hits(r)) { pos = r; break; }
          }
        }
        placed.push({ x: pos.x, y: pos.y, w, h });
        el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
      };
      place(labels.my, ORIGIN.lon, ORIGIN.lat, true);
      for (const key of Object.keys(PLACES)) place(labels[key], PLACES[key].lon, PLACES[key].lat, state.d[key] >= 0.999);
    };

    const render = (p) => {
      const [lon0, lat0] = lerpKeys(p, VIEW);
      const d = {};
      for (const [k, keys] of Object.entries(DRAW)) {
        const [[a], [b]] = keys;
        d[k] = p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a);
      }
      state = { lon0, lat0, d };
      draw();
      placeCards();
      showCard(p);
    };
    const finished = () => {
      live = false; phone = false; state = { lon0: END.lon, lat0: END.lat, d: { uk: 1, sg: 1, jp: 1, au: 1 } };
      cards.forEach((el) => el.classList.remove('is-active'));
      delete root.dataset.card; root.style.removeProperty('--card-top'); root.classList.remove('is-stack'); lastCard = null; cardTop = '';
      size(); draw();
    };

    if ('ResizeObserver' in window) new ResizeObserver(() => { size(); draw(); }).observe(canvas);
    window.addEventListener('load', () => { size(); draw(); });
    root.classList.add('has-globe');

    return Stage.scene(root, {
      hold: opts.hold ?? 4,
      scrub: opts.scrub ?? 0.5,
      phone: 'same',
      build(tl, c) {
        live = true; phone = c.phone; size();
        const s = { p: 0 };
        tl.to(s, { p: 1, duration: 1, ease: 'none', onUpdate: () => render(s.p) }, 0);
        render(0);
      },
      rest: finished,
    }) || (finished(), null);
  };
})();
