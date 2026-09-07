const BLOCKED_PREFIXES = [
  "chrome://settings",
  "chrome://extensions",
  "chrome://version",
  "chrome-devtools://",
  "devtools://",
  "edge://",
  "brave://",
  "chrome://discards",
];

const BLOCKED_EXACT = new Set([
  "about:blank",
  "about:blank/",
  "chrome://newtab/",
  "chrome://newtab",
]);

export function isSavableUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (BLOCKED_EXACT.has(lower)) return false;
  return !BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function isRestorableUrl(url) {
  return isSavableUrl(url);
}

export function filterRestorableTabs(tabs) {
  const restorable = [];
  const skipped = [];
  for (const tab of tabs) {
    const url = typeof tab?.url === "string" ? tab.url.trim() : "";
    if (isRestorableUrl(url)) {
      restorable.push({ ...tab, url });
    } else {
      skipped.push(tab);
    }
  }
  return { restorable, skipped };
}
