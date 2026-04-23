(() => {
  const byId = (id) => document.getElementById(id);
  let cachedReleaseData = null;

  const releaseFileUrl = (data, fileName) => {
    const base = String(data.downloadBaseUrl || "").trim();
    if (base) {
      const root = base.endsWith("/") ? base : `${base}/`;
      try {
        const resolved =
          root.startsWith("http://") || root.startsWith("https://")
            ? new URL(fileName, root)
            : new URL(fileName, new URL(root, window.location.href));
        return resolved.href;
      } catch {
        return `${root}${fileName}`;
      }
    }

    const repo = String(data.githubRepository || "").replace(/^\/+|\/+$/g, "");
    const tag = String(data.releaseTag || "").trim();
    const file = String(fileName || "").trim();

    if (!/^[\w.-]+$/.test(tag) || !/^[\w.-]+$/.test(file)) {
      return `https://github.com/${repo}/releases`;
    }

    return `https://github.com/${repo}/releases/download/${tag}/${file}`;
  };

  const applyDownloadUi = () => {
    const data = cachedReleaseData;
    if (!data) return;

    const installer = data?.files?.installer;
    const portable = data?.files?.portable;
    const versionMeta = byId("download-version-meta");
    const headerVersionMeta = byId("header-version-pill");
    const primary = byId("download-installer");
    const secondary = byId("download-portable");
    const header = byId("header-download");
    const dynamicDownloadLinks = [...document.querySelectorAll("[data-download-link='1']")];

    if (versionMeta) {
      versionMeta.textContent =
        data.version && data.releaseTag ? `${data.releaseTag} - Early access build` : "";
    }

    if (headerVersionMeta) {
      headerVersionMeta.textContent =
        data.version && data.releaseTag ? `${data.releaseTag} · Early access` : "";
    }

    if (installer) {
      const installerUrl = releaseFileUrl(data, installer);
      if (primary) primary.href = installerUrl;
      if (header) header.href = installerUrl;
      dynamicDownloadLinks.forEach((link) => {
        if (link instanceof HTMLAnchorElement) link.href = installerUrl;
      });
    }

    if (portable && secondary) {
      secondary.href = releaseFileUrl(data, portable);
    }
  };

  const showDownloadError = () => {
    const node = byId("download-error");
    if (!node) return;
    node.hidden = false;
    node.setAttribute("aria-live", "polite");
  };

  window.__flowswitchApplyDownloads = applyDownloadUi;

  fetch("./latest.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then((data) => {
      cachedReleaseData = data;
      applyDownloadUi();
    })
    .catch(() => {
      showDownloadError();
    });

  const header = document.querySelector(".site-header");
  if (header) {
    const syncHeader = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };

    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
  }
})();
