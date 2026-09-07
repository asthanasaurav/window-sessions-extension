function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Request failed"));
        return;
      }
      resolve(response.result);
    });
  });
}

const params = new URLSearchParams(window.location.search);
const tabId = Number(params.get("tabId"));
const moveDefault = params.get("move") === "1";

const subtitle = document.getElementById("subtitle");
const status = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const sessionList = document.getElementById("sessionList");
const closeTabInput = document.getElementById("closeTabInput");
const addBtn = document.getElementById("addBtn");

const state = {
  sessions: [],
  selectedSessionId: null,
  tabPreview: null,
};

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function getFilteredSessions() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return state.sessions;
  return state.sessions.filter((session) => session.name.toLowerCase().includes(query));
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function renderSessions() {
  const sessions = getFilteredSessions();
  sessionList.innerHTML = "";

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = state.sessions.length
      ? "No sessions match your search."
      : "No saved sessions yet. Save a window first.";
    sessionList.appendChild(empty);
    addBtn.disabled = true;
    return;
  }

  for (const session of sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-option";
    button.dataset.sessionId = session.id;
    if (session.id === state.selectedSessionId) {
      button.classList.add("selected");
    }
    button.innerHTML = `
      <strong>${escapeHtml(session.name)}</strong>
      <small>${session.tabs.length} tabs · Updated ${formatRelativeTime(session.updatedAt)}</small>
    `;
    button.addEventListener("click", () => {
      state.selectedSessionId = session.id;
      renderSessions();
      addBtn.disabled = false;
    });
    sessionList.appendChild(button);
  }

  if (state.selectedSessionId && !sessions.some((session) => session.id === state.selectedSessionId)) {
    state.selectedSessionId = null;
    addBtn.disabled = true;
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  if (!Number.isFinite(tabId)) {
    subtitle.textContent = "Could not detect the tab. Close this and try again.";
    addBtn.disabled = true;
    return;
  }

  closeTabInput.checked = moveDefault;

  try {
    const [sessions, preview] = await Promise.all([
      send("LIST_MANUAL_SESSIONS"),
      send("PREVIEW_TAB", { tabId }),
    ]);
    state.sessions = sessions;
    state.tabPreview = preview;
    subtitle.textContent = preview.title || preview.url || "Selected tab";
    renderSessions();
  } catch (error) {
    subtitle.textContent = error.message;
    addBtn.disabled = true;
  }
}

searchInput.addEventListener("input", renderSessions);

addBtn.addEventListener("click", async () => {
  if (!state.selectedSessionId) return;

  addBtn.disabled = true;
  setStatus("");
  try {
    const result = await send("APPEND_TAB_TO_SESSION", {
      sessionId: state.selectedSessionId,
      tabId,
      closeTab: closeTabInput.checked,
    });
    const action = result.closed ? "Moved" : "Added";
    const duplicate = result.duplicate ? " (already in session)" : "";
    setStatus(`${action} to “${result.session.name}”${duplicate}`);
    setTimeout(() => window.close(), 700);
  } catch (error) {
    setStatus(error.message, true);
    addBtn.disabled = false;
  }
});

document.getElementById("cancelBtn").addEventListener("click", () => window.close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});

init();
