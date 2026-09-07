import {
  deleteSession,
  findSessionByName,
  getSession,
  getSettings,
  upsertSession,
} from "./storage.js";
import { filterRestorableTabs } from "./urls.js";
import { openSleepingTabsInNewWindow, appendSleepingTabs } from "./lazy-tabs.js";
import {
  normalizeStoredTabs,
  queryTabsForWindow,
  serializeLiveTab,
  serializeTabsFromLive,
} from "./tab-capture.js";

function newId() {
  return crypto.randomUUID();
}

export async function getCurrentBrowserWindowId() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (activeTab?.windowId) {
    return activeTab.windowId;
  }

  const focused = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  if (focused?.id) {
    return focused.id;
  }

  throw new Error("Could not find the current browser window.");
}

async function resolveWindowId(windowId) {
  if (windowId !== undefined && windowId !== null && windowId !== "") {
    return Number(windowId);
  }
  return getCurrentBrowserWindowId();
}

function serializeWindow(window) {
  return {
    state: window.state || "normal",
    width: window.width,
    height: window.height,
    left: window.left,
    top: window.top,
    focused: Boolean(window.focused),
    incognito: Boolean(window.incognito),
  };
}

export async function previewCurrentWindow(windowId) {
  const numericId = await resolveWindowId(windowId);
  const window = await chrome.windows.get(numericId);
  if (window.incognito) {
    throw new Error("Saving incognito windows is not supported.");
  }

  const liveTabs = await queryTabsForWindow(numericId);
  const { tabs, skipped } = serializeTabsFromLive(liveTabs);

  return {
    windowId: numericId,
    tabCount: tabs.length,
    liveTabCount: liveTabs.length,
    skippedCount: skipped.length,
    activeTab: liveTabs.find((tab) => tab.active)?.title || "Untitled",
  };
}

export async function captureWindow(windowId) {
  const numericId = await resolveWindowId(windowId);

  let window;
  try {
    window = await chrome.windows.get(numericId);
  } catch {
    throw new Error("The current browser window is no longer open.");
  }

  if (window.incognito) {
    throw new Error("Saving incognito windows is not supported.");
  }

  const liveTabs = await queryTabsForWindow(numericId);
  const { tabs, skipped } = serializeTabsFromLive(liveTabs);

  return {
    tabs,
    skippedCount: skipped.length,
    liveTabCount: liveTabs.length,
    window: serializeWindow(window),
  };
}

function assertCapturedTabs(captured) {
  if (!captured.tabs.length) {
    const live = captured.liveTabCount ?? 0;
    const skipped = captured.skippedCount ?? 0;
    if (live > 0) {
      throw new Error(
        `Found ${live} tabs in this window, but ${skipped} could not be saved. Only internal Chrome pages are skipped.`
      );
    }
    throw new Error("This window has no tabs to save.");
  }
}

export async function saveSession({ name, windowId, updateExisting = false }) {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new Error("Session name is required.");
  }

  const captured = await captureWindow(windowId);
  assertCapturedTabs(captured);

  const now = Date.now();
  let session = updateExisting ? await findSessionByName(trimmed) : null;

  const payload = {
    name: trimmed,
    tabs: captured.tabs,
    window: captured.window,
    updatedAt: now,
  };

  if (session) {
    session = { ...session, ...payload, isAutoSave: false };
  } else {
    session = {
      id: newId(),
      createdAt: now,
      isAutoSave: false,
      ...payload,
    };
  }

  await upsertSession(session);
  return session;
}

function pickTabs(session, selectedIndexes) {
  const tabs = normalizeStoredTabs(session.tabs);
  if (!selectedIndexes?.length) {
    return tabs;
  }
  const indexSet = new Set(selectedIndexes);
  return tabs.filter((_, index) => indexSet.has(index));
}

function buildNewWindowOptions(session) {
  const saved = session.window || {};
  const options = { focused: false };
  const layoutState = saved.state;

  if (layoutState === "maximized" || layoutState === "fullscreen") {
    options.state = layoutState;
    return options;
  }

  const hasBounds =
    Number.isFinite(saved.left) &&
    Number.isFinite(saved.top) &&
    Number.isFinite(saved.width) &&
    Number.isFinite(saved.height);

  if (hasBounds) {
    options.left = saved.left;
    options.top = saved.top;
    options.width = saved.width;
    options.height = saved.height;
    options.state = "normal";
    return options;
  }

  options.state = "normal";
  return options;
}

function getActiveIndex(tabs) {
  const index = tabs.findIndex((tab) => tab.active);
  return index >= 0 ? index : 0;
}

function toTabSpecs(tabs) {
  return tabs.map((tab) => ({
    url: tab.url,
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
  }));
}

export async function restoreSession({
  sessionId,
  target = "new",
  mode = "append",
  selectedIndexes,
  windowId,
}) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const settings = await getSettings();
  const storedTabs = normalizeStoredTabs(session.tabs);

  if (!storedTabs.length) {
    throw new Error(
      "This session has no saved tabs. Save the current window again after reloading the extension."
    );
  }

  let tabs = pickTabs({ ...session, tabs: storedTabs }, selectedIndexes);
  let skipped = [];

  if (settings.skipUnrestorable) {
    const filtered = filterRestorableTabs(tabs);
    tabs = filtered.restorable;
    skipped = filtered.skipped;
  }

  if (!tabs.length) {
    throw new Error(
      `No restorable tabs (${storedTabs.length} saved, ${skipped.length || storedTabs.length} skipped).`
    );
  }

  const tabSpecs = toTabSpecs(tabs);
  const activeIndex = getActiveIndex(tabs);

  if (target === "new") {
    const { window: created } = await openSleepingTabsInNewWindow(
      tabSpecs,
      activeIndex,
      session,
      buildNewWindowOptions
    );

    return {
      session,
      restoredCount: tabs.length,
      skippedCount: skipped.length,
      windowId: created.id,
    };
  }

  const currentWindowId = await resolveWindowId(windowId);
  const existingTabs = await chrome.tabs.query({ windowId: currentWindowId });

  if (mode === "replace") {
    const keepPinned = settings.keepPinnedOnReplace;
    await appendSleepingTabs(currentWindowId, tabSpecs, activeIndex);
    const toClose = existingTabs
      .filter((tab) => !(keepPinned && tab.pinned))
      .map((tab) => tab.id);
    if (toClose.length) {
      await chrome.tabs.remove(toClose);
    }

    return {
      session,
      restoredCount: tabs.length,
      skippedCount: skipped.length,
      windowId: currentWindowId,
    };
  }

  await appendSleepingTabs(currentWindowId, tabSpecs, activeIndex);

  return {
    session,
    restoredCount: tabs.length,
    skippedCount: skipped.length,
    windowId: currentWindowId,
  };
}

export async function updateSessionFromWindow(sessionId, windowId) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const captured = await captureWindow(windowId);
  assertCapturedTabs(captured);

  const updated = {
    ...session,
    tabs: captured.tabs,
    window: captured.window,
    updatedAt: Date.now(),
  };
  await upsertSession(updated);
  return updated;
}

export async function renameSession(sessionId, name) {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new Error("Session name is required.");
  }
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }
  const updated = { ...session, name: trimmed, updatedAt: Date.now() };
  await upsertSession(updated);
  return updated;
}

export async function previewTab(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error("Tab is no longer available.");
  }

  const serialized = serializeLiveTab(tab);
  if (!serialized) {
    throw new Error("This tab cannot be saved.");
  }

  return {
    tabId,
    title: serialized.title,
    url: serialized.url,
  };
}

export { deleteSession };

export async function appendTabToSession(sessionId, tabId, options = {}) {
  const { closeTab = false, dedupe = true } = options;
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }
  if (session.isAutoSave) {
    throw new Error("Cannot add tabs to auto-snapshots. Pick a saved session.");
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error("Tab is no longer available.");
  }

  let window;
  try {
    window = await chrome.windows.get(tab.windowId);
  } catch {
    throw new Error("Could not read the tab's window.");
  }
  if (window.incognito) {
    throw new Error("Cannot add tabs from incognito windows.");
  }

  const serialized = serializeLiveTab(tab);
  if (!serialized) {
    throw new Error("This tab cannot be saved (internal Chrome page or blank tab).");
  }

  let tabs = normalizeStoredTabs(session.tabs);
  const alreadySaved = tabs.some((entry) => entry.url === serialized.url);
  if (dedupe && alreadySaved) {
    if (closeTab) {
      await chrome.tabs.remove(tabId);
    }
    return {
      session,
      duplicate: true,
      closed: closeTab,
      tabTitle: serialized.title,
    };
  }

  tabs.push({
    ...serialized,
    active: false,
    index: tabs.length,
  });

  const updated = {
    ...session,
    tabs,
    updatedAt: Date.now(),
    isAutoSave: false,
  };
  await upsertSession(updated);

  if (closeTab) {
    await chrome.tabs.remove(tabId);
  }

  return {
    session: updated,
    duplicate: false,
    closed: closeTab,
    tabTitle: serialized.title,
  };
}
