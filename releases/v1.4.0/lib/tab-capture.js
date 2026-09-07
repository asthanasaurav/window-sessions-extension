import { isSavableUrl } from "./urls.js";

export function readTabUrl(tab) {
  const candidates = [tab?.url, tab?.pendingUrl].filter(
    (value) => typeof value === "string" && value.trim()
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed.startsWith("chrome://discards")) continue;
    if (trimmed === "about:blank") continue;
    if (trimmed === "chrome://newtab/") continue;
    return trimmed;
  }

  return "";
}

export function serializeLiveTab(tab) {
  const url = readTabUrl(tab);
  if (!isSavableUrl(url)) {
    return null;
  }

  return {
    url,
    title: tab.title || url || "Untitled",
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    discarded: Boolean(tab.discarded),
    index: typeof tab.index === "number" ? tab.index : 0,
    favIconUrl: tab.favIconUrl || "",
  };
}

export async function queryTabsForWindow(windowId) {
  const id = Number(windowId);
  if (!Number.isFinite(id)) {
    return [];
  }

  const tabs = await chrome.tabs.query({ windowId: id });
  const enriched = await Promise.all(
    tabs.map(async (tab) => {
      if (readTabUrl(tab)) {
        return tab;
      }
      try {
        const fresh = await chrome.tabs.get(tab.id);
        if (readTabUrl(fresh)) {
          return fresh;
        }
        // Some tabs need a moment before url is readable after discard/wake.
        await new Promise((resolve) => setTimeout(resolve, 150));
        return await chrome.tabs.get(tab.id);
      } catch {
        return tab;
      }
    })
  );
  return enriched.slice().sort((a, b) => a.index - b.index);
}

export function serializeTabsFromLive(tabs) {
  const serialized = [];
  const skipped = [];

  for (const tab of tabs) {
    const saved = serializeLiveTab(tab);
    if (saved) {
      serialized.push(saved);
    } else {
      skipped.push(tab);
    }
  }

  return { tabs: serialized, skipped };
}

export function normalizeStoredTab(tab) {
  if (!tab || typeof tab !== "object") return null;
  const url = typeof tab.url === "string" ? tab.url.trim() : "";
  if (!isSavableUrl(url)) return null;
  return {
    url,
    title: tab.title || url || "Untitled",
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    discarded: Boolean(tab.discarded),
    index: typeof tab.index === "number" ? tab.index : 0,
    favIconUrl: tab.favIconUrl || "",
  };
}

export function normalizeStoredTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs.map(normalizeStoredTab).filter(Boolean);
}
