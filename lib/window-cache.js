import { captureWindow } from "./sessions.js";

const SESSION_CACHE_KEY = "persistedWindowCaches";
const cache = new Map();
const pendingRefresh = new Map();

async function readPersistedCaches() {
  const data = await chrome.storage.session.get(SESSION_CACHE_KEY);
  return data[SESSION_CACHE_KEY] || {};
}

async function writePersistedCache(windowId, entry) {
  const caches = await readPersistedCaches();
  const key = String(windowId);
  if (entry) {
    caches[key] = entry;
  } else {
    delete caches[key];
  }
  await chrome.storage.session.set({ [SESSION_CACHE_KEY]: caches });
}

export async function getCachedWindow(windowId) {
  const memory = cache.get(windowId);
  if (memory) {
    return memory;
  }
  const caches = await readPersistedCaches();
  return caches[String(windowId)] || null;
}

export async function clearCachedWindow(windowId) {
  cache.delete(windowId);
  const pending = pendingRefresh.get(windowId);
  if (pending) {
    clearTimeout(pending);
    pendingRefresh.delete(windowId);
  }
  await writePersistedCache(windowId, null);
}

export async function refreshWindowCache(windowId) {
  try {
    const captured = await captureWindow(windowId);
    if (captured.tabs.length) {
      const entry = {
        tabs: captured.tabs,
        window: captured.window,
        skippedCount: captured.skippedCount,
        liveTabCount: captured.liveTabCount,
        updatedAt: Date.now(),
      };
      cache.set(windowId, entry);
      await writePersistedCache(windowId, entry);
      return entry;
    }
    await clearCachedWindow(windowId);
    return null;
  } catch {
    await clearCachedWindow(windowId);
    return null;
  }
}

function scheduleRefresh(windowId) {
  if (pendingRefresh.has(windowId)) {
    return;
  }
  const timer = setTimeout(async () => {
    pendingRefresh.delete(windowId);
    await refreshWindowCache(windowId);
  }, 400);
  pendingRefresh.set(windowId, timer);
}

export async function warmWindowCaches() {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  await Promise.all(
    windows.filter((window) => !window.incognito).map((window) => refreshWindowCache(window.id))
  );
}

export function registerWindowCacheListeners() {
  const onTabChange = (windowId) => {
    if (typeof windowId === "number") {
      scheduleRefresh(windowId);
    }
  };

  chrome.windows.onCreated.addListener((window) => {
    if (window.type === "normal" && !window.incognito) {
      refreshWindowCache(window.id).catch(() => undefined);
    }
  });

  chrome.tabs.onCreated.addListener((tab) => onTabChange(tab.windowId));
  chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => onTabChange(tab.windowId));
  chrome.tabs.onRemoved.addListener((_tabId, removeInfo) => onTabChange(removeInfo.windowId));
  chrome.tabs.onMoved.addListener((_tabId, moveInfo) => onTabChange(moveInfo.windowId));
  chrome.tabs.onAttached.addListener((_tabId, attachInfo) => onTabChange(attachInfo.newWindowId));
  chrome.tabs.onDetached.addListener((_tabId, detachInfo) => onTabChange(detachInfo.oldWindowId));

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      refreshWindowCache(windowId).catch(() => undefined);
    }
  });
}
