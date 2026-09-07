/**
 * Restore tabs by opening real URLs. No discard — discarded tabs show as blank.
 */

async function createTab(windowId, spec, active = false) {
  const created = await chrome.tabs.create({
    windowId,
    url: spec.url,
    active,
    pinned: spec.pinned || undefined,
  });
  return created.id;
}

export async function appendSleepingTabs(windowId, tabSpecs, activeIndex = 0) {
  if (!tabSpecs.length) {
    return { createdIds: [] };
  }

  const createdIds = [];
  const safeActiveIndex = Math.min(Math.max(0, activeIndex), tabSpecs.length - 1);

  for (let i = 0; i < tabSpecs.length; i += 1) {
    createdIds.push(await createTab(windowId, tabSpecs[i], i === safeActiveIndex));
  }

  return { createdIds };
}

export async function openSleepingTabsInNewWindow(tabSpecs, activeIndex, session, buildWindowOptions) {
  if (!tabSpecs.length) {
    throw new Error("No tabs to restore.");
  }

  const windowOptions = buildWindowOptions(session);
  const [firstSpec, ...restSpecs] = tabSpecs;
  const safeActiveIndex = Math.min(Math.max(0, activeIndex), tabSpecs.length - 1);
  let createdWindow;

  try {
    createdWindow = await chrome.windows.create({
      ...windowOptions,
      url: firstSpec.url,
      focused: false,
    });
  } catch {
    createdWindow = await chrome.windows.create({
      url: firstSpec.url,
      focused: false,
      state: "normal",
    });
  }

  const createdIds = [];
  const initialTabs = await chrome.tabs.query({ windowId: createdWindow.id });
  const firstTab = initialTabs[0];

  if (firstTab?.id) {
    if (firstSpec.pinned) {
      await chrome.tabs.update(firstTab.id, { pinned: true });
    }
    createdIds.push(firstTab.id);
  }

  for (const spec of restSpecs) {
    createdIds.push(await createTab(createdWindow.id, spec, false));
  }

  if (createdIds.length) {
    const activeId = createdIds[safeActiveIndex];
    await chrome.tabs.update(activeId, { active: true });
  }

  await chrome.windows.update(createdWindow.id, { focused: true });
  return { window: createdWindow, createdIds };
}
