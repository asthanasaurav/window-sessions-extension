const KEY_STORAGE = "autoSaveWindowKeys";

export async function getWindowKey(windowId) {
  const data = await chrome.storage.session.get(KEY_STORAGE);
  const keys = data[KEY_STORAGE] || {};
  return keys[windowId] || null;
}

export async function getOrCreateWindowKey(windowId) {
  const data = await chrome.storage.session.get(KEY_STORAGE);
  const keys = { ...(data[KEY_STORAGE] || {}) };
  if (keys[windowId]) {
    return keys[windowId];
  }
  const key = crypto.randomUUID();
  keys[windowId] = key;
  await chrome.storage.session.set({ [KEY_STORAGE]: keys });
  return key;
}

export async function removeWindowKey(windowId) {
  const data = await chrome.storage.session.get(KEY_STORAGE);
  const keys = { ...(data[KEY_STORAGE] || {}) };
  if (!keys[windowId]) {
    return;
  }
  delete keys[windowId];
  await chrome.storage.session.set({ [KEY_STORAGE]: keys });
}
