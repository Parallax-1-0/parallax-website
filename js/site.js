(() => {
  'use strict';

  // Address the contact form sends to. The form has no backend: submitting
  // opens the visitor's email app with the message pre-filled to this address.
  const CONTACT_EMAIL = 'anshul@parallaxfundai.com';

  /* ---- Header: fold the wordmark away once the page is scrolled ---- */
  const SCROLL_THRESHOLD = 48;
  const onScroll = () => {
    document.body.classList.toggle('is-scrolled', window.scrollY > SCROLL_THRESHOLD);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Rotating catchphrase ---- */
  const phrases = Array.from(document.querySelectorAll('.phrase'));
  const ticks = Array.from(document.querySelectorAll('.tick'));

  if (phrases.length > 1) {
    const HOLD_MS = 3800;   // how long a phrase stays up
    const SWAP_MS = 640;    // the old phrase is fully gone before the new one starts to rise
    const LEAVE_MS = 800;   // when the leaving phrase can be reset off-stage

    document.documentElement.style.setProperty('--hold', HOLD_MS + 'ms');

    // Split each line into words so they can rise in one after another.
    phrases.forEach((phrase) => {
      let i = 0;
      phrase.querySelectorAll('.phrase__line').forEach((line) => {
        const words = line.textContent.trim().split(/\s+/);
        line.textContent = '';
        words.forEach((text, k) => {
          const word = document.createElement('span');
          word.className = 'word';
          const inner = document.createElement('span');
          inner.className = 'word__inner';
          inner.textContent = text;
          inner.style.setProperty('--i', String(i++));
          word.appendChild(inner);
          line.appendChild(word);
          if (k < words.length - 1) line.appendChild(document.createTextNode(' '));
        });
      });
    });

    let index = 0;
    let seq = 0;
    let timer = 0;

    const setTick = (n) => {
      ticks.forEach((t, k) => {
        t.classList.toggle('is-current', k === n);
        t.setAttribute('aria-pressed', k === n ? 'true' : 'false');
      });
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => show((index + 1) % phrases.length), HOLD_MS);
    };

    const show = (n) => {
      if (n === index) { schedule(); return; }
      const token = ++seq;
      const leaving = phrases[index];
      const entering = phrases[n];
      index = n;

      leaving.classList.remove('is-active');
      leaving.classList.add('is-leaving');
      leaving.setAttribute('aria-hidden', 'true');
      setTimeout(() => { if (!leaving.classList.contains('is-active')) leaving.classList.remove('is-leaving'); }, LEAVE_MS);

      setTick(n);
      setTimeout(() => {
        if (token !== seq) return;
        entering.classList.remove('is-leaving');
        entering.classList.add('is-active');
        entering.removeAttribute('aria-hidden');
      }, SWAP_MS);

      schedule();
    };

    ticks.forEach((t, k) => t.addEventListener('click', () => show(k)));

    // Play the first phrase in rather than starting with it already on screen.
    phrases[0].classList.remove('is-active');
    setTick(-1);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      phrases[0].classList.add('is-active');
      setTick(0);
      schedule();
    }));
  }

  /* ---- Scroll zoom: each section flies past and the next expands from the centre ---- */
  const zoom = document.getElementById('zoom');
  const stage = zoom && zoom.querySelector('.zoom__stage');
  if (zoom && stage) {
    const root = document.documentElement;
    const backdrop = document.getElementById('bg');
    const panels = Array.from(stage.children).filter((el) => el.tagName === 'SECTION');
    const stillMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const MIN_HEIGHT = 520;   // shorter than this, the sections do not fit a pinned screen

    // Timeline, measured in viewport-heights of scrolling.
    const ENTER = 0.6;        // a section growing from the centre to full size
    const LEAVE = 0.8;        // a section flying past the viewer
    const ENTER_AFTER = 0.3;  // how far into a leave the next section starts to appear
    const HOLD = 0.4;         // a section resting at full size
    const TAIL = 0.3;         // the last section resting before the page moves on
    const LEAVE_SCALE = 2.6;  // extra scale a section gains as it leaves
    const ENTER_FROM = 0.4;   // scale a section starts from
    const ITEM_SPREAD = 56;   // px each list item travels outward from the centre
    const BACKDROP_PUSH = 0.06;

    const marks = [];
    let cursor = 0;
    panels.forEach((panel, i) => {
      const full = i === 0 ? 0 : cursor;
      const out = full + (i === 0 ? 0.05 : HOLD);
      marks.push({ in0: full - ENTER, in1: full, out0: out, out1: out + LEAVE });
      cursor = out + ENTER_AFTER + ENTER;
      panel._items = Array.from(panel.querySelectorAll('.statements__list li'));
    });
    const SPAN = marks[marks.length - 1].in1 + TAIL;

    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

    // The inline script in <head> may already have switched the layout on.
    let active = root.classList.contains('zoom-on');
    let queued = false;

    const travel = () => Math.max(1, zoom.offsetHeight - stage.offsetHeight);
    const progress = () => clamp01(-zoom.getBoundingClientRect().top / travel()) * SPAN;
    // Scroll position at which a section is resting at full size.
    const restingScroll = (i) => {
      const at = i === 0 ? 0 : marks[i].in1 + Math.min(HOLD, TAIL) / 2;
      return zoom.getBoundingClientRect().top + window.scrollY + travel() * (at / SPAN);
    };

    const render = () => {
      queued = false;
      if (!active) return;
      const p = progress();
      let push = 0;

      panels.forEach((panel, i) => {
        const m = marks[i];
        let scale = 1;
        let opacity = 1;
        let entered = 1;

        if (i > 0 && p < m.in1) {
          entered = clamp01((p - m.in0) / (m.in1 - m.in0));
          scale = ENTER_FROM + (1 - ENTER_FROM) * easeOut(entered);
          opacity = smooth(0, 0.6, entered);
        } else if (i < panels.length - 1 && p > m.out0) {
          const left = clamp01((p - m.out0) / (m.out1 - m.out0));
          scale = 1 + LEAVE_SCALE * left * left;
          opacity = 1 - smooth(0.05, 0.55, left);
          push = Math.max(push, Math.sin(Math.PI * left));
        }

        panel.style.transform = scale === 1 ? 'none' : 'scale(' + scale.toFixed(4) + ')';
        panel.style.opacity = opacity.toFixed(3);
        panel.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
        panel.style.pointerEvents = opacity > 0.6 ? 'auto' : 'none';

        // List items start gathered at the centre and spread out to their places.
        const mid = (panel._items.length - 1) / 2;
        panel._items.forEach((item, k) => {
          const e = easeOut(clamp01(entered * 1.5 - k * 0.18));
          item.style.transform = e === 1 ? 'none' : 'translateY(' + ((mid - k) * ITEM_SPREAD * (1 - e)).toFixed(1) + 'px)';
          item.style.opacity = e.toFixed(3);
        });
      });

      if (backdrop) backdrop.style.transform = push > 0.001 ? 'scale(' + (1 + BACKDROP_PUSH * push).toFixed(4) + ')' : 'none';
    };

    const requestRender = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(render);
    };

    const clearStyles = () => {
      panels.forEach((panel) => {
        ['transform', 'opacity', 'visibility', 'pointerEvents'].forEach((prop) => { panel.style[prop] = ''; });
        panel._items.forEach((item) => { item.style.transform = ''; item.style.opacity = ''; });
      });
      if (backdrop) backdrop.style.transform = '';
    };

    // A pinned section cannot scroll, so every section's content has to fit the screen.
    const allFit = () => {
      const css = getComputedStyle(root);
      const padding = (parseFloat(css.getPropertyValue('--stage-top')) || 96) +
                      (parseFloat(css.getPropertyValue('--stage-bottom')) || 72);
      return panels.every((panel) => {
        const content = panel.firstElementChild;
        return !content || content.offsetHeight <= window.innerHeight - padding;
      });
    };

    const sync = () => {
      const want = !stillMotion.matches && window.innerHeight >= MIN_HEIGHT && allFit();
      if (want !== active) {
        active = want;
        root.classList.toggle('zoom-on', want);
        if (!want) clearStyles();
      }
      if (active) render();
    };

    root.style.setProperty('--zoom-span', String(SPAN));
    window.__zoomReady = true;
    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', sync);
    // Web fonts change how tall the content is, so measure again once they are in.
    window.addEventListener('load', sync);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
    if (stillMotion.addEventListener) stillMotion.addEventListener('change', sync);
    sync();

    // The sections share one screen, so links and keyboard focus have to
    // scroll to the point on the track where their section is showing.
    const cue = document.querySelector('.scroll-cue');
    if (cue) {
      cue.addEventListener('click', (event) => {
        if (!active) return;
        event.preventDefault();
        window.scrollTo({ top: restingScroll(1), behavior: 'smooth' });
      });
    }
    stage.addEventListener('focusin', (event) => {
      if (!active) return;
      const i = panels.findIndex((panel) => panel.contains(event.target));
      if (i < 0 || parseFloat(panels[i].style.opacity || '1') > 0.6) return;
      window.scrollTo({ top: restingScroll(i), behavior: 'auto' });
    });
  }

  /* ---- Reveal blocks as they scroll into view ---- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add('is-visible'));
    }
  }

  /* ---- Contact form ---- */
  const form = document.getElementById('contact-form');
  if (form) {
    const status = document.getElementById('form-status');
    const direct = document.getElementById('contact-direct');
    const directLink = document.getElementById('contact-direct-link');

    if (CONTACT_EMAIL && direct && directLink) {
      directLink.textContent = CONTACT_EMAIL;
      directLink.href = 'mailto:' + CONTACT_EMAIL;
      direct.hidden = false;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const org = String(data.get('organization') || '').trim();
      const message = String(data.get('message') || '').trim();

      const subject = 'Parallax Fund inquiry — ' + name + (org ? ' (' + org + ')' : '');
      const body = message + '\n\n' + name + (org ? '\n' + org : '') + '\n' + email;

      window.location.href = 'mailto:' + CONTACT_EMAIL +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);

      if (status) status.textContent = 'Opening your email app to send this message…';
    });
  }
})();
