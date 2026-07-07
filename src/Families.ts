"use strict";

/**
 * A group of top bar items that should occupy one contiguous slot in the box
 * order, with their own persisted, independently-orderable member list
 * (`family-order-${id}`), instead of each being tracked as its own separate
 * top-level item.
 * Has no gnome-shell-only imports, so it can be shared between the
 * extension process (`extensionModules/BoxOrderManager.ts`) and the prefs
 * process (`prefsModules/*.ts`), which run in separate GJS runtimes and
 * can't share code that touches `Main` or other shell-only globals.
 */
export interface Family {
    id: string // Stable key. Used in the `item-role-group-${id}` settings identifier and the `family-order-${id}` settings key.
    displayName: string // Human-readable name, used throughout the prefs UI.
    // Primary match: the uuid of the extension whose code adds this family's
    // items (see `extractCreatorExtensionUuid` in `extension.ts`). Left
    // undefined for families without a verified uuid to match against.
    creatorExtensionUuid?: string
    // Fallback match, used when the creator uuid isn't known for a given
    // role — either because this family has no `creatorExtensionUuid` at
    // all, or because the role was already present before this session
    // started (its creator was never captured; see `recordItemCreator`).
    rolePrefixFallback?: string
    // Whether to drop persisted members that are no longer present anywhere
    // in the top bar before adding newly discovered ones. Extensions whose
    // roles are permanently unique per instance (e.g. one per open window)
    // would otherwise accumulate dead entries forever.
    pruneStaleMembers: boolean
    // Formats a member role into a human-readable title for the prefs UI.
    // Left undefined to fall back to displaying the raw role — cosmetic
    // only, unrelated to family/creator identification.
    formatMemberTitle?: (role: string) => string
    // Description shown under this family's section on the Groups prefs
    // page. Left undefined to fall back to a generic description — a new
    // family doesn't need a matching prefs-groups-page.ui edit to show up
    // there, only an entry in FAMILIES.
    groupDescription?: string
}

/**
 * https://extensions.gnome.org/extension/7700/task-up-ultralite/
 * Not verified against a live instance (not installed) — kept for anyone
 * else using this fork who has it, on role-prefix matching only, since there
 * is no confirmed `creatorExtensionUuid` to match against.
 */
export const FAMILIES: Family[] = [
    {
        id: "task-up-ultralite",
        displayName: "Task Up UltraLite",
        rolePrefixFallback: "task-button-",
        pruneStaleMembers: false,
        groupDescription: "Order Task Up UltraLite's items within their group.",
    },
    {
        // https://github.com/GSConnect/gnome-shell-extension-gsconnect
        // Roles are the paired device's D-Bus object path — stable across
        // restarts and reconnects for as long as the device stays paired, so
        // there's no benefit to pruning a device just because it's
        // temporarily offline.
        id: "gsconnect",
        displayName: "GSConnect",
        creatorExtensionUuid: "gsconnect@andyholmes.github.io",
        rolePrefixFallback: "/org/gnome/Shell/Extensions/GSConnect/Device/",
        pruneStaleMembers: false,
        formatMemberTitle: (role) => role.replace("/org/gnome/Shell/Extensions/GSConnect/Device/", ""),
        groupDescription: "Order GSConnect's paired devices within their group. Unlike the Item Order page, this list has no adjacent box to migrate into — moving a device only reorders it within this group.",
    },
    {
        // https://gitlab.com/fthx/tasks-in-panel
        // Roles are `taskButton${windowId}` — a new, never-repeating value
        // every time a window opens, so a member that stops being present
        // anywhere is gone for good; pruning is what keeps this family's
        // persisted order from growing without bound.
        id: "tasks-in-panel",
        displayName: "Tasks in Panel",
        creatorExtensionUuid: "tasks-in-panel@fthx",
        rolePrefixFallback: "taskButton",
        pruneStaleMembers: true,
        formatMemberTitle: (role) => `Window ${role.replace("taskButton", "")}`,
        groupDescription: "Order Tasks in Panel's window buttons within their group. Entries for closed windows are pruned automatically.",
    },
];

/**
 * The settings key holding a family's persisted, independently-orderable
 * member list.
 */
export function familyOrderKey(familyId: string): string {
    return `family-order-${familyId}`;
}

/**
 * The settings identifier a family's collapsed group occupies in a
 * `${box}-box-order` array.
 */
export function familyGroupSettingsId(familyId: string): string {
    return `item-role-group-${familyId}`;
}

/**
 * Finds the family whose collapsed-group settings identifier matches the
 * given settings id, if any.
 */
export function findFamilyByGroupSettingsId(settingsId: string): Family | undefined {
    return FAMILIES.find(family => familyGroupSettingsId(family.id) === settingsId);
}

/**
 * Finds a family by its stable id.
 */
export function findFamilyById(familyId: string): Family | undefined {
    return FAMILIES.find(family => family.id === familyId);
}
