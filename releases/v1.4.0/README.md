# Window Sessions

Chrome extension to **save the current browser window** as a named session and **restore all its tabs** later — in a new window or the current one.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder
4. Approve **site access** when prompted (needed to read tab URLs)

## Usage

### Save

1. Click the toolbar icon
2. **+ Save current window**
3. Enter a name — only **this window's tabs** are saved (active + inactive)
4. Click **Save**

Quick save: `⌘⇧S` (Mac) / `Ctrl+Shift+S`

### Restore

1. Click **Restore** on a session
2. Choose **new window** or **this window**
3. Tabs open **sleeping** (low memory) — click any tab to load it

## Tests

```bash
node tests/run-tests.mjs
```

## Mac shortcuts

| Shortcut | Action |
|----------|--------|
| `⌥⇧W` | Open popup |
| `⌘⇧S` | Quick save current window |

Customize at `chrome://extensions/shortcuts`.
