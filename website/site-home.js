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
      status: "Profile ready",
      windows: [
        {
          title: "FlowSwitch.app",
          icon: "FS",
          x: 4,
          y: 6,
          w: 62,
          h: 42,
          enterX: 0,
          enterY: 240,
          status: "workspace loaded",
          html: `
            <div class="window-hero">
              <div>
                <p class="window-kicker">Windows-first workspace switching</p>
                <h3>Capture the desk once, then bring it back on demand.</h3>
                <p>FlowSwitch saves your monitor layout, app windows, launch order, and browser context so your setup can switch states as cleanly as your schedule does.</p>
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
                <div class="hero-profile-list__item">
                  <div><strong>Deep work</strong><span>Editor, docs, browser, notes</span></div>
                  <span class="hero-profile-list__dot"></span>
                </div>
                <div class="hero-profile-list__item">
                  <div><strong>Streaming</strong><span>OBS, chat, media, monitor routing</span></div>
                  <span class="hero-profile-list__dot"></span>
                </div>
                <div class="hero-profile-list__item">
                  <div><strong>Gaming</strong><span>Fullscreen, voice, side panels</span></div>
                  <span class="hero-profile-list__dot"></span>
                </div>
                <div class="hero-profile-list__item">
                  <div><strong>Admin</strong><span>Mail, calendar, browser tabs, utilities</span></div>
                  <span class="hero-profile-list__dot"></span>
                </div>
              </div>
            </div>
          `,
        },
        {
          title: "capture.exe",
          icon: "CP",
          x: 68,
          y: 8,
          w: 28,
          h: 28,
          enterX: 170,
          enterY: 190,
          html: `
            <div class="window-side">
              <h3>Capture the current state</h3>
              <p>Read open windows, monitor bounds, and launch context directly from the setup you already built.</p>
              <div class="window-side__row"><div class="window-side__icon">M</div><div><strong>Monitor geometry</strong><span>Mixed DPI, offset screens, stacked layouts</span></div></div>
              <div class="window-side__row"><div class="window-side__icon">W</div><div><strong>Window state</strong><span>Placement, size, minimized apps, active windows</span></div></div>
            </div>
          `,
        },
        {
          title: "layout-preview.tsx",
          icon: "LY",
          x: 12,
          y: 52,
          w: 84,
          h: 38,
          enterX: 0,
          enterY: 280,
          html: `
            <div class="monitor-preview">
              <div class="monitor-preview__screen" data-label="Monitor 1" data-layout="a">
                <div class="monitor-preview__pane monitor-preview__pane--cyan"></div>
                <div class="monitor-preview__pane monitor-preview__pane--violet"></div>
                <div class="monitor-preview__pane monitor-preview__pane--soft"></div>
              </div>
              <div class="monitor-preview__screen" data-label="Monitor 2" data-layout="b">
                <div class="monitor-preview__pane monitor-preview__pane--soft"></div>
                <div class="monitor-preview__pane monitor-preview__pane--cyan"></div>
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
      subtitle: "Everything in the workspace, profiled",
      status: "6 modules active",
      windows: [
        {
          title: "features-grid.tsx",
          icon: "FT",
          x: 4,
          y: 8,
          w: 58,
          h: 82,
          enterX: -160,
          enterY: 220,
          html: `
            <div class="window-generic">
              <h3>Built for Windows power users who care where everything lands.</h3>
              <p>Profiles group the setup, launches apply it, and monitor-aware placement keeps the result looking intentional instead of approximate.</p>
              <div class="feature-grid">
                <div class="feature-tile"><h4>Profiles</h4><p>Save distinct workspace states for coding, streaming, study, or gaming.</p></div>
                <div class="feature-tile"><h4>Launch flows</h4><p>Attach app startup, browser context, and ordered restore behavior to each profile.</p></div>
                <div class="feature-tile"><h4>Monitor topology</h4><p>Designed for uneven desk geometry, mixed DPI, and multi-monitor arrays.</p></div>
                <div class="feature-tile"><h4>Local-first</h4><p>Your workspace data stays on the machine and can be exported when needed.</p></div>
              </div>
            </div>
          `,
        },
        {
          title: "layout-engine.ts",
          icon: "LE",
          x: 64,
          y: 8,
          w: 32,
          h: 50,
          enterX: 190,
          enterY: 210,
          status: "layout engine",
          html: `
            <div class="window-side">
              <h3>Monitors that behave like real monitors.</h3>
              <p>Handle tall side displays, centered ultrawides, docked laptops, and layouts that drift over time.</p>
              <div class="window-side__row"><div class="window-side__icon">1</div><div><strong>Mixed DPI</strong><span>Capture and restore across different scale factors</span></div></div>
              <div class="window-side__row"><div class="window-side__icon">2</div><div><strong>Offset screens</strong><span>Not every desk is a perfect rectangle</span></div></div>
              <div class="window-side__row"><div class="window-side__icon">3</div><div><strong>Fast switching</strong><span>Move from one profile state to the next in one action</span></div></div>
            </div>
          `,
        },
        {
          title: "window-map.json",
          icon: "WM",
          x: 64,
          y: 60,
          w: 32,
          h: 30,
          enterX: 160,
          enterY: 250,
          html: `
            <div class="mini-grid">
              <div class="feature-tile"><h4>Per-app rules</h4><p>Placement, order, and launch behavior stay attached to the profile.</p></div>
              <div class="feature-tile"><h4>Browser tabs</h4><p>Restore web context alongside native apps so the desk comes back complete.</p></div>
            </div>
          `,
        },
      ],
    },
    {
      key: "faq",
      label: "FAQ",
      icon: "Q",
      title: "FAQ",
      subtitle: "Quick answers",
      status: "4 questions loaded",
      windows: [
        {
          title: "faq.md",
          icon: "Q",
          x: 4,
          y: 8,
          w: 62,
          h: 82,
          enterX: -120,
          enterY: 220,
          html: `
            <div class="timeline-window">
              <h3>Common questions.</h3>
              <div class="faq-list">
                <div class="faq-item"><h4>Where is data saved?</h4><p>Profiles, layout metadata, and related settings are stored locally in <code>%APPDATA%/FlowSwitch</code>.</p></div>
                <div class="faq-item"><h4>What about elevated windows?</h4><p>Apps running as Administrator may require FlowSwitch to run elevated too if you want them captured and restored accurately.</p></div>
                <div class="faq-item"><h4>Do I need global hotkeys?</h4><p>No. Hotkeys are optional. You can trigger flows directly through the application interface.</p></div>
                <div class="faq-item"><h4>Is macOS supported?</h4><p>Not right now. FlowSwitch is deeply tied to the Win32 API and current effort is focused on the Windows experience.</p></div>
              </div>
            </div>
          `,
        },
        {
          title: "focus.txt",
          icon: "FX",
          x: 69,
          y: 14,
          w: 27,
          h: 34,
          enterX: 170,
          enterY: 190,
          html: `
            <div class="window-side">
              <h3>Current focus</h3>
              <p>Shipping the Windows experience first and tightening the launch + layout loop.</p>
            </div>
          `,
        },
        {
          title: "tip.txt",
          icon: "TP",
          x: 69,
          y: 54,
          w: 27,
          h: 24,
          enterX: 170,
          enterY: 240,
          html: `
            <div class="window-side">
              <h3>Pro tip</h3>
              <p>Use distinct profiles for each mode instead of forcing one giant do-everything setup.</p>
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
      status: "release history",
      windows: [
        {
          title: "CHANGELOG.md",
          icon: "CL",
          x: 4,
          y: 8,
          w: 64,
          h: 82,
          enterX: -120,
          enterY: 220,
          html: `
            <div class="timeline-window">
              <h3>Release history</h3>
              <div class="timeline">
                <div class="timeline-entry">
                  <div class="timeline-entry__head">
                    <span class="timeline-entry__version">v0.1.0</span>
                    <span class="timeline-entry__tag">early access</span>
                    <span class="timeline-entry__date">April 2026</span>
                  </div>
                  <ul>
                    <li>Initial public Windows release</li>
                    <li>Monitor layout capture and restore baseline</li>
                    <li>Website-driven release metadata wiring</li>
                  </ul>
                </div>
                <div class="timeline-entry">
                  <div class="timeline-entry__head">
                    <span class="timeline-entry__version">Next</span>
                    <span class="timeline-entry__tag">in progress</span>
                    <span class="timeline-entry__date">Current</span>
                  </div>
                  <ul>
                    <li>Polish around launch reliability and layout orchestration</li>
                    <li>Additional UX refinement for profile editing</li>
                    <li>Ongoing stabilization for early adopters</li>
                  </ul>
                </div>
              </div>
            </div>
          `,
        },
        {
          title: "release-links.json",
          icon: "RL",
          x: 71,
          y: 16,
          w: 25,
          h: 58,
          enterX: 170,
          enterY: 220,
          html: `
            <div class="window-side">
              <h3>Downloads stay current</h3>
              <p>The website refreshes installer metadata from the current release payload so CTA links can stay in sync with shipped builds.</p>
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
      subtitle: "Local-first by default",
      status: "local runtime",
      windows: [
        {
          title: "privacy.md",
          icon: "PR",
          x: 4,
          y: 8,
          w: 54,
          h: 54,
          enterX: -140,
          enterY: 220,
          html: `
            <div class="window-generic">
              <h3>Your workspace stays on your machine.</h3>
              <p>FlowSwitch is a desktop app for Windows. Profiles live locally, no account is required, and the goal is to keep workspace state under your control rather than on a hosted service.</p>
              <div class="privacy-list">
                <div class="privacy-list__item"><h4>Local profile storage</h4><p>Workspace data is designed to live under <code>%APPDATA%/FlowSwitch</code>.</p></div>
                <div class="privacy-list__item"><h4>No required cloud account</h4><p>You can use the app without signing into a hosted backend.</p></div>
              </div>
            </div>
          `,
        },
        {
          title: "trust-panel.tsx",
          icon: "TR",
          x: 61,
          y: 8,
          w: 35,
          h: 30,
          enterX: 170,
          enterY: 190,
          html: `
            <div class="window-side">
              <h3>Windows native</h3>
              <p>Built around monitor geometry, app placement, and launch orchestration rather than a generic browser shell.</p>
            </div>
          `,
        },
        {
          title: "runtime.log",
          icon: "RT",
          x: 61,
          y: 44,
          w: 35,
          h: 24,
          enterX: 150,
          enterY: 230,
          html: `
            <div class="window-side">
              <h3>Early access status</h3>
              <p>Still in active development, with defaults and features evolving as the Windows experience hardens.</p>
            </div>
          `,
        },
        {
          title: "links.txt",
          icon: "LN",
          x: 10,
          y: 68,
          w: 86,
          h: 20,
          enterX: 0,
          enterY: 260,
          html: `
            <div class="window-actions">
              <a href="./privacy.html" class="btn-secondary">Read full privacy page</a>
              <a href="./changelog.html" class="btn-secondary">Open changelog page</a>
            </div>
          `,
        },
      ],
    },
  ];

  let activeIndex = 0;
  let switching = false;
  const byKey = new Map(sections.map((section, index) => [section.key, index]));

  const createTaskbar = () => {
    taskbarSections.innerHTML = "";

    sections.forEach((section) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "taskbar__section";
      button.dataset.sectionSelect = section.key;
      button.innerHTML = `
        <span class="taskbar__section-icon">${section.icon}</span>
        <span class="taskbar__section-label">${section.label}</span>
      `;
      button.addEventListener("click", () => switchTo(section.key));
      taskbarSections.appendChild(button);
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
      <div class="window-card__body">${windowSpec.html}</div>
      ${statusBar}
    `;

    return node;
  };

  const updateMeta = (section) => {
    title.textContent = section.title;
    subtitle.textContent = section.subtitle;
    taskbarStatus.textContent = section.status;

    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.sectionLink === section.key);
    });

    [...taskbarSections.querySelectorAll(".taskbar__section")].forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sectionSelect === section.key);
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

  createTaskbar();

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
})();
