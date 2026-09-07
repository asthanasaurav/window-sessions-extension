import { appendTabToSession } from "./sessions.js";
import { getSettings, listManualSessions } from "./storage.js";

const MENU_ROOT = "ws-root";
const MENU_CHOOSE = "ws-choose";
const MENU_MOVE = "ws-move";
const MENU_EMPTY = "ws-empty";
const SESSION_PREFIX = "ws-session-";

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function openAddTabPicker(tabId, moveDefault = false) {
  const pageUrl = chrome.runtime.getURL(
    `add-tab-to-session/add-tab-to-session.html?tabId=${encodeURIComponent(String(tabId))}&move=${moveDefault ? "1" : "0"}`
  );
  return chrome.windows.create({
    url: pageUrl,
    type: "popup",
    width: 360,
    height: 420,
    focused: true,
  });
}

async function flashSuccessBadge() {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#137333" });
    await chrome.action.setBadgeText({ text: "+" });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" }).catch(() => undefined);
    }, 2000);
  } catch {
    // ignore
  }
}

export async function rebuildTabContextMenus() {
  await chrome.contextMenus.removeAll();

  const settings = await getSettings();
  if (!settings.tabContextMenuEnabled) {
    return;
  }

  const maxSessions = Math.max(1, settings.tabContextMenuMaxSessions ?? 12);
  const sessions = (await listManualSessions()).slice(0, maxSessions);

  chrome.contextMenus.create({
    id: MENU_ROOT,
    title: "Window Sessions",
    contexts: ["tab"],
  });

  if (!sessions.length) {
    chrome.contextMenus.create({
      id: MENU_EMPTY,
      parentId: MENU_ROOT,
      title: "No saved sessions yet",
      contexts: ["tab"],
      enabled: false,
    });
  } else {
    for (const session of sessions) {
      chrome.contextMenus.create({
        id: `${SESSION_PREFIX}${session.id}`,
        parentId: MENU_ROOT,
        title: truncate(`${session.name} (${session.tabs.length} tabs)`, 80),
        contexts: ["tab"],
      });
    }
  }

  chrome.contextMenus.create({
    id: MENU_CHOOSE,
    parentId: MENU_ROOT,
    title: "Choose session…",
    contexts: ["tab"],
  });

  chrome.contextMenus.create({
    id: MENU_MOVE,
    parentId: MENU_ROOT,
    title: "Add and close tab (move)",
    contexts: ["tab"],
  });
}

export function registerTabContextMenuListeners() {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id || !info.menuItemId?.startsWith("ws-")) {
      return;
    }

    const settings = await getSettings();

    try {
      if (info.menuItemId.startsWith(SESSION_PREFIX)) {
        const sessionId = info.menuItemId.slice(SESSION_PREFIX.length);
        const result = await appendTabToSession(sessionId, tab.id, {
          closeTab: false,
          dedupe: settings.tabContextMenuDedupeUrls,
        });
        await rebuildTabContextMenus();
        await flashSuccessBadge();
        return result;
      }

      if (info.menuItemId === MENU_CHOOSE) {
        await openAddTabPicker(tab.id, false);
        return;
      }

      if (info.menuItemId === MENU_MOVE) {
        await openAddTabPicker(tab.id, true);
        return;
      }
    } catch (error) {
      console.error("Window Sessions context menu:", error);
    }
  });

  chrome.runtime.onInstalled.addListener(() => {
    rebuildTabContextMenus().catch(() => undefined);
  });

  chrome.runtime.onStartup.addListener(() => {
    rebuildTabContextMenus().catch(() => undefined);
  });
}
