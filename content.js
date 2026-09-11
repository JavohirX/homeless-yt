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

  const toVideosUrl = (href) => {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (!HOSTS.has(url.hostname)) return null;
    const parts = pathParts(url.pathname);
    if (isHomePath(url.pathname)) {
      url.pathname =
        parts[0].charCodeAt(0) === 64
          ? `/${parts[0]}/videos`
          : `/${parts[0]}/${parts[1]}/videos`;
      return url;
    }
    if (isVideosPath(url.pathname)) return url;
    return null;
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

  const walkForDest = (obj, seen, depth, out) => {
    if (!obj || typeof obj !== "object" || depth > 6 || seen.has(obj)) return;
    seen.add(obj);
    const next = toVideosUrl(epUrl(obj));
    if (next) out.url = next;
    const nested = [
      obj.navigationEndpoint,
      obj.endpoint,
      obj.command,
      obj.innertubeCommand,
      obj.onTap,
      obj.title,
      obj.longBylineText,
      obj.shortBylineText,
      obj.ownerText,
    ];
    for (let i = 0; i < nested.length; i++) walkForDest(nested[i], seen, depth + 1, out);
    if (Array.isArray(obj.runs)) {
      for (let i = 0; i < obj.runs.length; i++) walkForDest(obj.runs[i], seen, depth + 1, out);
    }
    const onTap =
      obj.rendererContext &&
      obj.rendererContext.commandContext &&
      obj.rendererContext.commandContext.onTap &&
      obj.rendererContext.commandContext.onTap.innertubeCommand;
    if (onTap) walkForDest(onTap, seen, depth + 1, out);
  };

  const destFromEvent = (event) => {
    const out = { url: null };
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!node || node.nodeType !== 1 || SKIP_TAGS.has(node.tagName)) continue;
      if (node.tagName === "A" && node.href) {
        const next = toVideosUrl(node.href);
        if (next) {
          node.href = hrefFor(next, node.getAttribute("href"));
          out.url = next;
        }
      }
      const data = getData(node);
      if (data) walkForDest(data, new WeakSet(), 0, out);
    }
    return out.url;
  };

  const destFromDetail = (detail) => {
    if (!detail || typeof detail !== "object") return null;
    const out = { url: null };
    walkForDest(detail, new WeakSet(), 0, out);
    if (detail.url) {
      const next = toVideosUrl(detail.url);
      if (next) out.url = next;
    }
    if (detail.endpoint) walkForDest(detail.endpoint, new WeakSet(), 0, out);
    return out.url;
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
        const url = toVideosUrl(epUrl(command)) || destFromDetail(command);
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
