(() => {
  if (!document.body.classList.contains("page-home")) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
  const isTablet = () => window.matchMedia("(min-width: 768px) and (max-width: 1024px)").matches;

  const stepButtons = [...document.querySelectorAll("[data-step-target]")];
  const stepPanels = [...document.querySelectorAll("[data-step-panel]")];
  const stepNavButtons = [...document.querySelectorAll(".demo-step")];
  const stepTabButtons = [...document.querySelectorAll(".demo-tab")];
  const demoScrollShell = document.querySelector(".demo__scroll-shell");
  const watchTargets = [...document.querySelectorAll("[data-scroll-watch]")];

  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const mobileLinks = mobileMenu ? [...mobileMenu.querySelectorAll("a")] : [];

  const waitlistForm = document.querySelector("[data-waitlist-form]");
  const waitlistState = document.querySelector("[data-waitlist-state]");
  const waitlistButton = waitlistForm?.querySelector("button[type='submit']");

  let activeStep = 0;
  let hasUserInteracted = false;
  let autoAdvanceTimer = null;
  let autoAdvanceKickoff = null;

  const setActiveStep = (nextStep) => {
    activeStep = Math.max(0, Math.min(3, nextStep));

    stepPanels.forEach((panel) => {
      const index = Number(panel.dataset.stepPanel || 0);
      panel.classList.toggle("is-active", index === activeStep);
    });

    stepNavButtons.forEach((button) => {
      const index = Number(button.dataset.stepTarget || 0);
      button.classList.toggle("is-active", index === activeStep);
    });

    stepTabButtons.forEach((button) => {
      const index = Number(button.dataset.stepTarget || 0);
      button.classList.toggle("is-active", index === activeStep);
      button.textContent =
        index === activeStep
          ? button.textContent.replace(/^○/, "●")
          : button.textContent.replace(/^●/, "○");
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
        setActiveStep((activeStep + 1) % 4);
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

      if (progress >= 0.99) nextStep = 3;
      else if (progress >= 0.66) nextStep = 2;
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

  if (menuToggle && mobileMenu) {
    const setMenuOpen = (open) => {
      menuToggle.setAttribute("aria-expanded", String(open));
      mobileMenu.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
    };

    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen);
    });

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
        waitlistForm.replaceWith(Object.assign(document.createElement("p"), { textContent: "You're on the list. ✓" }));
      } catch {
        waitlistState.textContent = "Something went wrong — try again";
        waitlistButton.disabled = false;
        waitlistButton.textContent = "Notify me";
      }
    });
  }

  ["scroll", "click", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, markInteracted, { once: true, passive: true });
  });

  setActiveStep(0);
  startAutoAdvance();
})();
