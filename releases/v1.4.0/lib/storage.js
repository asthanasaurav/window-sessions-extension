import { normalizeStoredTabs } from "./tab-capture.js";

const STORAGE_KEY = "windowSessionsData";

const DEFAULT_SETTINGS = {
  defaultRestoreTarget: "new",
  currentWindowMode: "append",
  keepPinnedOnReplace: true,
  skipUnrestorable: true,
  idleKeepPinned: true,
  idleKeepAudible: true,
  idleMinimizeWindow: true,
};

const DEFAULT_DATA = {
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
};

export async function loadData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];
  if (!stored || typeof stored !== "object") {
    return structuredClone(DEFAULT_DATA);
  }
  return {
    sessions: Array.isArray(stored.sessions) ? stored.sessions : [],
    settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) },
  };
}

export async function saveData(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function getSettings() {
  const data = await loadData();
  return data.settings;
}

export async function updateSettings(partial) {
  const data = await loadData();
  data.settings = { ...data.settings, ...partial };
  await saveData(data);
  return data.settings;
}

export async function listSessions() {
  const data = await loadData();
  return data.sessions
    .map((session) => ({
      ...session,
      tabs: normalizeStoredTabs(session.tabs),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(sessionId) {
  const sessions = await listSessions();
  return sessions.find((session) => session.id === sessionId) || null;
}

export async function upsertSession(session) {
  const data = await loadData();
  const index = data.sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) {
    data.sessions[index] = session;
  } else {
    data.sessions.push(session);
  }
  await saveData(data);
  return session;
}

export async function deleteSession(sessionId) {
  const data = await loadData();
  data.sessions = data.sessions.filter((session) => session.id !== sessionId);
  await saveData(data);
}

export async function findSessionByName(name) {
  const normalized = name.trim().toLowerCase();
  const sessions = await listSessions();
  return sessions.find((session) => session.name.trim().toLowerCase() === normalized) || null;
}

export async function exportSessions() {
  const data = await loadData();
  return JSON.stringify(data, null, 2);
}

export async function importSessions(jsonText, mode = "merge") {
  const parsed = JSON.parse(jsonText);
  if (!parsed || !Array.isArray(parsed.sessions)) {
    throw new Error("Invalid session export file.");
  }

  const data = await loadData();
  if (mode === "replace") {
    data.sessions = parsed.sessions;
    data.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
  } else {
    const byId = new Map(data.sessions.map((session) => [session.id, session]));
    for (const session of parsed.sessions) {
      byId.set(session.id, session);
    }
    data.sessions = [...byId.values()];
  }
  await saveData(data);
  return data.sessions.length;
}

export function getStorageSummary(sessions) {
  const tabCount = sessions.reduce((sum, session) => sum + (session.tabs?.length || 0), 0);
  const bytes = new TextEncoder().encode(JSON.stringify(sessions)).length;
  return { sessionCount: sessions.length, tabCount, bytes };
}
