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
3. Tabs open with their real URLs loaded

### Add tab to session

Right-click any tab → **Window Sessions** → pick a saved session, or **Choose session…** for the full list.

- **Add** keeps the tab open (default)
- **Add and close tab (move)** removes it after saving to the session
- Only **manual** sessions appear — auto-snapshots are excluded

Configure in **Settings → Tab context menu**.

### Auto-save (optional)

Enable in **Settings → Auto-save**:

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-save on interval | Off | Snapshot every 15 min (configurable), keeps last 5 per window |
| Auto-save on window close | Off | Silent save or prompt when a window closes |

Auto-snapshots appear in the session list with an **Auto** or **On close** badge.

## Restore point

Known-good **v1.4.0** snapshot: `releases/v1.4.0/` (see `releases/RESTORE_POINT.md`).

## Tests

```bash
python3 tests/run-tests.py
```

## Mac shortcuts

| Shortcut | Action |
|----------|--------|
| `⌥⇧W` | Open popup |
| `⌘⇧S` | Quick save current window |

Customize at `chrome://extensions/shortcuts`.
