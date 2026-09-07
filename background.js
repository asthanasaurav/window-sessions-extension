import {
  deleteSession,
  exportSessions,
  getSettings,
  importSessions,
  listManualSessions,
  listSessions,
  updateSettings,
} from "./lib/storage.js";
import {
  appendTabToSession,
  previewCurrentWindow,
  previewTab,
  renameSession,
  restoreSession,
  saveSession,
  updateSessionFromWindow,
} from "./lib/sessions.js";
import {
  collectInactiveTabs,
  countInactiveTabs,
  registerIdleWindowListener,
} from "./lib/idle-tabs.js";
import {
  confirmPendingCloseSave,
  dismissPendingCloseSave,
  getPendingCloseSave,
  registerAutoSaveListeners,
  syncAutoSaveAlarm,
} from "./lib/auto-save.js";
import { registerWindowCacheListeners, warmWindowCaches } from "./lib/window-cache.js";
import {
  rebuildTabContextMenus,
  registerTabContextMenuListeners,
} from "./lib/context-menus.js";

registerIdleWindowListener();
registerWindowCacheListeners();
registerAutoSaveListeners();
registerTabContextMenuListeners();
syncAutoSaveAlarm().catch(() => undefined);
warmWindowCaches().catch(() => undefined);
rebuildTabContextMenus().catch(() => undefined);

async function afterSessionsChanged() {
  await rebuildTabContextMenus();
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "quick-save") {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const windowId = tab?.windowId ?? "";
    const pageUrl = chrome.runtime.getURL(
      `quick-save/quick-save.html?windowId=${encodeURIComponent(String(windowId))}`
    );
    await chrome.windows.create({
      url: pageUrl,
      type: "popup",
      width: 360,
      height: 280,
      focused: true,
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "LIST_SESSIONS":
      return listSessions();
    case "LIST_MANUAL_SESSIONS":
      return listManualSessions();
    case "PREVIEW_SAVE":
      return previewCurrentWindow(message.windowId);
    case "PREVIEW_TAB":
      return previewTab(message.tabId);
    case "GET_SETTINGS":
      return getSettings();
    case "UPDATE_SETTINGS": {
      const settings = await updateSettings(message.settings || {});
      await syncAutoSaveAlarm();
      if (settings.autoSaveOnCloseEnabled || settings.autoSaveIntervalEnabled) {
        await warmWindowCaches();
      }
      await rebuildTabContextMenus();
      return settings;
    }
    case "SAVE_SESSION": {
      const session = await saveSession({
        name: message.name,
        windowId: message.windowId,
        updateExisting: Boolean(message.updateExisting),
      });
      await afterSessionsChanged();
      return session;
    }
    case "APPEND_TAB_TO_SESSION": {
      const settings = await getSettings();
      const result = await appendTabToSession(message.sessionId, message.tabId, {
        closeTab: Boolean(message.closeTab),
        dedupe: settings.tabContextMenuDedupeUrls,
      });
      await afterSessionsChanged();
      return result;
    }
    case "RESTORE_SESSION":
      return restoreSession({
        sessionId: message.sessionId,
        target: message.target,
        mode: message.mode,
        selectedIndexes: message.selectedIndexes,
        windowId: message.windowId,
      });
    case "DELETE_SESSION":
      await deleteSession(message.sessionId);
      await afterSessionsChanged();
      return { deleted: true };
    case "RENAME_SESSION": {
      const session = await renameSession(message.sessionId, message.name);
      await afterSessionsChanged();
      return session;
    }
    case "UPDATE_SESSION_FROM_WINDOW": {
      const session = await updateSessionFromWindow(message.sessionId, message.windowId);
      await afterSessionsChanged();
      return session;
    }
    case "EXPORT_SESSIONS":
      return exportSessions();
    case "IMPORT_SESSIONS": {
      const count = await importSessions(message.jsonText, message.mode);
      await afterSessionsChanged();
      return count;
    }
    case "COLLECT_INACTIVE_TABS":
      return collectInactiveTabs();
    case "COUNT_INACTIVE_TABS":
      return countInactiveTabs();
    case "GET_PENDING_CLOSE_SAVE":
      return getPendingCloseSave();
    case "CONFIRM_PENDING_CLOSE_SAVE": {
      const session = await confirmPendingCloseSave();
      await afterSessionsChanged();
      return session;
    }
    case "DISMISS_PENDING_CLOSE_SAVE":
      return dismissPendingCloseSave();
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}
