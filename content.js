(() => {
  if (location.pathname.startsWith("/embed") || location.pathname.startsWith("/live_chat")) {
    return;
  }

  const HOSTS = new Set(["www.youtube.com", "m.youtube.com", "youtube.com"]);
  const SKIP_TAGS = new Set([
    "YTD-APP",
    "YTD-PAGE-MANAGER",
    "YTD-WATCH-FLEXY",
    "YTD-BROWSE",
    "BODY",
    "HTML",
  ]);
  let hardNavLock = false;

  const pathParts = (pathname) => pathname.split("/").filter(Boolean);

  const isHomePath = (pathname) => {
    const parts = pathParts(pathname);
    if (!parts.length) return false;
    const featured = (seg) => seg === "featured" || seg === "home";
    if (parts[0].charCodeAt(0) === 64) {
      return parts.length === 1 || (parts.length === 2 && featured(parts[1]));
    }
    if (parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") {
      return parts.length === 2 || (parts.length === 3 && featured(parts[2]));
    }
    return false;
  };

  const isVideosPath = (pathname) => {
    const parts = pathParts(pathname);
    if (parts[0] && parts[0].charCodeAt(0) === 64) return parts[1] === "videos";
    if (parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") {
      return parts[2] === "videos";
    }
    return false;
  };

  const classifyHref = (href) => {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (!HOSTS.has(url.hostname)) return null;
    if (isHomePath(url.pathname)) {
      const parts = pathParts(url.pathname);
      url.pathname =
        parts[0].charCodeAt(0) === 64
          ? `/${parts[0]}/videos`
          : `/${parts[0]}/${parts[1]}/videos`;
      return { kind: "home", url };
    }
    if (isVideosPath(url.pathname)) return { kind: "videos", url };
    return { kind: "other", url };
  };

  const toVideosUrl = (href) => {
    const c = classifyHref(href);
    return c && (c.kind === "home" || c.kind === "videos") ? c.url : null;
  };

  const sameVideosPage = (url) =>
    url && isVideosPath(location.pathname) && location.pathname === url.pathname;

  const hrefFor = (url, originalHref) =>
    /^https?:\/\//i.test(originalHref || "")
      ? url.href
      : url.pathname + url.search + url.hash;

  const epUrl = (ep) =>
    (ep &&
      ((ep.commandMetadata &&
        ep.commandMetadata.webCommandMetadata &&
        ep.commandMetadata.webCommandMetadata.url) ||
        (ep.browseEndpoint && ep.browseEndpoint.canonicalBaseUrl) ||
        (ep.webCommandMetadata && ep.webCommandMetadata.url))) ||
    null;

  const getData = (el) => {
    if (!el || el.nodeType !== 1) return null;
    const hosts = [el, el.polymerController, el.inst, el.__dataHost];
    for (let i = 0; i < hosts.length; i++) {
      const h = hosts[i];
      if (!h) continue;
      if (h.data && typeof h.data === "object") return h.data;
      if (h._data && typeof h._data === "object") return h._data;
      if (h.__data && typeof h.__data === "object") return h.__data;
    }
    return null;
  };

  // Primary command only. Do not walk owner/byline text: video cards nest the
  // channel there, and that is not the click target.
  const destFromPrimary = (obj, seen, depth) => {
    if (!obj || typeof obj !== "object" || depth > 6 || seen.has(obj)) return null;
    seen.add(obj);

    if (obj.watchEndpoint || obj.reelWatchEndpoint || obj.videoId) {
      return { kind: "other" };
    }

    const typed = classifyHref(epUrl(obj));
    if (typed) return typed;

    const nested = [
      obj.navigationEndpoint,
      obj.endpoint,
      obj.command,
      obj.innertubeCommand,
      obj.onTap,
    ];
    for (let i = 0; i < nested.length; i++) {
      const r = destFromPrimary(nested[i], seen, depth + 1);
      if (r) return r;
    }

    const onTap =
      obj.rendererContext &&
      obj.rendererContext.commandContext &&
      obj.rendererContext.commandContext.onTap &&
      obj.rendererContext.commandContext.onTap.innertubeCommand;
    if (onTap) {
      const r = destFromPrimary(onTap, seen, depth + 1);
      if (r) return r;
    }

    if (Array.isArray(obj.runs)) {
      for (let i = 0; i < obj.runs.length; i++) {
        const r = destFromPrimary(obj.runs[i], seen, depth + 1);
        if (r) return r;
      }
    }

    if (obj.text && typeof obj.text === "object") {
      const r = destFromPrimary(obj.text, seen, depth + 1);
      if (r) return r;
    }

    return null;
  };

  const urlFromClassified = (c) => {
    if (!c || c.kind === "other") return null;
    return c.url;
  };

  const destFromEvent = (event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!node || node.nodeType !== 1 || SKIP_TAGS.has(node.tagName)) continue;

      if (node.tagName === "A" && node.href) {
        const c = classifyHref(node.href);
        if (c) {
          if (c.kind === "home") {
            node.href = hrefFor(c.url, node.getAttribute("href"));
          }
          return urlFromClassified(c);
        }
      }

      const data = getData(node);
      if (data) {
        const c = destFromPrimary(data, new WeakSet(), 0);
        if (c) return urlFromClassified(c);
      }
    }
    return null;
  };

  const destFromDetail = (detail) => {
    if (!detail || typeof detail !== "object") return null;
    if (typeof detail.url === "string") {
      const c = classifyHref(detail.url);
      if (c) return urlFromClassified(c);
    }
    return urlFromClassified(destFromPrimary(detail, new WeakSet(), 0));
  };

  const hardNav = (url) => {
    if (!url || hardNavLock || sameVideosPage(url)) return false;
    hardNavLock = true;
    location.assign(url.href);
    return true;
  };

  const modifiedClick = (event) =>
    event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

  // Rewrite href early so middle-click / open-in-new-tab already points at /videos.
  addEventListener(
    "pointerdown",
    (event) => {
      destFromEvent(event);
    },
    true
  );

  // YouTube SPA from a watch page sets the URL to /videos but still browses Home.
  // Cancel that navigation and load /videos as a real document instead.
  const steal = (event) => {
    if (modifiedClick(event)) return;
    const url = destFromEvent(event);
    if (!url || sameVideosPage(url)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    hardNav(url);
  };

  addEventListener("click", steal, true);
  addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      steal(event);
    },
    true
  );

  ["yt-navigate", "yt-navigate-start"].forEach((name) => {
    addEventListener(
      name,
      (event) => {
        const url = destFromDetail(event.detail);
        if (!url || sameVideosPage(url)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        hardNav(url);
      },
      true
    );
  });

  const wrapHandleNavigate = () => {
    const app = document.querySelector("ytd-app");
    if (!app || app.__ytvrWrapped) return false;
    const orig = app.handleNavigate;
    if (typeof orig !== "function") return false;
    app.__ytvrWrapped = true;
    app.handleNavigate = function (ev) {
      try {
        const command = ev && (ev.command || (ev.detail && ev.detail.endpoint) || ev);
        const url = destFromDetail(command);
        if (url && !sameVideosPage(url)) {
          hardNav(url);
          return;
        }
      } catch (_) {}
      return orig.apply(this, arguments);
    };
    return true;
  };

  if (!wrapHandleNavigate()) {
    const mo = new MutationObserver(() => {
      if (wrapHandleNavigate()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  const selectedTabIsHome = () => {
    const tab = document.querySelector(
      "yt-tab-shape[aria-selected='true'], #tabsContent [aria-selected='true'], yt-tab-group-shape [aria-selected='true']"
    );
    if (!tab) return false;
    const a = tab.closest("a") || tab.querySelector("a") || tab;
    const href = a.getAttribute && (a.getAttribute("href") || a.href);
    if (href) {
      try {
        return isHomePath(new URL(href, location.href).pathname);
      } catch (_) {}
    }
    const title = (
      tab.getAttribute("tab-title") ||
      tab.getAttribute("aria-label") ||
      tab.textContent ||
      ""
    ).toLowerCase();
    if (/video|видео|vidéo/.test(title)) return false;
    return /home|featured|главн|accueil|inicio|startseite/.test(title);
  };

  const recoverMismatch = () => {
    if (!isVideosPath(location.pathname) || hardNavLock) return;
    if (!selectedTabIsHome()) return;
    const key = "ytvr-fix:" + location.pathname;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    location.replace(location.href);
  };

  ["yt-navigate-finish", "yt-page-data-updated"].forEach((name) => {
    addEventListener(name, recoverMismatch, true);
  });

  if (window.navigation && typeof navigation.addEventListener === "function") {
    navigation.addEventListener("navigate", (event) => {
      if (event.hashChange || event.downloadRequest) return;
      const dest = event.destination && event.destination.url;
      const url = dest && toVideosUrl(dest);
      if (!url || sameVideosPage(url)) return;
      if (event.destination.sameDocument === false) return;
      if (event.cancelable) event.preventDefault();
      hardNav(url);
    });
  }

  const landed = toVideosUrl(location.href);
  if (landed && isHomePath(location.pathname) && landed.href !== location.href) {
    window.stop();
    location.replace(landed.href);
  }
})();
