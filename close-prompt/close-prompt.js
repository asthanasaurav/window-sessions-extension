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

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function init() {
  try {
    const pending = await send("GET_PENDING_CLOSE_SAVE");
    if (!pending?.captured?.tabs?.length) {
      setStatus("Nothing to save.", true);
      setTimeout(() => window.close(), 1200);
      return;
    }

    document.getElementById("summary").textContent =
      `Save ${pending.captured.tabs.length} tabs from the window you just closed?`;

    document.getElementById("skipBtn").addEventListener("click", async () => {
      await send("DISMISS_PENDING_CLOSE_SAVE");
      window.close();
    });

    document.getElementById("saveBtn").addEventListener("click", async () => {
      const button = document.getElementById("saveBtn");
      button.disabled = true;
      try {
        const session = await send("CONFIRM_PENDING_CLOSE_SAVE");
        setStatus(`Saved “${session.name}”.`);
        setTimeout(() => window.close(), 800);
      } catch (error) {
        setStatus(error.message, true);
        button.disabled = false;
      }
    });
  } catch (error) {
    setStatus(error.message, true);
  }
}

init();
