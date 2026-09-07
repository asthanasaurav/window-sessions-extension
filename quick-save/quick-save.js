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

function getWindowIdFromQuery() {
  const value = new URLSearchParams(window.location.search).get("windowId");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const subtitle = document.getElementById("subtitle");
const status = document.getElementById("status");
const form = document.getElementById("quickSaveForm");
const saveWindowId = getWindowIdFromQuery();

async function init() {
  if (!saveWindowId) {
    subtitle.textContent = "Could not detect the browser window. Close this and try again.";
    form.querySelector("button[type='submit']").disabled = true;
    return;
  }

  try {
    const preview = await send("PREVIEW_SAVE", { windowId: saveWindowId });
    subtitle.textContent = `${preview.tabCount} tabs will be saved from your browser window`;
  } catch (error) {
    subtitle.textContent = error.message;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!saveWindowId) return;

  status.textContent = "";
  status.classList.remove("error");
  try {
    const session = await send("SAVE_SESSION", {
      name: document.getElementById("nameInput").value,
      windowId: saveWindowId,
      updateExisting: document.getElementById("updateExistingInput").checked,
    });
    status.textContent = `Saved “${session.name}” (${session.tabs.length} tabs)`;
    setTimeout(() => window.close(), 700);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  }
});

document.getElementById("cancelBtn").addEventListener("click", () => window.close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});

init();
