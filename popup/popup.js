const state = {
  sessions: [],
  settings: null,
  filter: "",
  saveWindowId: null,
  restoreSessionId: null,
  detailSessionId: null,
  pendingSelectedIndexes: null,
};

async function getBrowserWindowId() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0]?.windowId ?? null;
}

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

function $(id) {
  return document.getElementById(id);
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
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function setFooter(message, isError = false) {
  const footer = $("footerStatus");
  footer.textContent = message || "";
  footer.classList.toggle("status-error", isError);
}

function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
}

function getFilteredSessions() {
  const query = state.filter.trim().toLowerCase();
  if (!query) return state.sessions;
  return state.sessions.filter((session) => {
    if (session.name.toLowerCase().includes(query)) return true;
    return (session.tabs || []).some((tab) => {
      const title = (tab.title || "").toLowerCase();
      const url = (tab.url || "").toLowerCase();
      return title.includes(query) || url.includes(query);
    });
  });
}

function partitionSessions(sessions) {
  return {
    manual: sessions.filter((session) => !session.isAutoSave),
    auto: sessions.filter((session) => session.isAutoSave),
  };
}

function createSessionCard(session) {
  const card = document.createElement("article");
  card.className = "session-card";
  if (session.isAutoSave) {
    card.classList.add("session-card-auto");
  }

  const main = document.createElement("div");
  main.addEventListener("click", () => openDetailDialog(session.id));

  const title = document.createElement("h3");
  title.textContent = session.name;
  if (session.isAutoSave) {
    const badge = document.createElement("span");
    badge.className = "auto-badge";
    badge.textContent = session.autoSaveType === "close" ? "On close" : "Interval";
    title.appendChild(badge);
  }
  main.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "session-meta";
  meta.textContent = `${session.tabs.length} tabs · Updated ${formatRelativeTime(session.updatedAt)}`;
  main.appendChild(meta);
  main.appendChild(renderFavicons(session.tabs));

  const actions = document.createElement("div");
  actions.className = "session-actions";

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "restore-btn";
  restoreBtn.textContent = "Restore";
  restoreBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openRestoreDialog(session.id);
  });

  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "menu-btn";
  menuBtn.textContent = "···";
  menuBtn.title = "More actions";
  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openDetailDialog(session.id);
  });

  actions.appendChild(restoreBtn);
  actions.appendChild(menuBtn);

  card.appendChild(main);
  card.appendChild(actions);
  return card;
}

function renderSessionSection(title, sessions, list) {
  if (!sessions.length) return;

  const heading = document.createElement("h2");
  heading.className = "session-section-title";
  heading.textContent = title;
  list.appendChild(heading);

  for (const session of sessions) {
    list.appendChild(createSessionCard(session));
  }
}

function renderFavicons(tabs) {
  const row = document.createElement("div");
  row.className = "favicon-row";
  const preview = tabs.slice(0, 5);
  for (const tab of preview) {
    if (tab.favIconUrl) {
      const img = document.createElement("img");
      img.className = "favicon";
      img.src = tab.favIconUrl;
      img.alt = "";
      row.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "favicon fallback";
      row.appendChild(span);
    }
  }
  if (tabs.length > preview.length) {
    const more = document.createElement("span");
    more.textContent = `+${tabs.length - preview.length}`;
    more.style.fontSize = "10px";
    more.style.color = "var(--muted)";
    row.appendChild(more);
  }
  return row;
}

function renderSessionList() {
  const list = $("sessionList");
  list.innerHTML = "";
  const sessions = getFilteredSessions();
  const { manual, auto } = partitionSessions(sessions);

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = state.sessions.length
      ? "<h2>No matches</h2><p>Try a different search term.</p>"
      : `<h2>No saved sessions</h2>
         <p>Save this window's tabs with a name. Restore them later in a new or existing window.</p>
         <button class="primary-btn" type="button" id="emptySaveBtn">Save current window</button>`;
    list.appendChild(empty);
    const emptyBtn = $("emptySaveBtn");
    if (emptyBtn) emptyBtn.addEventListener("click", openSaveDialog);
    return;
  }

  renderSessionSection(
    manual.length ? `Saved sessions (${manual.length})` : "",
    manual,
    list
  );
  renderSessionSection(
    auto.length ? `Auto-snapshots (${auto.length})` : "",
    auto,
    list
  );
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function refresh() {
  const [sessions, settings, inactiveCount] = await Promise.all([
    send("LIST_SESSIONS"),
    send("GET_SETTINGS"),
    send("COUNT_INACTIVE_TABS"),
  ]);
  state.sessions = sessions;
  state.settings = settings;
  const { manual, auto } = partitionSessions(sessions);
  const parts = [];
  if (manual.length) parts.push(`${manual.length} saved`);
  if (auto.length) parts.push(`${auto.length} auto`);
  $("headerMeta").textContent = parts.length ? parts.join(" · ") : "No sessions yet";
  renderSessionList();
  updateParkInactiveButton(inactiveCount);
}

function updateParkInactiveButton(count) {
  const button = $("parkInactiveBtn");
  if (!button) return;
  button.textContent = count ? `Park inactive tabs (${count})` : "Park inactive tabs";
  button.disabled = count === 0;
}

async function openSaveDialog() {
  state.saveWindowId = await getBrowserWindowId();
  if (!state.saveWindowId) {
    setFooter("Could not detect the current browser window.", true);
    return;
  }

  const preview = await send("PREVIEW_SAVE", { windowId: state.saveWindowId });
  $("saveNameInput").value = "";
  $("updateExistingInput").checked = false;
  $("saveSubtitle").textContent = `${preview.tabCount} tabs will be saved from this window`;
  $("saveDialog").showModal();
  $("saveNameInput").focus();
}

function syncCurrentWindowOptions() {
  const target = document.querySelector('input[name="restoreTarget"]:checked')?.value;
  $("currentWindowOptions").classList.toggle("hidden", target !== "current");
}

function applyRestoreDefaults() {
  const settings = state.settings || {};
  const targetNew = document.querySelector('input[name="restoreTarget"][value="new"]');
  const targetCurrent = document.querySelector('input[name="restoreTarget"][value="current"]');
  if (settings.defaultRestoreTarget === "current") {
    targetCurrent.checked = true;
  } else {
    targetNew.checked = true;
  }

  const append = settings.currentWindowMode !== "replace";
  $("appendTabsInput").checked = append;
  $("replaceTabsInput").checked = !append;
  syncCurrentWindowOptions();
}

async function openRestoreDialog(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  state.restoreSessionId = sessionId;
  state.pendingSelectedIndexes = null;
  $("restoreTitle").textContent = `Restore “${session.name}”`;
  $("restoreSubtitle").textContent = `${session.tabs.length} tabs · last saved ${formatRelativeTime(session.updatedAt)}`;
  applyRestoreDefaults();
  $("restoreDialog").showModal();
}

function getRestoreOptionsFromForm() {
  const target = document.querySelector('input[name="restoreTarget"]:checked')?.value || "new";
  let mode = "append";
  if (target === "current") {
    mode = $("replaceTabsInput").checked ? "replace" : "append";
  }
  return { target, mode };
}

async function restoreAndNotify(sessionId, options = {}) {
  const result = await send("RESTORE_SESSION", {
    sessionId,
    target: options.target,
    mode: options.mode,
    selectedIndexes: options.selectedIndexes,
    windowId: options.windowId ?? state.saveWindowId ?? (await getBrowserWindowId()),
  });
  const skipped = result.skippedCount ? ` · ${result.skippedCount} skipped` : "";
  setFooter(`Opened “${result.session.name}” (${result.restoredCount} tabs${skipped})`);
  return result;
}

function renderDetailTabs(session) {
  const list = $("detailTabList");
  list.innerHTML = "";
  session.tabs.forEach((tab, index) => {
    const row = document.createElement("label");
    row.className = "detail-tab";
    row.innerHTML = `
      <input type="checkbox" data-tab-index="${index}" checked />
      ${tab.favIconUrl ? `<img class="favicon" src="${escapeHtml(tab.favIconUrl)}" alt="" />` : '<span class="favicon fallback"></span>'}
      <span>
        <strong>${tab.pinned ? "[pinned] " : ""}${escapeHtml(tab.title || tab.url)}</strong>
        <small>${escapeHtml(tab.url)}</small>
      </span>
    `;
    list.appendChild(row);
  });
  $("detailSelectAllLabel").textContent = `Select all (${session.tabs.length})`;
  $("detailSelectAll").checked = true;
}

function getSelectedTabIndexes() {
  return [...document.querySelectorAll("#detailTabList input[type='checkbox']")]
    .map((input) => (input.checked ? Number(input.dataset.tabIndex) : null))
    .filter((value) => value !== null);
}

function openDetailDialog(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  state.detailSessionId = sessionId;
  $("detailTitle").textContent = session.name;
  const kind = session.isAutoSave
    ? session.autoSaveType === "close"
      ? "Auto-snapshot (on close)"
      : "Auto-snapshot (interval)"
    : "Saved session";
  $("detailMeta").textContent = `${kind} · ${session.tabs.length} tabs · Saved ${new Date(session.updatedAt).toLocaleString()}`;
  $("detailUpdateBtn").classList.toggle("hidden", Boolean(session.isAutoSave));
  renderDetailTabs(session);
  $("detailDialog").showModal();
}

async function init() {
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialogs());
  });

  $("saveBtn").addEventListener("click", openSaveDialog);
  $("parkInactiveBtn").addEventListener("click", async () => {
    const button = $("parkInactiveBtn");
    button.disabled = true;
    try {
      const result = await send("COLLECT_INACTIVE_TABS");
      setFooter(result.message);
      await refresh();
    } catch (error) {
      setFooter(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("openOptionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("searchInput").addEventListener("input", (event) => {
    state.filter = event.target.value;
    renderSessionList();
  });

  document.querySelectorAll('input[name="restoreTarget"]').forEach((input) => {
    input.addEventListener("change", syncCurrentWindowOptions);
  });

  $("replaceTabsInput").addEventListener("change", (event) => {
    if (event.target.checked) $("appendTabsInput").checked = false;
  });
  $("appendTabsInput").addEventListener("change", (event) => {
    if (event.target.checked) $("replaceTabsInput").checked = false;
  });

  $("saveForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.saveWindowId) {
      setFooter("Could not detect the current browser window.", true);
      return;
    }
    try {
      const session = await send("SAVE_SESSION", {
        name: $("saveNameInput").value,
        windowId: state.saveWindowId,
        updateExisting: $("updateExistingInput").checked,
      });
      closeDialogs();
      await refresh();
      setFooter(`Saved “${session.name}” (${session.tabs.length} tabs)`);
    } catch (error) {
      setFooter(error.message, true);
    }
  });

  $("restoreForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const options = getRestoreOptionsFromForm();
      await restoreAndNotify(state.restoreSessionId, {
        ...options,
        selectedIndexes: state.pendingSelectedIndexes,
      });
      state.pendingSelectedIndexes = null;
      closeDialogs();
    } catch (error) {
      setFooter(error.message, true);
    }
  });

  $("detailRestoreBtn").addEventListener("click", async () => {
    await openRestoreDialog(state.detailSessionId);
  });

  $("detailRestoreSelectedBtn").addEventListener("click", async () => {
    const selectedIndexes = getSelectedTabIndexes();
    if (!selectedIndexes.length) {
      setFooter("Select at least one tab to restore.", true);
      return;
    }
    state.restoreSessionId = state.detailSessionId;
    state.pendingSelectedIndexes = selectedIndexes;
    closeDialogs();
    openRestoreDialog(state.detailSessionId);
  });

  $("detailSelectAll").addEventListener("change", (event) => {
    const checked = event.target.checked;
    document.querySelectorAll("#detailTabList input[type='checkbox']").forEach((input) => {
      input.checked = checked;
    });
  });

  $("detailUpdateBtn").addEventListener("click", async () => {
    const windowId = await getBrowserWindowId();
    if (!windowId) {
      setFooter("Could not detect the current browser window.", true);
      return;
    }
    try {
      const session = await send("UPDATE_SESSION_FROM_WINDOW", {
        sessionId: state.detailSessionId,
        windowId,
      });
      closeDialogs();
      await refresh();
      setFooter(`Updated “${session.name}” (${session.tabs.length} tabs)`);
    } catch (error) {
      setFooter(error.message, true);
    }
  });

  $("detailDeleteBtn").addEventListener("click", async () => {
    const session = state.sessions.find((item) => item.id === state.detailSessionId);
    if (!session) return;
    if (!confirm(`Delete session “${session.name}”?`)) return;
    try {
      await send("DELETE_SESSION", { sessionId: state.detailSessionId });
      closeDialogs();
      await refresh();
      setFooter(`Deleted “${session.name}”`);
    } catch (error) {
      setFooter(error.message, true);
    }
  });

  try {
    await refresh();
  } catch (error) {
    setFooter(error.message, true);
  }
}

init();
