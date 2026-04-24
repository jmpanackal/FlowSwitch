(() => {
  if (!document.body.classList.contains("page-home")) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
  const isTablet = () => window.matchMedia("(min-width: 768px) and (max-width: 1024px)").matches;

  const stepButtons = [...document.querySelectorAll("[data-step-target]")];
  const stepPanels = [...document.querySelectorAll("[data-step-panel]")];
  const stepTabButtons = [...document.querySelectorAll(".demo-tab")];
  const demoScrollShell = document.querySelector(".demo__scroll-shell");
  const watchTargets = [...document.querySelectorAll("[data-scroll-watch]")];

  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const mobileMenuSheet = mobileMenu?.querySelector(".mobile-menu__sheet");
  const mobileMenuNav = mobileMenu?.querySelector(".mobile-menu__nav");
  const mobileLinks = mobileMenuNav ? [...mobileMenuNav.querySelectorAll("a[href]")] : [];
  const mobileMenuDismiss = mobileMenu ? [...mobileMenu.querySelectorAll("[data-mobile-menu-dismiss]")] : [];

  const waitlistForm = document.querySelector("[data-waitlist-form]");
  const waitlistState = document.querySelector("[data-waitlist-state]");
  const waitlistButton = waitlistForm?.querySelector("button[type='submit']");
  const flowCanvas = document.querySelector("[data-flow-canvas]");
  const flowBackground = document.querySelector("[data-flow-background]");

  let activeStep = 0;
  let hasUserInteracted = false;
  let autoAdvanceTimer = null;
  let autoAdvanceKickoff = null;

  const initFlowBackground = () => {
    if (!(flowCanvas instanceof HTMLCanvasElement) || !flowBackground) return;

    const context = flowCanvas.getContext("2d", { alpha: true });
    if (!context) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0.5, y: 0.35, targetX: 0.5, targetY: 0.35 };
    const streamCount = 11;
    const pulseCount = 24;
    let width = 0;
    let height = 0;
    let rafId = 0;
    let resizeObserver = null;
    let streams = [];
    let pulses = [];
    let startTime = performance.now();

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const createStreams = () =>
      Array.from({ length: streamCount }, (_, index) => {
        const ratio = index / (streamCount - 1);
        const thickness = 1.2 + ratio * 2.6;
        const hue = 194 + index * 5;

        return {
          ratio,
          depth: 0.2 + ratio * 0.7,
          amplitude: 34 + ratio * 42,
          speed: 0.00008 + ratio * 0.00009,
          thickness,
          alpha: 0.08 + (1 - ratio) * 0.12,
          hue,
          drift: 120 + ratio * 160,
          offset: Math.random() * Math.PI * 2,
        };
      });

    const createPulses = () =>
      Array.from({ length: pulseCount }, (_, index) => ({
        lane: index % streamCount,
        progress: Math.random(),
        speed: 0.000035 + Math.random() * 0.00008,
        radius: 1.2 + Math.random() * 2.8,
        alpha: 0.16 + Math.random() * 0.25,
      }));

    const resize = () => {
      const bounds = flowBackground.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      flowCanvas.width = Math.floor(width * dpr);
      flowCanvas.height = Math.floor(height * dpr);
      flowCanvas.style.width = `${width}px`;
      flowCanvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      streams = createStreams();
      pulses = createPulses();
    };

    const pointFor = (stream, t, time) => {
      const travel = width * 1.14;
      const baseX = -width * 0.08 + travel * t;
      const lane = height * (0.18 + stream.ratio * 0.66);
      const waveA = Math.sin(time * stream.speed * 0.9 + t * 4.8 + stream.offset);
      const waveB = Math.cos(time * stream.speed * 1.6 + t * 9.4 - stream.offset * 0.6);
      const pointerTiltX = (pointer.x - 0.5) * stream.drift * stream.depth;
      const pointerTiltY = (pointer.y - 0.45) * 56 * (0.35 + stream.depth);

      return {
        x: baseX + pointerTiltX * (t - 0.5),
        y: lane + waveA * stream.amplitude + waveB * stream.amplitude * 0.34 + pointerTiltY * Math.sin(t * Math.PI),
      };
    };

    const drawStreams = (time) => {
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "screen";

      streams.forEach((stream) => {
        const gradient = context.createLinearGradient(0, height * stream.ratio, width, height * (1 - stream.ratio * 0.18));
        gradient.addColorStop(0, `hsla(${stream.hue}, 92%, 67%, 0)`);
        gradient.addColorStop(0.2, `hsla(${stream.hue}, 92%, 67%, ${stream.alpha * 0.82})`);
        gradient.addColorStop(0.52, `hsla(${stream.hue + 8}, 98%, 74%, ${stream.alpha})`);
        gradient.addColorStop(0.82, `hsla(${stream.hue + 14}, 94%, 70%, ${stream.alpha * 0.65})`);
        gradient.addColorStop(1, `hsla(${stream.hue + 18}, 94%, 70%, 0)`);

        context.beginPath();
        const start = pointFor(stream, 0, time);
        context.moveTo(start.x, start.y);

        for (let step = 1; step <= 14; step += 1) {
          const t = step / 14;
          const point = pointFor(stream, t, time);
          context.lineTo(point.x, point.y);
        }

        context.lineWidth = stream.thickness;
        context.strokeStyle = gradient;
        context.shadowBlur = 26;
        context.shadowColor = `hsla(${stream.hue + 6}, 100%, 72%, ${stream.alpha * 0.82})`;
        context.stroke();

        context.beginPath();
        context.moveTo(start.x, start.y);
        for (let step = 1; step <= 14; step += 1) {
          const t = step / 14;
          const point = pointFor(stream, t, time);
          context.lineTo(point.x, point.y);
        }
        context.lineWidth = Math.max(0.55, stream.thickness * 0.26);
        context.shadowBlur = 0;
        context.strokeStyle = `hsla(${stream.hue + 12}, 100%, 88%, ${stream.alpha * 0.95})`;
        context.stroke();
      });

      pulses.forEach((pulse) => {
        const stream = streams[pulse.lane];
        pulse.progress = (pulse.progress + pulse.speed * (reduceMotion ? 0.18 : 1.0) * 16) % 1;
        const point = pointFor(stream, pulse.progress, time);
        const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, pulse.radius * 10);
        glow.addColorStop(0, `hsla(${stream.hue + 10}, 100%, 84%, ${pulse.alpha})`);
        glow.addColorStop(1, `hsla(${stream.hue + 10}, 100%, 84%, 0)`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(point.x, point.y, pulse.radius * 10, 0, Math.PI * 2);
        context.fill();
      });
    };

    const frame = (now) => {
      pointer.x += (pointer.targetX - pointer.x) * 0.045;
      pointer.y += (pointer.targetY - pointer.y) * 0.045;

      const time = now - startTime;
      drawStreams(time);
      if (!prefersReducedMotion.matches) rafId = window.requestAnimationFrame(frame);
    };

    const handlePointerMove = (event) => {
      const bounds = flowBackground.getBoundingClientRect();
      pointer.targetX = clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1);
      pointer.targetY = clamp((event.clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1);
    };

    const handlePointerLeave = () => {
      pointer.targetX = 0.5;
      pointer.targetY = 0.35;
    };

    const handleReducedMotionChange = () => {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      drawStreams(performance.now() - startTime);
      if (!prefersReducedMotion.matches) {
        startTime = performance.now();
        rafId = window.requestAnimationFrame(frame);
      }
    };

    resize();
    drawStreams(0);

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(flowBackground);
    } else {
      window.addEventListener("resize", resize);
    }

    flowBackground.addEventListener("pointermove", handlePointerMove, { passive: true });
    flowBackground.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    prefersReducedMotion.addEventListener("change", handleReducedMotionChange);

    if (!prefersReducedMotion.matches) {
      rafId = window.requestAnimationFrame(frame);
    }
  };

  const setActiveStep = (nextStep) => {
    activeStep = Math.max(0, Math.min(2, nextStep));

    stepPanels.forEach((panel) => {
      const index = Number(panel.dataset.stepPanel || 0);
      panel.classList.toggle("is-active", index === activeStep);
    });

    stepTabButtons.forEach((button) => {
      const index = Number(button.dataset.stepTarget || 0);
      const isActive = index === activeStep;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
      const label = button.dataset.stepLabel || "";
      button.textContent = label;
    });
  };

  const stopAutoAdvance = () => {
    if (autoAdvanceKickoff) window.clearTimeout(autoAdvanceKickoff);
    if (autoAdvanceTimer) window.clearInterval(autoAdvanceTimer);
    autoAdvanceKickoff = null;
    autoAdvanceTimer = null;
  };

  const startAutoAdvance = () => {
    if (reduceMotion || autoAdvanceTimer || hasUserInteracted) return;

    autoAdvanceKickoff = window.setTimeout(() => {
      autoAdvanceTimer = window.setInterval(() => {
        setActiveStep((activeStep + 1) % 3);
      }, 3500);
    }, 1500);
  };

  const markInteracted = () => {
    if (hasUserInteracted) return;
    hasUserInteracted = true;
    stopAutoAdvance();
  };

  stepButtons.forEach((button) => {
    button.addEventListener("click", () => {
      markInteracted();
      setActiveStep(Number(button.dataset.stepTarget || 0));
    });
  });

  if (demoScrollShell && !reduceMotion) {
    const syncStepFromScroll = () => {
      if (!demoScrollShell || isTablet() || isMobile()) return;

      const rect = demoScrollShell.getBoundingClientRect();
      const total = Math.max(1, demoScrollShell.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, (-rect.top || 0) / total));
      let nextStep = 0;

      if (progress >= 0.66) nextStep = 2;
      else if (progress >= 0.33) nextStep = 1;

      setActiveStep(nextStep);
    };

    window.addEventListener("scroll", syncStepFromScroll, { passive: true });
    syncStepFromScroll();
  }

  watchTargets.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      markInteracted();
      const section = document.getElementById("how");
      section?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });

  if (menuToggle && mobileMenu && mobileMenuSheet instanceof HTMLElement) {
    let closeSafetyTimer = 0;

    const finishClose = () => {
      mobileMenu.hidden = true;
      menuToggle.focus({ preventScroll: true });
    };

    const setMenuOpen = (open) => {
      menuToggle.setAttribute("aria-expanded", String(open));

      if (open) {
        window.clearTimeout(closeSafetyTimer);
        document.body.style.overflow = "hidden";
        mobileMenu.hidden = false;
        mobileMenu.classList.remove("is-open");
        void mobileMenu.offsetWidth;
        if (reduceMotion) {
          mobileMenu.classList.add("is-open");
        } else {
          window.requestAnimationFrame(() => {
            mobileMenu.classList.add("is-open");
          });
        }
        window.setTimeout(() => {
          const first = mobileLinks[0];
          if (first instanceof HTMLElement) first.focus({ preventScroll: true });
        }, 0);
        return;
      }

      document.body.style.overflow = "";
      mobileMenu.classList.remove("is-open");

      if (reduceMotion) {
        finishClose();
        return;
      }

      const sheet = mobileMenuSheet;
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(closeSafetyTimer);
        sheet.removeEventListener("transitionend", onTransitionEnd);
        finishClose();
      };

      const onTransitionEnd = (event) => {
        if (event.target !== sheet) return;
        if (event.propertyName !== "transform" && event.propertyName !== "opacity") return;
        done();
      };

      sheet.addEventListener("transitionend", onTransitionEnd);
      closeSafetyTimer = window.setTimeout(done, 400);
    };

    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen);
    });

    mobileMenuDismiss.forEach((node) => {
      node.addEventListener("click", () => setMenuOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (menuToggle.getAttribute("aria-expanded") !== "true") return;
      event.preventDefault();
      setMenuOpen(false);
    });

    const desktopMq = window.matchMedia("(min-width: 768px)");
    const closeIfDesktop = () => {
      if (desktopMq.matches) setMenuOpen(false);
    };
    desktopMq.addEventListener("change", closeIfDesktop);

    mobileLinks.forEach((link) => {
      link.addEventListener("click", () => setMenuOpen(false));
    });
  }

  if (waitlistForm && waitlistState && waitlistButton) {
    waitlistForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      markInteracted();

      const formData = new FormData(waitlistForm);
      const email = String(formData.get("email") || "").trim();
      if (!email) return;

      waitlistButton.disabled = true;
      waitlistButton.textContent = "Sending...";
      waitlistState.textContent = "";

      try {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 700);
        });
        const aside = waitlistForm.closest(".site-footer__newsletter-aside");
        const success = document.createElement("p");
        success.className = "site-footer__waitlist-success";
        success.textContent = "You're on the list.";
        if (aside) aside.replaceChildren(success);
        else waitlistForm.replaceWith(success);
      } catch {
        waitlistState.textContent = "Something went wrong — try again";
        waitlistButton.disabled = false;
        waitlistButton.textContent = "Subscribe";
      }
    });
  }

  ["scroll", "click", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, markInteracted, { once: true, passive: true });
  });

  initFlowBackground();
  setActiveStep(0);
  startAutoAdvance();
})();
