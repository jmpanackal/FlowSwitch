(() => {
  if (!document.body.classList.contains("page-home")) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stage = document.getElementById("workspace-stage");
  const title = document.getElementById("section-title");
  const subtitle = document.getElementById("section-subtitle");
  const taskbarSections = document.getElementById("taskbar-sections");
  const taskbarStatus = document.getElementById("taskbar-status");
  const navLinks = [...document.querySelectorAll("[data-section-link]")];

  if (!stage || !title || !subtitle || !taskbarSections || !taskbarStatus) return;

  const sections = [
    {
      key: "how",
      label: "How it works",
      icon: "HW",
      title: "How it works",
      subtitle: "Capture - arrange - switch",
      status: "capture -> arrange -> launch",
      windows: [
        {
          title: "Capture Center",
          icon: "C1",
          x: 4,
          y: 6,
          w: 30,
          h: 44,
          enterX: -120,
          enterY: 220,
          status: "capture.exe",
          html: `
            <div class="window-side">
              <p class="window-kicker">Step 1</p>
              <h3>Capture your current setup</h3>
              <p>FlowSwitch reads running windows, minimized apps, and per-monitor positions.</p>
              <div class="window-side__row"><div class="window-side__icon">A</div><div><strong>Active apps</strong><span>Editor, browser, tools, media</span></div></div>
              <div class="window-side__row"><div class="window-side__icon">M</div><div><strong>Monitor map</strong><span>Bounds, DPI, and offset geometry</span></div></div>
            </div>
          `,
        },
        {
          title: "Layout Studio",
          icon: "A2",
          x: 36,
          y: 6,
          w: 38,
          h: 44,
          enterX: 0,
          enterY: 220,
          status: "layout.tsx",
          html: `
            <div class="window-generic">
              <p class="window-kicker">Step 2</p>
              <h3>Arrange across monitors</h3>
              <p>Use monitor-aware placement to keep each profile intentional instead of approximate.</p>
              <div class="monitor-preview">
                <div class="monitor-preview__screen" data-label="M1" data-layout="a">
                  <div class="monitor-preview__pane monitor-preview__pane--cyan"></div>
                  <div class="monitor-preview__pane monitor-preview__pane--violet"></div>
                  <div class="monitor-preview__pane monitor-preview__pane--soft"></div>
                </div>
                <div class="monitor-preview__screen" data-label="M2" data-layout="b">
                  <div class="monitor-preview__pane monitor-preview__pane--soft"></div>
                  <div class="monitor-preview__pane monitor-preview__pane--cyan"></div>
                </div>
              </div>
            </div>
          `,
        },
        {
          title: "Quick Launch",
          icon: "S3",
          x: 76,
          y: 6,
          w: 20,
          h: 44,
          enterX: 130,
          enterY: 220,
          status: "launch",
          html: `
            <div class="window-side">
              <p class="window-kicker">Step 3</p>
              <h3>Switch in one action</h3>
              <p>Apply the full workspace instantly, including launch order and placement.</p>
              <div class="window-actions">
                <a href="javascript:void(0)" class="btn-primary">Launch profile</a>
              </div>
            </div>
          `,
        },
        {
          title: "FlowSwitch.app",
          icon: "FS",
          x: 4,
          y: 52,
          w: 92,
          h: 42,
          enterX: 0,
          enterY: 260,
          html: `
            <div class="window-hero">
              <div>
                <p class="window-kicker">Windows-first - Electron + React</p>
                <h3>One profile. Your whole workspace.</h3>
                <p>Bundle apps, browser tabs, and per-monitor layouts. Apply all of it with a single launch.</p>
                <div class="window-actions">
                  <a
                    href="https://github.com/jmpanackal/FlowSwitch/releases/download/v0.1.0/FlowSwitch-0.1.0-win-x64-installer.exe"
                    id="download-installer"
                    class="btn-primary"
                    data-download-link="1"
                  >Download for Windows</a>
                  <a
                    href="https://github.com/jmpanackal/FlowSwitch/releases/download/v0.1.0/FlowSwitch-0.1.0-win-x64-portable.exe"
                    id="download-portable"
                    class="btn-secondary"
                    data-download-link="1"
                  >Portable build</a>
                </div>
              </div>
              <div class="hero-profile-list">
                <div class="hero-profile-list__item"><div><strong>Morning standup</strong><span>Browser + chat + calendar</span></div><span class="hero-profile-list__dot"></span></div>
                <div class="hero-profile-list__item"><div><strong>Deep work</strong><span>Editor + docs + terminal stack</span></div><span class="hero-profile-list__dot"></span></div>
                <div class="hero-profile-list__item"><div><strong>Focus mode</strong><span>Music + do-not-disturb setup</span></div><span class="hero-profile-list__dot"></span></div>
              </div>
            </div>
          `,
        },
      ],
    },
    {
      key: "features",
      label: "Features",
      icon: "FT",
      title: "Features",
      subtitle: "Everything in your workspace, profiled",
      status: "6 feature cards",
      windows: [
        {
          title: "Profiles Hub",
          icon: "PF",
          x: 4,
          y: 6,
          w: 30,
          h: 42,
          enterX: -140,
          enterY: 220,
          html: `<div class="window-generic"><h3>Profiles</h3><p>Bundle apps, files, browser tabs, audio routes, and layout state into one profile.</p></div>`,
        },
        {
          title: "Secure Vault",
          icon: "EN",
          x: 35.5,
          y: 6,
          w: 30,
          h: 42,
          enterX: -40,
          enterY: 220,
          html: `<div class="window-generic"><h3>Encrypted persistence</h3><p>Stored in userData with safeStorage where the OS supports encryption.</p></div>`,
        },
        {
          title: "Sync Bridge",
          icon: "IE",
          x: 67,
          y: 6,
          w: 29,
          h: 42,
          enterX: 140,
          enterY: 220,
          html: `<div class="window-generic"><h3>Import / export</h3><p>Move profiles as JSON between machines for backup or migration.</p></div>`,
        },
        {
          title: "App Library",
          icon: "AS",
          x: 4,
          y: 52,
          w: 30,
          h: 42,
          enterX: -140,
          enterY: 260,
          html: `<div class="window-generic"><h3>Installed app scan</h3><p>Start menu shortcuts, registry entries, protocols, and icon extraction.</p></div>`,
        },
        {
          title: "Layout Capture",
          icon: "LC",
          x: 35.5,
          y: 52,
          w: 30,
          h: 42,
          enterX: -20,
          enterY: 260,
          html: `<div class="window-generic"><h3>Layout capture</h3><p>Snapshot monitor topology and open windows, including minimized apps.</p></div>`,
        },
        {
          title: "Schedule Engine",
          icon: "SC",
          x: 67,
          y: 52,
          w: 29,
          h: 42,
          enterX: 140,
          enterY: 260,
          html: `<div class="window-generic"><h3>Schedules + startup</h3><p>Auto-apply profiles by time, context, or OS startup trigger.</p></div>`,
        },
      ],
    },
    {
      key: "faq",
      label: "FAQ",
      icon: "Q",
      title: "FAQ",
      subtitle: "Quick answers",
      status: "5 questions",
      windows: [
        {
          title: "Help Center",
          icon: "Q",
          x: 4,
          y: 6,
          w: 60,
          h: 88,
          enterX: -120,
          enterY: 230,
          status: "5 questions",
          html: `
            <div class="timeline-window">
              <h3>Common questions</h3>
              <div class="faq-list">
                <div class="faq-item"><h4>Which platforms are supported?</h4><p>FlowSwitch is Windows-first today, with additional platform support planned later.</p></div>
                <div class="faq-item"><h4>Where are profiles stored?</h4><p>Profiles are stored locally in your app data directory as workspace profile data.</p></div>
                <div class="faq-item"><h4>Can I move profiles between PCs?</h4><p>Yes. Export profiles to JSON and import them on another machine.</p></div>
                <div class="faq-item"><h4>Will it work with multiple monitors?</h4><p>Yes. Capture and restore are monitor-aware, including uneven layouts and offsets.</p></div>
                <div class="faq-item"><h4>Can it auto-launch at startup?</h4><p>Profiles can be tied to startup and schedule-based triggers.</p></div>
              </div>
            </div>
          `,
        },
        {
          title: "Support Desk",
          icon: "SP",
          x: 66,
          y: 6,
          w: 30,
          h: 42,
          enterX: 150,
          enterY: 220,
          html: `
            <div class="window-side">
              <h3>Still stuck?</h3>
              <p>Open an issue and we triage quickly. Release notes and roadmap are public.</p>
              <div class="window-actions">
                <a href="https://github.com/jmpanackal/FlowSwitch/issues" class="btn-secondary">Open issue</a>
              </div>
            </div>
          `,
        },
        {
          title: "Power Tips",
          icon: "TP",
          x: 66,
          y: 50,
          w: 30,
          h: 44,
          enterX: 150,
          enterY: 250,
          status: "pro tip",
          html: `
            <div class="window-side">
              <h3>Bind profiles to schedules</h3>
              <p>Use a timed morning profile and an evening wind-down profile to reduce setup churn.</p>
              <div class="window-side__row"><div class="window-side__icon">9</div><div><strong>09:00</strong><span>deep-work</span></div></div>
              <div class="window-side__row"><div class="window-side__icon">6</div><div><strong>18:00</strong><span>wind-down</span></div></div>
            </div>
          `,
        },
      ],
    },
    {
      key: "changelog",
      label: "Changelog",
      icon: "CL",
      title: "Changelog",
      subtitle: "Built in the open",
      status: "release notes",
      windows: [
        {
          title: "Release Notes",
          icon: "CL",
          x: 4,
          y: 6,
          w: 64,
          h: 88,
          enterX: -120,
          enterY: 220,
          status: "main",
          html: `
            <div class="timeline-window">
              <h3>Release history</h3>
              <div class="timeline">
                <div class="timeline-entry">
                  <div class="timeline-entry__head">
                    <span class="timeline-entry__version">v1.0.0</span>
                    <span class="timeline-entry__tag">stable</span>
                    <span class="timeline-entry__date">Apr 2026</span>
                  </div>
                  <ul>
                    <li>Public stable release</li>
                    <li>Encrypted profile storage baseline</li>
                    <li>Per-monitor capture and restore</li>
                  </ul>
                </div>
                <div class="timeline-entry">
                  <div class="timeline-entry__head">
                    <span class="timeline-entry__version">v0.9.2</span>
                    <span class="timeline-entry__tag">beta</span>
                    <span class="timeline-entry__date">Mar 2026</span>
                  </div>
                  <ul>
                    <li>JSON import / export</li>
                    <li>Audio routing and startup polish</li>
                    <li>Improved browser context capture</li>
                  </ul>
                </div>
                <div class="timeline-entry">
                  <div class="timeline-entry__head">
                    <span class="timeline-entry__version">v0.8.0</span>
                    <span class="timeline-entry__tag">beta</span>
                    <span class="timeline-entry__date">Feb 2026</span>
                  </div>
                  <ul>
                    <li>Schedules and startup hooks</li>
                    <li>Installed app scan improvements</li>
                    <li>Major UI polish pass</li>
                  </ul>
                </div>
              </div>
            </div>
          `,
        },
        {
          title: "Roadmap",
          icon: "RM",
          x: 70,
          y: 6,
          w: 26,
          h: 88,
          enterX: 170,
          enterY: 220,
          status: "next",
          html: `
            <div class="window-side">
              <h3>Roadmap</h3>
              <div class="faq-list">
                <div class="faq-item"><h4>macOS preview</h4><p>Early support exploration.</p></div>
                <div class="faq-item"><h4>Cloud sync</h4><p>Optional profile sync primitives.</p></div>
                <div class="faq-item"><h4>Shortcut layers</h4><p>More keyboard-first profile actions.</p></div>
                <div class="faq-item"><h4>Plugin API</h4><p>Extensible launch behavior.</p></div>
              </div>
            </div>
          `,
        },
      ],
    },
    {
      key: "privacy",
      label: "Privacy",
      icon: "PR",
      title: "Privacy",
      subtitle: "Local-first, encrypted at rest",
      status: "local runtime",
      windows: [
        {
          title: "Privacy Center",
          icon: "PR",
          x: 4,
          y: 6,
          w: 50,
          h: 56,
          enterX: -130,
          enterY: 220,
          html: `
            <div class="window-generic">
              <p class="window-kicker">Local-first</p>
              <h3>Your workspace stays on your machine.</h3>
              <p>FlowSwitch stores profiles locally and does not require a hosted account.</p>
              <div class="privacy-list">
                <div class="privacy-list__item"><h4>No telemetry by default</h4><p>Runtime keeps data local unless you opt in to reports.</p></div>
                <div class="privacy-list__item"><h4>Encrypted at rest</h4><p>safeStorage is used where OS capabilities allow.</p></div>
                <div class="privacy-list__item"><h4>Open profile format</h4><p>Profile data can be exported and reviewed as JSON.</p></div>
              </div>
            </div>
          `,
        },
        {
          title: "Vault",
          icon: "VT",
          x: 56,
          y: 6,
          w: 40,
          h: 40,
          enterX: 160,
          enterY: 220,
          status: "safeStorage",
          html: `
            <div class="window-side">
              <h3>Profiles encrypted at rest</h3>
              <p>When available, payloads are encrypted before they are persisted to disk.</p>
              <div class="window-side__row"><div class="window-side__icon">K</div><div><strong>OS-backed crypto</strong><span>Automatic where supported</span></div></div>
            </div>
          `,
        },
        {
          title: "Runtime Network",
          icon: "NW",
          x: 56,
          y: 48,
          w: 40,
          h: 14,
          enterX: 160,
          enterY: 250,
          html: `
            <div class="window-actions">
              <span class="window-kicker">0 outbound requests - local-first runtime</span>
            </div>
          `,
        },
        {
          title: "FlowSwitch",
          icon: "FT",
          x: 4,
          y: 64,
          w: 92,
          h: 30,
          enterX: 0,
          enterY: 260,
          html: `
            <div class="window-hero">
              <div>
                <h3>FlowSwitch</h3>
                <p>Built for Windows power users who want reliable workspace restore.</p>
              </div>
              <div class="window-actions">
                <a
                  href="https://github.com/jmpanackal/FlowSwitch/releases/download/v0.1.0/FlowSwitch-0.1.0-win-x64-installer.exe"
                  class="btn-primary"
                  data-download-link="1"
                >Download</a>
                <a href="https://github.com/jmpanackal/FlowSwitch" class="btn-secondary">GitHub</a>
              </div>
            </div>
          `,
        },
      ],
    },
  ];

  let activeIndex = 0;
  let switching = false;
  const byKey = new Map(sections.map((section, index) => [section.key, index]));

  const renderTaskbarApps = (section) => {
    taskbarSections.innerHTML = "";

    section.windows.forEach((windowSpec, index) => {
      const app = document.createElement("span");
      app.className = "taskbar__app";
      if (index === 0) app.classList.add("is-active");
      app.innerHTML = `
        <span class="taskbar__app-icon">${windowSpec.icon}</span>
        <span class="taskbar__app-label">${windowSpec.title}</span>
      `;
      taskbarSections.appendChild(app);
    });
  };

  const createWindow = (windowSpec, order) => {
    const node = document.createElement("article");
    node.className = "stage-window is-entering";
    node.style.left = `${windowSpec.x}%`;
    node.style.top = `${windowSpec.y}%`;
    node.style.width = `${windowSpec.w}%`;
    node.style.height = `${windowSpec.h}%`;
    node.style.setProperty("--from-x", `${windowSpec.enterX || 0}px`);
    node.style.setProperty("--from-y", `${windowSpec.enterY || 220}px`);
    node.style.setProperty("--order", String(order));

    const statusBar = windowSpec.status
      ? `<div class="window-card__status"><span>${windowSpec.status}</span><span class="window-card__status-dot"></span></div>`
      : "";

    node.innerHTML = `
      <div class="window-card__titlebar">
        <div class="window-card__title">
          <span class="window-card__icon">${windowSpec.icon}</span>
          <span>${windowSpec.title}</span>
        </div>
        <div class="window-card__controls"><i></i><i></i><i></i></div>
      </div>
      <div class="window-card__body">
        <div class="window-card__body-inner">${windowSpec.html}</div>
      </div>
      ${statusBar}
    `;

    return node;
  };

  const fitWindowBodies = () => {
    const bodies = stage.querySelectorAll(".window-card__body");
    bodies.forEach((body) => {
      const inner = body.querySelector(".window-card__body-inner");
      if (!inner) return;

      inner.style.transform = "scale(1)";
      inner.style.width = "100%";

      const availableHeight = body.clientHeight;
      const contentHeight = inner.scrollHeight;
      if (availableHeight <= 0 || contentHeight <= availableHeight) return;

      const scale = Math.max(0.62, availableHeight / contentHeight);
      inner.style.transform = `scale(${scale})`;
      inner.style.width = `${100 / scale}%`;
    });
  };

  const updateMeta = (section) => {
    title.textContent = section.title;
    subtitle.textContent = section.subtitle;
    taskbarStatus.textContent = section.status;
    renderTaskbarApps(section);

    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.sectionLink === section.key);
    });

    const nextHash = `#${section.key}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  };

  const renderSection = (section, immediate = false) => {
    stage.innerHTML = "";

    section.windows.forEach((windowSpec, index) => {
      const node = createWindow(windowSpec, index);
      stage.appendChild(node);

      if (immediate || reduceMotion) {
        node.classList.remove("is-entering");
        node.classList.add("is-active");
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.classList.remove("is-entering");
          node.classList.add("is-active");
        });
      });
    });

    requestAnimationFrame(() => {
      fitWindowBodies();
    });

    window.__flowswitchApplyDownloads?.();
  };

  const switchTo = (key) => {
    const nextIndex = byKey.get(key);
    if (nextIndex == null || nextIndex === activeIndex || switching) return;

    switching = true;
    const currentNodes = [...stage.querySelectorAll(".stage-window")];

    currentNodes.forEach((node) => {
      node.classList.remove("is-active", "is-entering");
      node.classList.add("is-exiting");
    });

    const complete = () => {
      activeIndex = nextIndex;
      const section = sections[activeIndex];
      updateMeta(section);
      renderSection(section);
      window.setTimeout(() => {
        switching = false;
      }, reduceMotion ? 40 : 840);
    };

    if (reduceMotion || currentNodes.length === 0) {
      complete();
      return;
    }

    window.setTimeout(complete, 360);
  };

  const moveBy = (direction) => {
    const next = activeIndex + direction;
    if (next < 0 || next >= sections.length) return;
    switchTo(sections[next].key);
  };

  const initialKey = byKey.has(window.location.hash.slice(1)) ? window.location.hash.slice(1) : sections[0].key;
  activeIndex = byKey.get(initialKey) || 0;
  updateMeta(sections[activeIndex]);
  renderSection(sections[activeIndex], true);

  document.querySelectorAll("[data-section-select]").forEach((button) => {
    button.addEventListener("click", () => {
      switchTo(button.dataset.sectionSelect);
    });
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const key = link.dataset.sectionLink;
      if (!key) return;
      event.preventDefault();
      switchTo(key);
    });
  });

  let wheelLock = false;
  window.addEventListener(
    "wheel",
    (event) => {
      if (window.innerWidth < 761) return;
      if (wheelLock || Math.abs(event.deltaY) < 24) return;
      wheelLock = true;
      moveBy(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => {
        wheelLock = false;
      }, 900);
    },
    { passive: true },
  );

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      moveBy(1);
    }
    if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      moveBy(-1);
    }
  });

  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      fitWindowBodies();
    });
  });
})();
