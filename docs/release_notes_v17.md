Top Bar Organizer Plus v17 includes the following changes since v16.1.

# Relevant Changes

## New: Groups Page and the Families Mechanism

Some extensions (GSConnect, Tasks in Panel, Task Up UltraLite) create many top bar items that logically belong together rather than one single item. These now collapse into a single, reorderable slot in the **Item Order** page, with their own internal order set on a new **Groups** page. Membership is tracked automatically via a new creator-extension-tracking mechanism (falling back to role-name-prefix matching for items already present before this extension started tracking creators), and can also be set manually per item via new "Move to Group…" / "Remove from Group" row actions.

See the README's [Families & Groups](../README.md#families--groups) section for full details.

## New: AppIndicator / Tray Icon Ordering (Off / Safe / Full)

Tray icons (AppIndicator/KStatusNotifierItem — Steam, Discord, Nextcloud, and similar) are now supported by a dedicated, opt-in tri-state mode:

- **Off** — untouched, as before v17.
- **Safe** *(new default)* — a newly created tray icon is placed once, adjacent to the last other tray icon, and never moved again.
- **Full** — tray icons become a real, persisted, reorderable group like any other family, with a section on the Groups page.

**"Full" mode carries a residual crash risk**: reparenting a tray icon's container mid-teardown can corrupt GNOME Shell's actor tree at the C level. This is the same failure mode that caused tray-icon reordering to be dropped entirely in earlier versions of this fork — it's being reintroduced here as an explicit, off-by-default opt-in rather than silently re-enabled. A new per-item **Exceptions** list (Settings page, or the "Add to Exceptions" row action) lets you keep one specific fragile tray icon out of "Full" mode's reordering — its identity stays tracked, but it's never reparented — without giving up ordering for everything else.

## New: Multi-Page Preferences Window

Preferences are now a 4-page window (Item Order / Groups / Settings / About) instead of one single page, to make room for the Groups and Settings/About additions below without cramming everything into one list.

## New: Settings Page, with Export/Import

The former single-purpose "AppIndicator" preferences page is now a general **Settings** page, holding the AppIndicator Order Mode, the Exceptions list, and a new **Backup** section: **Export…** writes every one of this extension's current settings to a JSON file; **Import…** reads one back and applies it atomically, after a confirmation dialog. See the README's [Backing Up and Restoring Settings](../README.md#backing-up-and-restoring-settings).

## New: About Page

A 4th sidebar page showing the extension's name/version/description (read live from `metadata.json`), links to the homepage and issue tracker, the shipped `COPYING` license opened locally, and credit to the upstream project this fork is built on.

# Other Changes

- Added per-item creator-extension tracking, the foundation the Families mechanism above uses to recognize items reliably instead of depending only on role-name conventions.
- Skipped redundant reparenting for left/center-box items already at their correct position, reducing unnecessary top bar churn on every reorder pass.
- Added a convenience "Add to Exceptions" row action on AppIndicator items, instead of requiring their application id to be typed in by hand.

# `git shortlog`

The git shortlog for this version:

```
Shibasish Paul (23):
      fix: change version -> version-name and add integer valued version in metadata
      Switch preferences to a multi-page window
      feat(extension): track which extension creates each top bar item
      refactor(box-order): generalize settings access into key-agnostic helpers
      feat(family): implement core generic Family mechanism and shared definitions
      refactor(prefs): extract drag-and-drop scroll setup into a shared helper
      feat(prefs): add dynamic Groups page and group (re)assignment actions
      feat(family): add GSConnect device grouping
      feat(family): add Tasks in Panel grouping with stale-member pruning
      perf(extension): skip reparenting items already at their correct position
      fix(extension): re-order top bar on family member reordering
      feat(extension): reintroduce AppIndicator/KStatusNotifierItem item identity handling
      feat(extension): add tri-state appindicator-order-mode setting, wire up "off" mode
      feat(extension): implement "safe" AppIndicator/KStatusNotifierItem ordering mode
      feat(family): implement "full" AppIndicator/KStatusNotifierItem ordering mode
      feat(extension): add per-item exceptions for "full" mode AppIndicator ordering
      feat(prefs): add an AppIndicator page to preferences
      fix(appindicator): lock group entry outside full mode
      fix(family): stop manual group reassignment from duplicating roles
      fix(prefs): fix AppIndicator page icon and Order Mode value truncation
      feat(prefs): generalize AppIndicator page into a Settings page
      feat(prefs): add an About page
      refactor: use connectObject()/disconnectObject() for signal cleanup
```
