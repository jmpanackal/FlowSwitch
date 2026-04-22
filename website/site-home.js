(() => {
  if (!document.body.classList.contains('page-home')) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lenis = window.__flowswitchLenis;

  if (reduceMotion || typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') {
    document.querySelectorAll('.section-reveal').forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const gsap = window.gsap;
  const { ScrollTrigger } = window;

  gsap.registerPlugin(ScrollTrigger);

  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  const heroBadge = document.querySelector('.hero-badge');
  const heroTitle = document.querySelector('.hero-title');
  const heroLead = document.querySelector('.hero-lead');
  const heroDl = document.querySelector('.hero-download');
  const showcaseWrap = document.querySelector('.showcase-3d-wrap');
  const showcase3d = document.querySelector('.showcase-3d');

  const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  if (heroBadge) heroTl.fromTo(heroBadge, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.55 }, 0);
  if (heroTitle) {
    heroTl.fromTo(
      heroTitle,
      { autoAlpha: 0, y: 40, rotateX: -14 },
      { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.85 },
      0.06,
    );
  }
  if (heroLead) heroTl.fromTo(heroLead, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.65 }, 0.18);
  if (heroDl) heroTl.fromTo(heroDl, { autoAlpha: 0, y: 28, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, 0.26);

  gsap.set('.section-reveal', { autoAlpha: 0, y: 36 });
  document.querySelectorAll('.section-reveal').forEach((el) => {
    gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 90%',
        toggleActions: 'play none none none',
      },
    });
  });

  if (showcase3d && showcaseWrap) {
    gsap.set(showcaseWrap, { autoAlpha: 0, y: 56, rotateX: 10 });
    gsap.to(showcaseWrap, {
      autoAlpha: 1,
      y: 0,
      rotateX: 0,
      duration: 1.15,
      ease: 'power3.out',
      delay: 0.35,
      scrollTrigger: {
        trigger: showcaseWrap,
        start: 'top 92%',
        toggleActions: 'play none none none',
      },
    });

    gsap.to(showcase3d, {
      y: -40,
      rotateX: 3,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1.05,
      },
    });

    gsap.set(showcase3d, { transformOrigin: '50% 50%', transformPerspective: 1200 });
    const tiltX = gsap.quickTo(showcase3d, 'rotationX', { duration: 0.55, ease: 'power3.out' });
    const tiltY = gsap.quickTo(showcase3d, 'rotationY', { duration: 0.55, ease: 'power3.out' });
    showcaseWrap.addEventListener('pointermove', (e) => {
      const r = showcaseWrap.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tiltY(px * 10);
      tiltX(-py * 7);
    });
    showcaseWrap.addEventListener('pointerleave', () => {
      tiltY(0);
      tiltX(0);
    });
  }

  document.querySelectorAll('.bento-card').forEach((card) => {
    gsap.fromTo(
      card,
      { rotateX: 5, y: 36, autoAlpha: 0 },
      {
        rotateX: 0,
        y: 0,
        autoAlpha: 1,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 92%',
          toggleActions: 'play none none none',
        },
      },
    );
  });

  document.querySelectorAll('.story-step').forEach((step, i) => {
    gsap.fromTo(
      step,
      { autoAlpha: 0, y: 36 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.75,
        delay: i * 0.06,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: step,
          start: 'top 92%',
          toggleActions: 'play none none none',
        },
      },
    );
  });

  document.querySelectorAll('.stat-pill').forEach((pill, i) => {
    gsap.fromTo(
      pill,
      { autoAlpha: 0, y: 28, scale: 0.94 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.65,
        delay: i * 0.07,
        ease: 'back.out(1.2)',
        scrollTrigger: {
          trigger: '.stats-strip',
          start: 'top 88%',
          toggleActions: 'play none none none',
        },
      },
    );
  });

  document.querySelectorAll('.faq-item').forEach((item) => {
    const trigger = item.querySelector('.faq-trigger');
    const panel = item.querySelector('.faq-panel');
    if (!trigger || !panel) return;
    trigger.addEventListener('click', () => {
      const opening = !item.classList.contains('is-open');
      if (opening) {
        document.querySelectorAll('.faq-item').forEach((other) => {
          other.classList.remove('is-open');
          const ot = other.querySelector('.faq-trigger');
          const op = other.querySelector('.faq-panel');
          if (ot) ot.setAttribute('aria-expanded', 'false');
          if (op) op.setAttribute('aria-hidden', 'true');
        });
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        panel.setAttribute('aria-hidden', 'false');
      } else {
        item.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        panel.setAttribute('aria-hidden', 'true');
      }
    });
  });

  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
  });
})();
