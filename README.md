# Top Bar Organizer Plus

[![Latest release](https://img.shields.io/github/v/release/ShibasishPaul/top-bar-organizer-plus?label=release&color=4A86CF)](https://github.com/ShibasishPaul/top-bar-organizer-plus/releases)
[![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-4A86CF?logo=gnome&logoColor=white)](#supported-gnome-shell-versions)
[![License: GPLv3](https://img.shields.io/badge/license-GPLv3--or--later-blue.svg)](./COPYING)
[![Get it on GNOME Extensions](https://img.shields.io/badge/GNOME%20Extensions-10350-4A86CF?logo=gnome&logoColor=white)](https://extensions.gnome.org/extension/10350/top-bar-organizer-plus/)

![Screenshot of the Item Order page of Top Bar Organizer Plus v17's preferences, showing the Left, Center, and Right Top Bar Box sections with several items in each.](./res/Screenshot%20of%20Top%20Bar%20Organizer%20Plus%20v17%20preferences%20-%20Hero%20-%202026-07-08.png)

A GNOME Shell extension that lets you reorder, group, and show/hide the items of the top (menu) bar — the clock, system indicators, AppIndicator/tray icons, and the items other extensions add — instead of being stuck with whatever order they happened to load in.

This is a fork of [Top Bar Organizer](https://gitlab.gnome.org/june/top-bar-organizer) by June. See [Credits](#credits) for what's changed and why this exists as a separate extension rather than a merge back upstream.

## 📦 Installation

The extension is available on the [GNOME Extensions website](https://extensions.gnome.org/extension/4356/top-bar-organizer/).

Or install a release manually:

1. Download the latest `.shell-extension.zip` from the [releases page](https://github.com/ShibasishPaul/top-bar-organizer-plus/releases).
2. Install it with:

   ```
   gnome-extensions install --force <downloaded-file>.shell-extension.zip
   ```

3. Log out and back in (Wayland requires a full session restart to load a new extension; X11 users can instead restart GNOME Shell with <kbd>Alt</kbd>+<kbd>F2</kbd>, `r`, <kbd>Enter</kbd>).
4. Enable it with `gnome-extensions enable top-bar-organizer-plus@shibasishpaul.github.com`, or via the Extensions app.

## 🚀 Quick Start

1. Open the extension's preferences (via the Extensions app, or `gnome-extensions prefs top-bar-organizer-plus@shibasishpaul.github.com`).
2. On the **Item Order** page, drag items up/down within their box (left/center/right of the top bar), or use the three-dot menu on a row for move/visibility/grouping actions.
3. Changes apply live — no need to restart GNOME Shell.

## 🛠️ Preferences Window

The preferences window has four pages, listed in the sidebar.

### 📋 Item Order Page

![Screenshot of the Items Order page of Top Bar Organizer Plus v17's preferences.](./res/Screenshot%20of%20Top%20Bar%20Organizer%20Plus%20v17%20preferences%20-%20Item%20Order%20page%20-%202026-07-08.png)

The main page. Shows every top bar item currently known, split into three sections matching the top bar's own layout: **Left Box**, **Center Box**, and **Right Box**. Drag an item to reorder it, including across sections, or use its three-dot menu for precise single-step moves and other actions. A [family](#families--groups)'s members are collapsed into a single row here; expand and reorder them individually on the [Groups page](#groups-page).

Three-dot menu actions, depending on what kind of row it is:

- **Move Up** / **Move Down** — nudge the item one step; disabled at whichever end of the box/list is already the edge.
- **Visibility** (**Default** / **Forcefully Hide** / **Forcefully Show**) — override whether this item is shown. See [Visibility](#visibility-showhide).
- **Move to Group…** / **Remove from Group** — assign a standalone item into a [family](#families--groups), or pull a member back out.
- **Add to Exceptions** — AppIndicator/tray members only; shortcut for the ["full" mode exceptions list](#appindicator--tray-icon-ordering).
- **Forget** — drops an item this extension no longer sees live in the top bar from its persisted order; a no-op on items still actually present.

### 🗂️ Groups Page

![Screenshot of the Groups page of Top Bar Organizer Plus v17's preferences, showing the Tasks in Panel and AppIndicator family sections with their members.](./res/Screenshot%20of%20Top%20Bar%20Organizer%20Plus%20v17%20preferences%20-%20Groups%20page%20-%202026-07-08.png)

One section per known [family](#families--groups) (Task Up UltraLite, GSConnect, Tasks in Panel, AppIndicator/tray icons — whichever of these you actually have items from). Each section is its own independently orderable list: dragging or moving a member here only reorders it within its family, since a family occupies exactly one contiguous slot in the actual top bar (set on the [Item Order page](#item-order-page)).

### ⚙️ Settings Page

![Screenshot of the Settings page of Top Bar Organizer Plus v17's preferences, showing the Order Mode row, an Exceptions entry, and the Backup section's Export/Import buttons.](./res/Screenshot%20of%20Top%20Bar%20Organizer%20Plus%20v17%20preferences%20-%20Settings%20page%20-%202026-07-08.png)

General extension-wide settings that don't belong to a specific item:

- **AppIndicator Order Mode** — the Off / Safe / Full switch described in [AppIndicator / Tray Icon Ordering](#appindicator--tray-icon-ordering).
- **Exceptions** — the manual add/remove list of application ids excluded from "Full" mode reordering (same list the [Item Order page](#item-order-page)'s "Add to Exceptions" action writes to).
- **Backup** — **Export…** and **Import…** buttons to save or restore every one of this extension's settings as a single JSON file. See [Backing Up and Restoring Settings](#backing-up-and-restoring-settings).

## 💡 Concepts

### ↕️ Item Order

Every top bar item — the clock, the system status area (`Main.panel.statusArea`), items other extensions add — lives in one of the top bar's three boxes (left, center, right). This extension tracks each item's identity by its stable *role* (its key in `Main.panel.statusArea`, or a derived one for AppIndicator/tray items — see below) and persists your chosen order per box. On every relevant top bar change, it reconciles the box's actual children against that persisted order.

### 👁️ Visibility (Show/Hide)

Independent of ordering, any item can be forced to always show or always hide, overriding whatever its own extension wants. Useful for items that don't offer their own visibility toggle. Set per-item via the "Visibility" option in a row's three-dot menu; "Default" clears the override and defers back to the item's own extension.

### 🧩 Families & Groups

Some extensions create many top bar items that logically belong together — one entry per open window, one per paired Bluetooth device, and so on — rather than one single item. Tracking each individually would clutter the Item Order page and give no way to order them as a set. A **Family** solves this: its members occupy a single collapsed slot in the box order (reorder that slot like any other item on the [Item Order page](#item-order-page)), while their *internal* order among themselves is set on the [Groups page](#groups-page).

Families known out of the box:

| Family | Matched by | Notes |
|---|---|---|
| [Task Up UltraLite](https://extensions.gnome.org/extension/7700/task-up-ultralite/) | role-name prefix (`task-button-`) | Not verified against a live instance — kept for compatibility since there's no confirmed extension uuid to match against. |
| [GSConnect](https://github.com/GSConnect/gnome-shell-extension-gsconnect) | extension uuid, falling back to device object-path prefix | One member per paired device; members are never pruned just for being temporarily offline. |
| [Tasks in Panel](https://gitlab.com/fthx/tasks-in-panel) | extension uuid, falling back to role prefix | One member per open window; stale members (closed windows) are pruned automatically, since each window gets a new, never-repeated role. |
| AppIndicator / KStatusNotifierItem (tray icons) | derived application identity | Only active in AppIndicator "Full" mode — see below. |

A top bar item is recognized as a family's member either because the extension that created it is known (tracked automatically the moment it's added), or by a fallback role-name prefix match for items already present before this extension started tracking creators. You can also manually move any standalone item into a family (or pull a member back out) via the "Move to Group…" / "Remove from Group" row actions.

### 🔔 AppIndicator / Tray Icon Ordering

Tray icons (AppIndicator/KStatusNotifierItem items — Steam, Discord, Nextcloud, and similar apps that live in the tray rather than as a normal top bar indicator) are handled separately from every other kind of item, controlled by the **AppIndicator Order Mode** setting on the [Settings page](#settings-page):

- **Off** — tray icons are left completely alone; this extension never touches them.
- **Safe** *(default)* — a newly created tray icon is placed once, adjacent to the last other tray icon already present, and never moved again afterward.
- **Full** — tray icons become a real, persisted, reorderable [family](#families--groups) like any other, with their own section on the Groups page.

**"Full" mode carries a small residual crash risk.** Reparenting a tray icon's container while it's mid-teardown can corrupt GNOME Shell's actor tree at the C level — this is a real crash this extension's author has hit and root-caused in the past, not a theoretical concern. "Safe" mode exists specifically to give tray icons a sensible one-time position without that risk. If you use "Full" mode and hit a crash tied to a specific tray icon, add it to the **Exceptions** list (Settings page, or the "Add to Exceptions" row action) — its identity stays tracked and it stays part of the persisted order, but it's never reparented, removing the risk for that one icon while everything else stays fully orderable.

## 💾 Backing Up and Restoring Settings

The Settings page's **Export…** button writes every one of this extension's current GSettings keys to a JSON file you choose — box orders, family member orders, visibility overrides, AppIndicator mode and exceptions, everything. **Import…** reads that file back and applies it atomically (either every key updates, or on error, none do), after a confirmation dialog since it fully overwrites your current settings. Useful for moving your configuration to another machine, or keeping a known-good snapshot before experimenting.

## 🖥️ Supported GNOME Shell Versions

45, 46, 47, 48, 49, 50 (see `shell-version` in [`src/metadata.json`](./src/metadata.json) for the authoritative, up-to-date list).

## 🔀 Changes From Upstream

- Stops tracking and reordering AppIndicator/legacy tray icons by default (see [AppIndicator / Tray Icon Ordering](#appindicator--tray-icon-ordering) — "Safe" mode is the default, "Full" mode is opt-in), which caused conflicts with the AppIndicator extension in the original project.
- Uses an independent settings schema and dconf path, so it can be installed alongside the original Top Bar Organizer without conflicting.
- Adds the [Families & Groups](#families--groups) mechanism (Task Up UltraLite, GSConnect, Tasks in Panel, AppIndicator), generalized from a single upstream special case.
- Adds per-item creator-extension tracking, used to identify family membership reliably instead of relying only on role-name conventions.
- Restructures preferences into a multi-page window (Item Order / Groups / Settings / About) instead of a single page.
- Adds AppIndicator/tray icon identity tracking and the tri-state Off/Safe/Full ordering mode, including a per-item exceptions list.
- Adds settings export/import (backup and restore).
- Adds an in-app About page.

## ⚠️ Known Risks

- **AppIndicator "Full" mode** can, in rare cases, crash GNOME Shell — see [AppIndicator / Tray Icon Ordering](#appindicator--tray-icon-ordering) above for why, and how to work around it with the Exceptions list. "Off" and "Safe" mode do not carry this risk.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for commit message conventions and code style.

## 🙏 Credits

This extension is a fork of [**Top Bar Organizer**](https://gitlab.gnome.org/june/top-bar-organizer) by **June** (<june@jsts.xyz>), the original author of the core item-ordering mechanism this fork builds on. See [Changes From Upstream](#changes-from-upstream) for what this fork adds on top of that foundation.

Maintained by [Shibasish Paul](https://github.com/ShibasishPaul).

## 📄 License

[GPL-3.0-or-later](./COPYING).
