import { captureWindow } from "./sessions.js";
import { getSettings, loadData, saveData } from "./storage.js";
import { getOrCreateWindowKey, getWindowKey, removeWindowKey } from "./window-keys.js";
import { clearCachedWindow, getCachedWindow, refreshWindowCache, warmWindowCaches } from "./window-cache.js";

const PENDING_CLOSE_KEY = "pendingCloseSave";
const handledCloseWindows = new Set();

function newId() {
  return crypto.randomUUID();
}

function formatAutoSaveName(autoSaveType, tabCount) {
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const label = autoSaveType === "close" ? "On close" : "Auto";
  return `${label} · ${tabCount} tabs · ${stamp}`;
}

export function pruneAutoSnapshots(sessions, autoWindowKey, autoSaveType, maxCount) {
  const matching = sessions
    .filter(
      (session) =>
        session.isAutoSave &&
        session.autoSaveType === autoSaveType &&
        session.autoWindowKey === autoWindowKey
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const keepIds = new Set(matching.slice(0, maxCount).map((session) => session.id));
  return sessions.filter((session) => {
    if (
      session.isAutoSave &&
      session.autoSaveType === autoSaveType &&
      session.autoWindowKey === autoWindowKey &&
      !keepIds.has(session.id)
    ) {
      return false;
    }
    return true;
  });
}

export async function saveAutoSnapshotFromCapture(captured, { autoSaveType, autoWindowKey }) {
  if (!captured?.tabs?.length) {
    return null;
  }

  const settings = await getSettings();
  const now = Date.now();
  const session = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    name: formatAutoSaveName(autoSaveType, captured.tabs.length),
    tabs: captured.tabs,
    window: captured.window,
    isAutoSave: true,
    autoSaveType,
    autoWindowKey,
  };

  const data = await loadData();
  data.sessions.push(session);

  if (autoSaveType === "interval") {
    const max = settings.autoSaveIntervalMaxSnapshots ?? 5;
    data.sessions = pruneAutoSnapshots(data.sessions, autoWindowKey, "interval", max);
  } else {
    const max = settings.autoSaveOnCloseMaxSnapshots ?? 5;
    data.sessions = pruneAutoSnapshots(data.sessions, autoWindowKey, "close", max);
  }

  await saveData(data);
  return session;
}

export async function saveAutoSnapshotForWindow(windowId, autoSaveType) {
  const windowKey = await getOrCreateWindowKey(windowId);
  let captured = await getCachedWindow(windowId);

  if (!captured?.tabs?.length) {
    try {
      const live = await captureWindow(windowId);
      captured = {
        tabs: live.tabs,
        window: live.window,
        skippedCount: live.skippedCount,
        liveTabCount: live.liveTabCount,
      };
    } catch {
      return null;
    }
  }

  return saveAutoSnapshotFromCapture(captured, {
    autoSaveType,
    autoWindowKey: windowKey,
  });
}

export async function runIntervalAutoSave() {
  const settings = await getSettings();
  if (!settings.autoSaveIntervalEnabled) {
    return { saved: 0 };
  }

  await warmWindowCaches();
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  let saved = 0;

  for (const window of windows) {
    if (window.incognito) continue;
    const session = await saveAutoSnapshotForWindow(window.id, "interval");
    if (session) saved += 1;
  }

  return { saved };
}

async function openClosePrompt(captured, windowKey) {
  await chrome.storage.session.set({
    [PENDING_CLOSE_KEY]: {
      captured,
      windowKey,
      createdAt: Date.now(),
    },
  });

  const promptUrl = chrome.runtime.getURL("close-prompt/close-prompt.html");

  try {
    await chrome.windows.create({
      url: promptUrl,
      type: "popup",
      width: 420,
      height: 240,
      focused: true,
    });
  } catch {
    await chrome.windows.create({
      url: promptUrl,
      type: "normal",
      width: 420,
      height: 240,
      focused: true,
    });
  }
}

async function resolveCapturedWindow(windowId) {
  let captured = await getCachedWindow(windowId);
  if (captured?.tabs?.length) {
    return captured;
  }

  try {
    const live = await captureWindow(windowId);
    if (live.tabs.length) {
      return {
        tabs: live.tabs,
        window: live.window,
        skippedCount: live.skippedCount,
        liveTabCount: live.liveTabCount,
      };
    }
  } catch {
    // Window may already be gone.
  }

  try {
    captured = await refreshWindowCache(windowId);
    if (captured?.tabs?.length) {
      return captured;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function handleWindowClosed(windowId) {
  if (handledCloseWindows.has(windowId)) {
    return null;
  }
  handledCloseWindows.add(windowId);
  setTimeout(() => handledCloseWindows.delete(windowId), 10000);

  const settings = await getSettings();
  if (!settings.autoSaveOnCloseEnabled) {
    await clearCachedWindow(windowId);
    await removeWindowKey(windowId);
    return null;
  }

  const windowKey = (await getWindowKey(windowId)) || (await getOrCreateWindowKey(windowId));
  const captured = await resolveCapturedWindow(windowId);
  await clearCachedWindow(windowId);
  await removeWindowKey(windowId);

  if (!captured?.tabs?.length) {
    return null;
  }

  if (settings.autoSaveOnCloseMode === "prompt") {
    await openClosePrompt(captured, windowKey);
    return { prompted: true };
  }

  const session = await saveAutoSnapshotFromCapture(captured, {
    autoSaveType: "close",
    autoWindowKey: windowKey,
  });
  return { session };
}

export async function confirmPendingCloseSave() {
  const data = await chrome.storage.session.get(PENDING_CLOSE_KEY);
  const pending = data[PENDING_CLOSE_KEY];
  if (!pending?.captured || !pending.windowKey) {
    throw new Error("No pending window save.");
  }

  const session = await saveAutoSnapshotFromCapture(pending.captured, {
    autoSaveType: "close",
    autoWindowKey: pending.windowKey,
  });
  await chrome.storage.session.remove(PENDING_CLOSE_KEY);
  return session;
}

export async function dismissPendingCloseSave() {
  await chrome.storage.session.remove(PENDING_CLOSE_KEY);
  return { dismissed: true };
}

export async function getPendingCloseSave() {
  const data = await chrome.storage.session.get(PENDING_CLOSE_KEY);
  return data[PENDING_CLOSE_KEY] || null;
}

export async function syncAutoSaveAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear("auto-save-interval");

  if (!settings.autoSaveIntervalEnabled) {
    return;
  }

  const minutes = Math.max(1, settings.autoSaveIntervalMinutes || 15);
  await chrome.alarms.create("auto-save-interval", {
    periodInMinutes: minutes,
  });
}

export function registerAutoSaveListeners() {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "auto-save-interval") {
      await runIntervalAutoSave();
    }
  });

  // Fires while tabs still exist — more reliable than windows.onRemoved alone.
  chrome.tabs.onRemoved.addListener(async (_tabId, removeInfo) => {
    if (!removeInfo.isWindowClosing || removeInfo.windowId === undefined) {
      return;
    }
    try {
      await handleWindowClosed(removeInfo.windowId);
    } catch {
      await clearCachedWindow(removeInfo.windowId);
      await removeWindowKey(removeInfo.windowId);
    }
  });

  chrome.windows.onRemoved.addListener(async (windowId) => {
    try {
      await handleWindowClosed(windowId);
    } catch {
      await clearCachedWindow(windowId);
      await removeWindowKey(windowId);
    }
  });

  chrome.runtime.onInstalled.addListener(() => {
    syncAutoSaveAlarm().catch(() => undefined);
    warmWindowCaches().catch(() => undefined);
  });

  chrome.runtime.onStartup.addListener(() => {
    syncAutoSaveAlarm().catch(() => undefined);
    warmWindowCaches().catch(() => undefined);
  });
}
