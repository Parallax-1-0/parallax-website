(() => {
  'use strict';

  // Address the contact form sends to. The form has no backend: submitting
  // opens the visitor's email app with the message pre-filled to this address.
  const CONTACT_EMAIL = 'anshularavind@gmail.com';

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
