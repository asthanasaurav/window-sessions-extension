import { getSettings } from "./storage.js";

const IDLE_WINDOW_KEY = "idleWindowId";

async function getStoredIdleWindowId() {
  const result = await chrome.storage.local.get(IDLE_WINDOW_KEY);
  return result[IDLE_WINDOW_KEY] ?? null;
}

async function setStoredIdleWindowId(windowId) {
  await chrome.storage.local.set({ [IDLE_WINDOW_KEY]: windowId });
}

async function clearStoredIdleWindowId() {
  await chrome.storage.local.remove(IDLE_WINDOW_KEY);
}

async function resolveIdleWindowId() {
  const storedId = await getStoredIdleWindowId();
  if (storedId) {
    try {
      const window = await chrome.windows.get(storedId, { populate: false });
      if (!window.incognito) return window.id;
    } catch {
      await clearStoredIdleWindowId();
    }
  }

  const created = await chrome.windows.create({
    url: "about:blank",
    focused: false,
    state: "normal",
  });
  await setStoredIdleWindowId(created.id);
  return created.id;
}

function isIncognitoWindow(windowId, incognitoWindowIds) {
  return incognitoWindowIds.has(windowId);
}

export async function getInactiveTabsToCollect(idleWindowId = null) {
  const settings = await getSettings();
  const storedIdleId = idleWindowId ?? (await getStoredIdleWindowId());
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const incognitoWindowIds = new Set(
    windows.filter((window) => window.incognito).map((window) => window.id)
  );

  const allTabs = await chrome.tabs.query({});
  return allTabs.filter((tab) => {
    if (tab.active) return false;
    if (isIncognitoWindow(tab.windowId, incognitoWindowIds)) return false;
    if (storedIdleId && tab.windowId === storedIdleId) return false;
    if (settings.idleKeepPinned && tab.pinned) return false;
    if (settings.idleKeepAudible && tab.audible) return false;
    return true;
  });
}

async function removePlaceholderTabs(idleWindowId, keepTabIds) {
  const idleTabs = await chrome.tabs.query({ windowId: idleWindowId });
  const placeholders = idleTabs.filter(
    (tab) =>
      (tab.url === "about:blank" || tab.url === "chrome://newtab/") &&
      !keepTabIds.has(tab.id)
  );
  if (!placeholders.length) return;
  const remaining = idleTabs.length - placeholders.length;
  if (remaining <= 0 && keepTabIds.size > 0) {
    await chrome.tabs.remove(placeholders.slice(0, -1).map((tab) => tab.id));
    return;
  }
  if (placeholders.length && keepTabIds.size > 0) {
    await chrome.tabs.remove(placeholders.map((tab) => tab.id));
  }
}

async function discardTabs(tabIds) {
  let discarded = 0;
  for (const tabId of tabIds) {
    try {
      await chrome.tabs.update(tabId, { autoDiscardable: true });
      const result = await chrome.tabs.discard(tabId);
      if (result) discarded += 1;
    } catch {
      // Some tabs (e.g. active, restricted) cannot be discarded.
    }
  }
  return discarded;
}

export async function collectInactiveTabs() {
  const settings = await getSettings();
  const candidates = await getInactiveTabsToCollect();
  if (!candidates.length) {
    return {
      moved: 0,
      discarded: 0,
      windowId: null,
      message: "No inactive tabs to park.",
    };
  }

  const idleWindowId = await resolveIdleWindowId();
  const tabIds = candidates.map((tab) => tab.id);
  const movedIds = [];

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.move(tabId, { windowId: idleWindowId, index: -1 });
      movedIds.push(tabId);
    } catch {
      // Skip tabs that cannot be moved (e.g. locked pages).
    }
  }

  if (!movedIds.length) {
    return {
      moved: 0,
      discarded: 0,
      windowId: idleWindowId,
      message: "Could not move any inactive tabs.",
    };
  }

  await removePlaceholderTabs(idleWindowId, new Set(movedIds));
  const discarded = await discardTabs(movedIds);

  if (settings.idleMinimizeWindow) {
    try {
      await chrome.windows.update(idleWindowId, { state: "minimized" });
    } catch {
      // Window state update can fail on some platforms; tabs are still parked.
    }
  }

  return {
    moved: movedIds.length,
    discarded,
    windowId: idleWindowId,
    message: `Parked ${movedIds.length} tab${movedIds.length === 1 ? "" : "s"} · ${discarded} sleeping`,
  };
}

export async function countInactiveTabs() {
  const tabs = await getInactiveTabsToCollect();
  return tabs.length;
}

export function registerIdleWindowListener() {
  chrome.windows.onRemoved.addListener(async (windowId) => {
    const storedId = await getStoredIdleWindowId();
    if (storedId === windowId) {
      await clearStoredIdleWindowId();
    }
  });
}
