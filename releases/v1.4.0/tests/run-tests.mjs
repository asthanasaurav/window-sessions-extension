import assert from "node:assert/strict";
import { readTabUrl, serializeLiveTab, normalizeStoredTabs } from "../lib/tab-capture.js";
import { isSavableUrl, isRestorableUrl, filterRestorableTabs } from "../lib/urls.js";

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(` FAIL ${name}`);
    throw error;
  }
}

console.log("urls");
test("accepts https pages", () => {
  assert.equal(isSavableUrl("https://docs.google.com/x"), true);
  assert.equal(isRestorableUrl("https://github.com/a/b"), true);
});
test("rejects chrome newtab and about blank", () => {
  assert.equal(isSavableUrl("chrome://newtab/"), false);
  assert.equal(isSavableUrl("about:blank"), false);
});
test("rejects chrome settings and devtools", () => {
  assert.equal(isSavableUrl("chrome://settings/"), false);
  assert.equal(isSavableUrl("chrome-devtools://devtools/"), false);
});

console.log("readTabUrl");
test("uses tab.url first", () => {
  assert.equal(readTabUrl({ url: "https://example.com" }), "https://example.com");
});
test("falls back to pendingUrl", () => {
  assert.equal(readTabUrl({ url: "", pendingUrl: "https://pending.example" }), "https://pending.example");
});
test("skips discards placeholder", () => {
  assert.equal(readTabUrl({ url: "chrome://discards/" }), "");
});

console.log("serializeLiveTab");
test("serializes active and inactive https tabs", () => {
  const active = serializeLiveTab({ id: 1, url: "https://a.com", title: "A", active: true, index: 0 });
  const inactive = serializeLiveTab({ id: 2, url: "https://b.com", title: "B", active: false, discarded: true, index: 1 });
  assert.ok(active);
  assert.ok(inactive);
  assert.equal(active.active, true);
  assert.equal(inactive.active, false);
  assert.equal(inactive.discarded, true);
});
test("skips chrome settings tabs", () => {
  assert.equal(serializeLiveTab({ url: "chrome://settings/" }), null);
});

console.log("normalizeStoredTabs");
test("keeps saved session tabs with urls", () => {
  const tabs = normalizeStoredTabs([
    { url: "https://x.com", title: "X", active: false },
    { url: "https://y.com", title: "Y", active: true },
    { url: "" },
  ]);
  assert.equal(tabs.length, 2);
  assert.equal(tabs[1].active, true);
});

console.log("filterRestorableTabs");
test("restore path keeps normal saved tabs", () => {
  const { restorable, skipped } = filterRestorableTabs([
    { url: "https://one.test" },
    { url: "https://two.test" },
    { url: "chrome://settings/" },
  ]);
  assert.equal(restorable.length, 2);
  assert.equal(skipped.length, 1);
});

console.log("windowId coercion");
test("number and string window ids match", () => {
  const tabs = [
    { windowId: 42, url: "https://a.com" },
    { windowId: 42, url: "https://b.com" },
  ];
  const id = Number("42");
  const filtered = tabs.filter((tab) => tab.windowId === id);
  assert.equal(filtered.length, 2);
});

console.log("\nAll tests passed.");
