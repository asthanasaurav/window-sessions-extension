#!/usr/bin/env python3
"""Pure-logic tests mirroring lib/urls.js and lib/tab-capture.js"""

BLOCKED_PREFIXES = [
    "chrome://settings",
    "chrome://extensions",
    "chrome://version",
    "chrome-devtools://",
    "devtools://",
    "edge://",
    "brave://",
    "chrome://discards",
]


BLOCKED_EXACT = {"about:blank", "about:blank/", "chrome://newtab/", "chrome://newtab"}


def is_savable_url(url):
    if not url or not isinstance(url, str):
        return False
    trimmed = url.strip()
    if not trimmed:
        return False
    lower = trimmed.lower()
    if lower in BLOCKED_EXACT:
        return False
    return not any(lower.startswith(p) for p in BLOCKED_PREFIXES)


def read_tab_url(tab):
    candidates = [tab.get("url"), tab.get("pendingUrl")]
    candidates = [c.strip() for c in candidates if isinstance(c, str) and c.strip()]
    for candidate in candidates:
        if candidate.startswith("chrome://discards"):
            continue
        if candidate == "about:blank":
            continue
        if candidate == "chrome://newtab/":
            continue
        return candidate
    return ""


def serialize_live_tab(tab):
    url = read_tab_url(tab)
    if not is_savable_url(url):
        return None
    return {
        "url": url,
        "title": tab.get("title") or url or "Untitled",
        "pinned": bool(tab.get("pinned")),
        "active": bool(tab.get("active")),
        "discarded": bool(tab.get("discarded")),
        "index": tab.get("index", 0),
    }


def filter_restorable_tabs(tabs):
    restorable, skipped = [], []
    for tab in tabs:
        url = (tab.get("url") or "").strip()
        if is_savable_url(url):
            restorable.append({**tab, "url": url})
        else:
            skipped.append(tab)
    return restorable, skipped


def run():
    assert is_savable_url("https://docs.google.com/x")
    assert not is_savable_url("chrome://settings/")
    assert not is_savable_url("about:blank")
    assert not is_savable_url("chrome://newtab/")
    assert read_tab_url({"url": "https://example.com"}) == "https://example.com"
    assert read_tab_url({"url": "", "pendingUrl": "https://pending.example"}) == "https://pending.example"
    assert read_tab_url({"url": "chrome://discards/"}) == ""
    assert read_tab_url({"url": "about:blank", "pendingUrl": "https://real.example"}) == "https://real.example"
    assert read_tab_url({"url": "about:blank"}) == ""

    active = serialize_live_tab({"url": "https://a.com", "title": "A", "active": True, "index": 0})
    inactive = serialize_live_tab({"url": "https://b.com", "title": "B", "active": False, "discarded": True, "index": 1})
    assert active and inactive
    assert active["active"] is True
    assert inactive["discarded"] is True
    assert serialize_live_tab({"url": "chrome://settings/"}) is None

    restorable, skipped = filter_restorable_tabs([
        {"url": "https://one.test"},
        {"url": "https://two.test"},
        {"url": "chrome://settings/"},
    ])
    assert len(restorable) == 2
    assert len(skipped) == 1

    tabs = [
        {"windowId": 42, "url": "https://a.com"},
        {"windowId": 42, "url": "https://b.com"},
    ]
    wid = int("42")
    assert len([t for t in tabs if t["windowId"] == wid]) == 2

    print("All tests passed.")


if __name__ == "__main__":
    run()
