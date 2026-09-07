import {
  deleteSession,
  exportSessions,
  getSettings,
  importSessions,
  listSessions,
  updateSettings,
} from "./lib/storage.js";
import {
  previewCurrentWindow,
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

registerIdleWindowListener();

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
    case "PREVIEW_SAVE":
      return previewCurrentWindow(message.windowId);
    case "GET_SETTINGS":
      return getSettings();
    case "UPDATE_SETTINGS":
      return updateSettings(message.settings || {});
    case "SAVE_SESSION":
      return saveSession({
        name: message.name,
        windowId: message.windowId,
        updateExisting: Boolean(message.updateExisting),
      });
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
      return { deleted: true };
    case "RENAME_SESSION":
      return renameSession(message.sessionId, message.name);
    case "UPDATE_SESSION_FROM_WINDOW":
      return updateSessionFromWindow(message.sessionId, message.windowId);
    case "EXPORT_SESSIONS":
      return exportSessions();
    case "IMPORT_SESSIONS":
      return importSessions(message.jsonText, message.mode);
    case "COLLECT_INACTIVE_TABS":
      return collectInactiveTabs();
    case "COUNT_INACTIVE_TABS":
      return countInactiveTabs();
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}
