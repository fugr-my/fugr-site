// FUGR / scenes / chain-timeline.js
// "It's a chain, not a form." as a scroll scene. It opens on the microchip clip alone, in the middle of the
// screen and scrubbed frame by frame, with one line under it at a time ("It all starts with a microchip.",
// then, once the vet's hand is in, "Every step after it begins with a scan."). The clip then steps back and
// the example plan for Japan builds one step at a time: each numbered step arrives with its date, the line
// joining the steps fills as they do, and the long wait counts up to its 180 days. The closing note ends it.
// On wide screens the five steps stand in a row and stay; on tablets one step shows at a time, under a row
// of five numbered dots that fill as the plan goes on. That pinned scene now runs only when the page asks
// for it (data-options '{"pin":true}'). By default the section scrolls normally on every screen: the
// picture is scrubbed as it passes and a line draws along the steps (flow(), further down).
//
// Markup (index.html, #sequence): section.scene.tl > .scene-stage > .tl__wrap with
//   .tl__top (.tl__head, .tl__media > .tl__chip[data-count][data-scan][data-desktop][data-phone] > img + canvas,
//   .tl__say > p.tl__say1 + p.tl__say2), p.tl__example, ol.chain (the five steps), p.chain__close.
// Finished composition (reduced motion, no script): the scan still with both lines, all five steps, the note.
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

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
    // one frame only (the finished composition needs just the last one)
    const only = (i, isPhone) => { if (started) return; phone = !!isPhone; load(i); };
    return { n, start, only, show(i) { current = clamp(i, 0, n - 1); queue(); } };
  };

  Scenes['chain-timeline'] = (root, opts = {}) => {
    const q = (s) => [...root.querySelectorAll(s)];
    const wrap = root.querySelector('.tl__wrap');
    const chipBox = root.querySelector('.tl__chip');
    const chip = Frames(chipBox);
    const chain = root.querySelector('.chain');
    const steps = q('.chain > li');
    const close = root.querySelector('.chain__close');
    const num = root.querySelector('.tl__num');   // the long wait's counter
    const waitDays = num ? +num.textContent || 180 : 180;
    const say1 = root.querySelector('.tl__say1'), say2 = root.querySelector('.tl__say2');
    const scan = chipBox ? +chipBox.dataset.scan || 0 : 0;   // first frame with the vet's hand in it
    const isPhone = () => window.matchMedia('(max-width: 767px)').matches;
    const stacked = () => window.matchMedia('(max-width: 1120px)').matches;   // one step at a time

    // The dots that stand for the five steps when they show one at a time.
    let dots = root.querySelector('.chain__dots');
    if (!dots && chain) {
      dots = document.createElement('ol');
      dots.className = 'chain__dots';
      dots.setAttribute('aria-hidden', 'true');
      steps.forEach((_, i) => { const d = document.createElement('li'); d.textContent = String(i + 1); dots.appendChild(d); });
      chain.before(dots);
    }
    const dotEls = dots ? [...dots.children] : [];

    // Scroll plan, in screens of a 5 screen hold: 0.4 screens on the chip alone, 1.35 screens for the clip to
    // play, a quarter screen for it to step back while the heading and the example come in, then the five
    // steps in turn (the long wait gets a little longer, for its count), and the note to finish.
    const HOLD = 5, C0 = 0.4 / HOLD, C1 = 1.75 / HOLD, OUT = 2 / HOLD;
    const WIDTHS = [1, 1, 1, 1.4, 1];
    const S0 = OUT + 0.02, S1 = 0.88, total = WIDTHS.reduce((a, b) => a + b, 0);
    const starts = []; let acc = S0;
    WIDTHS.forEach((w) => { starts.push(acc); acc += (w / total) * (S1 - S0); });
    const CLOSE = S1 + 0.02;
    const frameAt = (p) => clamp((p - C0) / (C1 - C0 - 0.03), 0, 1) * ((chip ? chip.n : 1) - 1);
    let phoneNow = false;

    // Where the clip sits while it plays: the clip and the line under it, centred as one group (on phones,
    // in the part of the screen above the WhatsApp bar).
    const home = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight, g = parseFloat(getComputedStyle(wrap).paddingLeft) || 40;
      if (phoneNow) {
        const s = Math.min(W - 2 * g, H * 0.5), gap = 24, line = 64;
        return { x: (W - s) / 2, y: Math.max(16, (H - 80 - (s + gap + line)) / 2), s, gap };
      }
      const s = Math.min(H * 0.58, W * (W < 1000 ? 0.62 : 0.42)), gap = 32, line = W < 1000 ? 104 : 52;
      return { x: (W - s) / 2, y: Math.max(24, (H - (s + gap + line)) / 2), s, gap };
    };
    const placeChip = (p) => {
      if (!chip || !chipBox) return;
      const f = frameAt(p);
      chip.show(f);
      const h = home();
      root.style.setProperty('--say-top', (h.y + h.s + h.gap).toFixed(0) + 'px');
      if (say1) say1.classList.toggle('is-on', p >= 0.01 && p < C1 && Math.round(f) < scan);
      if (say2) say2.classList.toggle('is-on', p < C1 && Math.round(f) >= scan);
      // the clip steps back: a little smaller and fading, where it stands
      const k = ease(clamp((p - C1) / ((OUT - C1) * 0.55), 0, 1));   // gone before the steps come in
      const sc = 1 - 0.12 * k;
      chipBox.style.width = chipBox.style.height = h.s + 'px';
      chipBox.style.transform = `translate(${(h.x + (h.s * (1 - sc)) / 2).toFixed(1)}px, ${(h.y + (h.s * (1 - sc)) / 2).toFixed(1)}px) scale(${sc.toFixed(4)})`;
      chipBox.style.opacity = (1 - k).toFixed(3);
      chipBox.style.visibility = k >= 1 ? 'hidden' : '';
      root.classList.toggle('is-intro', p < C1 + (OUT - C1) * 0.6);
    };

    let lastActive = null;
    const render = (p) => {
      placeChip(p);
      let active = -1, fill = 0;
      starts.forEach((s, i) => { if (p >= s) active = i; });
      steps.forEach((li, i) => li.classList.toggle('is-on', i <= active));
      dotEls.forEach((d, i) => d.classList.toggle('is-on', i <= active));
      if (active >= 0) {
        const s = starts[active], e = active < starts.length - 1 ? starts[active + 1] : S1;
        fill = (active + clamp((p - s) / (e - s) / 0.6, 0, 1)) / (steps.length - 1);
      }
      if (chain) chain.style.setProperty('--fill', clamp(fill, 0, 1).toFixed(4));
      if (num) {
        const s = starts[3], e = starts[4];
        // counts in fives, so it never reads "1 days"
        num.textContent = String(Math.round(waitDays * ease(clamp((p - s) / ((e - s) * 0.75), 0, 1)) / 5) * 5);
      }
      if (close) close.classList.toggle('is-active', p >= CLOSE);
      if (active !== lastActive) {
        steps.forEach((li, i) => li.classList.toggle('is-active', i === active));
        root.dataset.cap = String(active);
        lastActive = active;
      }
      // in a row, the steps all stay and the note joins them; one at a time, the last step stays with the note
      // on phones, the note takes the last step's place, so the heading and the intro line stay above it
      if (p >= CLOSE && (!stacked() || phoneNow)) steps.forEach((li) => li.classList.remove('is-active'));
      else if (active >= 0) steps[active].classList.add('is-active');
      if (phoneNow && chain && close) {
        root.style.setProperty('--close-top', chain.offsetTop + 'px');
        root.style.setProperty('--close-left', chain.offsetLeft + 'px');
      }
    };

    const finished = () => {
      steps.forEach((li) => { li.classList.add('is-on'); li.classList.remove('is-active'); });
      dotEls.forEach((d) => d.classList.add('is-on'));
      if (chain) chain.style.removeProperty('--fill');
      if (num) num.textContent = String(waitDays);
      if (chipBox) { chipBox.removeAttribute('style'); root.classList.remove('is-intro'); root.style.removeProperty('--say-top'); }
      [say1, say2].forEach((el) => el && el.classList.remove('is-on'));
      if (close) close.classList.remove('is-active');
      if (chip) { chip.only(chip.n - 1, isPhone()); chip.show(chip.n - 1); }   // the scan still: one frame, not the clip
      root.style.removeProperty('--close-top'); root.style.removeProperty('--close-left');
      delete root.dataset.cap; lastActive = null;
    };

    // The clip's frames are fetched only when the scene is running and within two screens of the visitor,
    // and never before the page itself has loaded, so the first screen's picture is not kept waiting.
    const watch = () => {
      if (!chip || !('IntersectionObserver' in window)) { if (chip && root.classList.contains('is-live')) chip.start(isPhone()); return; }
      const io = new IntersectionObserver((e) => {
        if (!e[0].isIntersecting || !root.classList.contains('is-live')) return;
        chip.start(isPhone()); io.disconnect();
      }, { rootMargin: '200% 0px' });
      io.observe(root);
    };
    if (document.readyState === 'complete') watch(); else window.addEventListener('load', watch);

    // With motion allowed, the section scrolls like any other (on every screen size, unless the page asks for
    // the pinned scene with data-options '{"pin":true}', which then runs above 767px):
    //   - the picture alone is scrubbed by the scroll as it crosses the screen; none of the wording moves with it
    //   - a line draws along the steps as the page is scrolled (down their left side up to 1120px wide, across
    //     their top above that), and each step arrives when the line reaches its number, and leaves again on
    //     the way back up
    //   - the heading, the intro, the two lines under the picture, the example line and the closing note
    //     arrive the way the rest of the page does, each time they come on screen, from either direction
    // Everything is class-driven (.is-flow on the section), so leaving this mode leaves nothing behind.
    const flow = () => {
      if (!window.gsap || !window.ScrollTrigger || !chain || !steps.length) return;
      gsap.matchMedia().add((opts.pin ? '(max-width: 767px) and ' : '') + '(prefers-reduced-motion: no-preference)', () => {
        root.classList.add('is-flow');
        const watchers = [];

        // the picture
        if (chip && chipBox) {
          if ('IntersectionObserver' in window) {
            const near = new IntersectionObserver((e) => { if (e[0].isIntersecting) { chip.start(true); near.disconnect(); } }, { rootMargin: '200% 0px' });
            near.observe(root); watchers.push(near);
          } else chip.start(true);
          const clip = { p: 0 };
          chip.show(0);
          gsap.to(clip, { p: 1, ease: 'none', onUpdate: () => chip.show(clip.p * (chip.n - 1)),
            // it starts once the picture's top edge has reached the middle of the screen, so its first frames are seen
            scrollTrigger: { trigger: chipBox, start: 'top 50%', end: 'top 5%', scrub: 0.5 } });
        }

        // the line and the steps
        const C = 22;   // centre of a step's number, from the top of the step
        const down = () => window.matchMedia('(max-width: 1120px)').matches;   // the steps stand in a column
        const length = () => Math.max(1, steps[steps.length - 1].offsetTop - steps[0].offsetTop);
        const line = { p: 0 };
        const draw = () => {
          const on = line.p > 0.001;
          if (down()) {
            const len = length(), tip = line.p * len;
            chain.style.setProperty('--line-len', len + 'px');
            chain.style.setProperty('--flow', line.p.toFixed(4));
            chain.style.removeProperty('--fill');
            steps.forEach((li) => li.classList.toggle('is-on', on && tip >= li.offsetTop - steps[0].offsetTop - 1));
          } else {
            // in a row: the line runs from the first number to the last, so step i is reached at i / (n - 1)
            chain.style.setProperty('--fill', line.p.toFixed(4));
            steps.forEach((li, i) => li.classList.toggle('is-on', on && line.p >= i / (steps.length - 1) - 0.001));
          }
        };
        // in a column the tip of the line stays a little below the middle of the screen; in a row the line
        // fills while the row rises from the lower part of the screen to the upper
        gsap.to(line, { p: 1, ease: 'none', onUpdate: draw,
          scrollTrigger: { trigger: chain, start: () => (down() ? 'top+=' + C + ' 58%' : 'top 80%'), end: () => (down() ? 'top+=' + (C + length()) + ' 58%' : 'top 30%'),
            scrub: 0.4, invalidateOnRefresh: true, onRefresh: draw } });
        draw();

        // the wording arrives like the rest of the page
        const items = [root.querySelector('.tl__head h2'), root.querySelector('.tl__head .lead'), chipBox, say1, say2, root.querySelector('.tl__example'), close].filter(Boolean);
        items.forEach((el) => el.classList.add('flow'));
        if ('IntersectionObserver' in window) {
          const enter = new IntersectionObserver((entries) => {
            entries.filter((e) => e.isIntersecting && !e.target.classList.contains('is-in')).forEach((e, i) => {
              e.target.style.transitionDelay = (Math.min(i, 6) * 0.12) + 's';
              e.target.classList.add('is-in');
            });
          }, { rootMargin: '0px 0px -20% 0px' });
          const leave = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) return;
              e.target.style.transitionDelay = '0s';
              e.target.classList.remove('is-in');
              e.target.classList.toggle('is-above', e.boundingClientRect.top < 0);   // next time it comes down into place
            });
          });
          items.forEach((el) => { enter.observe(el); leave.observe(el); });
          watchers.push(enter, leave);
        } else items.forEach((el) => el.classList.add('is-in'));

        return () => {
          watchers.forEach((w) => w.disconnect());
          items.forEach((el) => { el.classList.remove('flow', 'is-in', 'is-above'); el.style.removeProperty('transition-delay'); });
          chain.style.removeProperty('--line-len'); chain.style.removeProperty('--flow'); chain.style.removeProperty('--fill');
          root.classList.remove('is-flow');
        };
      });
    };

    const scene = Stage.scene(root, {
      hold: opts.hold ?? HOLD,
      scrub: opts.scrub ?? 0.5,
      phone: 'rest',   // phones never run the pinned scene
      // the pinned scene runs only when the page asks for it; otherwise every screen gets flow() below
      build: opts.pin ? (tl, { phone }) => {
        phoneNow = phone;
        const s = { p: 0 };
        tl.to(s, { p: 1, duration: 1, ease: 'none', onUpdate: () => render(s.p) }, 0);
        render(0);
      } : null,
      rest: finished,
    }) || (finished(), null);
    flow();   // after the scene, so it starts from the finished composition
    return scene;
  };
})();
