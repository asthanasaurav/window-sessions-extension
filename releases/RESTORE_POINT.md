# Restore points

## v1.4.0 — stable restore (2026-03-02)

**Status:** Known-good build. Save and restore work reliably (no blank `about:blank` tabs).

**To roll back:** Replace the extension folder contents with `releases/v1.4.0/`, then reload at `chrome://extensions`.

**What works:**
- Save current window only
- Restore to new or current window (loaded tabs, no discard)
- Park inactive tabs
- Quick save `⌘⇧S`, popup `⌥⇧W`
- Export/import JSON

**Manifest version:** `1.4.0`

---

## v1.5.0 — auto-save (current)

Adds optional interval auto-save and window-close snapshots. See README for settings.
