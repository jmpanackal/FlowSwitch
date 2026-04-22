(() => {
  const byId = (id) => document.getElementById(id);

  const releaseFileUrl = (data, fileName) => {
    const base = String(data.downloadBaseUrl || '').trim();
    if (base) {
      const root = base.endsWith('/') ? base : `${base}/`;
      try {
        const resolved = root.startsWith('http://') || root.startsWith('https://')
          ? new URL(fileName, root)
          : new URL(fileName, new URL(root, window.location.href));
        return resolved.href;
      } catch {
        return `${root}${fileName}`;
      }
    }
    const repo = String(data.githubRepository || '').replace(/^\/+|\/+$/g, '');
    const tag = encodeURIComponent(String(data.releaseTag || ''));
    const file = encodeURIComponent(String(fileName || ''));
    return `https://github.com/${repo}/releases/download/${tag}/${file}`;
  };

  const wireDownloadUi = (data) => {
    const inst = data?.files?.installer;
    const port = data?.files?.portable;

    const primary = byId('download-installer');
    const secondary = byId('download-portable');
    const splitMenu = byId('download-split-menu');
    const headerDl = byId('header-download');
    const meta = byId('download-version-meta');
    const ver = data?.version || '';
    if (meta) {
      meta.textContent = ver && data.releaseTag
        ? `${data.releaseTag} · Supports Windows 10+`
        : '';
    }

    if (primary && inst) {
      const url = releaseFileUrl(data, inst);
      primary.href = url;
      primary.removeAttribute('aria-disabled');
      if (headerDl) {
        headerDl.href = url;
        headerDl.removeAttribute('aria-disabled');
      }
    }

    if (secondary && port) {
      const portableUrl = releaseFileUrl(data, port);
      secondary.href = portableUrl;
      secondary.removeAttribute('aria-disabled');
      if (splitMenu && !splitMenu.dataset.portableWired) {
        splitMenu.dataset.portableWired = '1';
        splitMenu.addEventListener('click', () => {
          window.location.assign(portableUrl);
        });
        splitMenu.removeAttribute('aria-disabled');
      }
    }
  };

  const showDownloadError = () => {
    const err = byId('download-error');
    if (err) err.hidden = false;
  };

  if (byId('download-installer')) {
    fetch('./latest.json', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(wireDownloadUi)
      .catch(() => showDownloadError());
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isHome = document.body.classList.contains('page-home');
  const canDeferLenisRaf =
    isHome && typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  let lenis = null;
  if (!reduceMotion && typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({
      duration: 1.15,
      smoothWheel: true,
      touchMultiplier: 1.5,
    });
    if (!canDeferLenisRaf) {
      const raf = (time) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
  }

  window.__flowswitchLenis = lenis;

  const scrollOffset = () => Math.min(96, (document.querySelector('.site-header')?.offsetHeight || 72) + 8);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !lenis) return;
    const hash = a.getAttribute('href');
    if (!hash || hash === '#') return;
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    lenis.scrollTo(el, { offset: -scrollOffset(), duration: 1.2 });
  });

  if (document.startViewTransition) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || a.hasAttribute('download')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
      const raw = a.getAttribute('href');
      if (!raw || raw.startsWith('mailto:') || raw.startsWith('http://') || raw.startsWith('https://')) return;
      if (raw.startsWith('#')) return;
      let url;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const cur = new URL(window.location.href);
      if (url.pathname === cur.pathname && url.search === cur.search && url.hash === cur.hash) return;
      const norm = (p) => {
        const x = p.replace(/\\/g, '/');
        return x.replace(/\/index\.html$/i, '/').replace(/\/$/, '') || '/';
      };
      const samePath = norm(url.pathname) === norm(window.location.pathname);
      if (samePath && url.hash && url.hash.length > 1) {
        const target = document.getElementById(url.hash.slice(1));
        if (target) {
          e.preventDefault();
          if (lenis) lenis.scrollTo(target, { offset: -scrollOffset(), duration: 1.2 });
          else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      e.preventDefault();
      document.startViewTransition(() => {
        window.location.assign(a.href);
      });
    });
  }

  window.addEventListener('load', () => {
    const L = window.__flowswitchLenis;
    if (!L || !window.location.hash || window.location.hash.length < 2) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) L.scrollTo(el, { offset: -scrollOffset(), duration: 0.01 });
  });
})();
