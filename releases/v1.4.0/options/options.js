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

const status = document.getElementById("status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function loadSettings() {
  const [settings, sessions] = await Promise.all([
    send("GET_SETTINGS"),
    send("LIST_SESSIONS"),
  ]);

  document.getElementById("defaultRestoreTarget").value = settings.defaultRestoreTarget;
  document.getElementById("currentWindowMode").value = settings.currentWindowMode;
  document.getElementById("keepPinnedOnReplace").checked = settings.keepPinnedOnReplace;
  document.getElementById("skipUnrestorable").checked = settings.skipUnrestorable;
  document.getElementById("idleKeepPinned").checked = settings.idleKeepPinned;
  document.getElementById("idleKeepAudible").checked = settings.idleKeepAudible;
  document.getElementById("idleMinimizeWindow").checked = settings.idleMinimizeWindow;

  const tabCount = sessions.reduce((sum, session) => sum + session.tabs.length, 0);
  const bytes = new TextEncoder().encode(JSON.stringify(sessions)).length;
  const kb = (bytes / 1024).toFixed(1);
  document.getElementById("storageSummary").textContent =
    `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${tabCount} tabs · ${kb} KB`;
}

async function saveSettingsFromForm() {
  await send("UPDATE_SETTINGS", {
    settings: {
      defaultRestoreTarget: document.getElementById("defaultRestoreTarget").value,
      currentWindowMode: document.getElementById("currentWindowMode").value,
      keepPinnedOnReplace: document.getElementById("keepPinnedOnReplace").checked,
      skipUnrestorable: document.getElementById("skipUnrestorable").checked,
      idleKeepPinned: document.getElementById("idleKeepPinned").checked,
      idleKeepAudible: document.getElementById("idleKeepAudible").checked,
      idleMinimizeWindow: document.getElementById("idleMinimizeWindow").checked,
    },
  });
  setStatus("Settings saved.");
  await loadSettings();
}

document.getElementById("defaultRestoreTarget").addEventListener("change", saveSettingsFromForm);
document.getElementById("currentWindowMode").addEventListener("change", saveSettingsFromForm);
document.getElementById("keepPinnedOnReplace").addEventListener("change", saveSettingsFromForm);
document.getElementById("skipUnrestorable").addEventListener("change", saveSettingsFromForm);
document.getElementById("idleKeepPinned").addEventListener("change", saveSettingsFromForm);
document.getElementById("idleKeepAudible").addEventListener("change", saveSettingsFromForm);
document.getElementById("idleMinimizeWindow").addEventListener("change", saveSettingsFromForm);

document.getElementById("exportBtn").addEventListener("click", async () => {
  try {
    const json = await send("EXPORT_SESSIONS");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `window-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Exported sessions.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("importInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const count = await send("IMPORT_SESSIONS", { jsonText: text, mode: "merge" });
    setStatus(`Imported sessions. ${count} total.`);
    await loadSettings();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.value = "";
  }
});

loadSettings().catch((error) => setStatus(error.message, true));
