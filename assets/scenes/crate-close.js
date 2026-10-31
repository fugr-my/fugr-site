// FUGR / scenes / crate-close.js
// "Your pet may fly as cargo. We never treat it like cargo." as a scroll scene. The crate clip plays frame
// by frame with the scroll: a hand sets a small teddy on the blanket and closes the door. One line under
// the crate at a time: the first while the crate is made ready, the second once the door is shut.
//
// Markup (index.html, #cargo): section.scene.crate > .scene-stage > .crate__wrap with
//   .crate__media[data-count][data-desktop][data-phone] > img (the closed crate) + canvas
//   .crate__say > p.crate__say1 + p.crate__say2
// Finished composition (reduced motion, no script): the closed crate with both lines under it.
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // The clip as frames. Each frame is decoded before it counts as arrived, so drawing it during a scroll
  // costs nothing; the canvas is sized only when the box changes size; drawing waits for the next
  // animation frame, once per screen refresh. Between two frames the next one is laid over the current one
  // in proportion to the scroll, so the motion reads as continuous rather than stepping. Every sixth frame
  // loads first so scrubbing works at once, then the rest, six at a time.
  const Frames = (box) => {
    const canvas = box && box.querySelector('canvas'), ctx = canvas && canvas.getContext('2d');
    const n = box ? +box.dataset.count || 0 : 0;
    if (!ctx || !n) return null;
    const imgs = new Array(n), ok = new Array(n).fill(false);
    let started = false, current = n - 1, phone = false, raf = 0, w = 0, h = 0;
    const src = (i) => (phone ? box.dataset.phone : box.dataset.desktop).replace('{n}', String(i).padStart(3, '0'));
    const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
    const load = (i) => new Promise((res) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { imgs[i] = im; ok[i] = true; queue(); res(); }); };
      im.onerror = res; im.src = src(i);
    });
    const start = (isPhone) => {
      if (started) return; started = true; phone = !!isPhone;
      const first = [], rest = [];
      for (let i = 0; i < n; i++) ((i % 6 === 0 || i === n - 1) ? first : rest).push(i);
      const worker = () => (rest.length ? load(rest.shift()).then(worker) : null);
      Promise.all(first.map(load)).then(() => { for (let k = 0; k < 6; k++) worker(); });
    };
    const nearest = (i) => { for (let d = 0; d < n; d++) { if (ok[i - d]) return i - d; if (ok[i + d]) return i + d; } return -1; };
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(box.clientWidth * dpr)); h = Math.max(1, Math.round(box.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      draw();
    };
    const draw = () => {
      if (!w) return;
      const a = Math.floor(current), t = current - a, ka = nearest(a);
      if (ka < 0) return;
      ctx.globalAlpha = 1;
      ctx.drawImage(imgs[ka], 0, 0, w, h);
      if (ka === a && t > 0.02 && a + 1 < n && ok[a + 1]) { ctx.globalAlpha = t; ctx.drawImage(imgs[a + 1], 0, 0, w, h); ctx.globalAlpha = 1; }
      box.classList.add('has-frame');
    };
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(box); else size();
    return { n, start, show(i) { current = clamp(i, 0, n - 1); queue(); } };
  };

  Scenes['crate-close'] = (root, opts = {}) => {
    const box = root.querySelector('.crate__media');
    const frames = Frames(box);
    const say1 = root.querySelector('.crate__say1'), say2 = root.querySelector('.crate__say2');
    const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

    // Scroll plan, as fractions of the hold: the clip plays over the first 85%; the door is shut about three
    // quarters of the way through the clip, and the second line takes over there; the last 15% holds still.
    const CLIP = 0.85, SAY2 = 0.65;
    const frameAt = (p) => clamp(p / CLIP, 0, 1) * ((frames ? frames.n : 1) - 1);

    const render = (p) => {
      if (frames) frames.show(frameAt(p));
      if (say1) say1.classList.toggle('is-on', p < SAY2);
      if (say2) say2.classList.toggle('is-on', p >= SAY2);
    };

    const finished = () => {
      if (frames) { frames.start(isPhone()); frames.show(frames.n - 1); }
      [say1, say2].forEach((el) => el && el.classList.add('is-on'));
    };

    // Start loading the frames a screen and a half before the scene arrives.
    if (frames && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { frames.start(isPhone()); io.disconnect(); } }, { rootMargin: '300% 0px' });
      io.observe(root);
    } else if (frames) frames.start(isPhone());
    // once the page itself has loaded, fetch the frames anyway, so they are in before the visitor gets here
    if (frames) window.addEventListener('load', () => setTimeout(() => frames.start(isPhone()), 1200));

    return Stage.scene(root, {
      hold: opts.hold ?? 3,
      scrub: opts.scrub ?? 0.5,
      phone: 'same',
      build(tl) {
        const s = { p: 0 };
        tl.to(s, { p: 1, duration: 1, ease: 'none', onUpdate: () => render(s.p) }, 0);
        render(0);
      },
      rest: finished,
    }) || (finished(), null);
  };
})();
