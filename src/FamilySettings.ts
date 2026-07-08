"use strict";

import type Gio from "gi://Gio";

import { type Family, familyOrderKey, familyGroupSettingsId } from "./Families.js";

const BOX_ORDER_KEYS = ["left-box-order", "center-box-order", "right-box-order"] as const;
type BoxOrderKey = typeof BOX_ORDER_KEYS[number];

/**
 * Settings-mutation helpers for manually (re)assigning an item's family
 * membership from the prefs UI — the "Move to Group"/"Remove from Group"
 * row actions. Operates purely on `Gio.Settings` (no `Main`/shell-only
 * imports), so it's usable from the prefs process, which runs in a
 * separate GJS runtime from the extension.
 */

/**
 * Finds which `${box}-box-order` array currently contains the given
 * settings id (a role or a family's collapsed-group id), if any.
 */
export function findSettingsIdLocation(settings: Gio.Settings, settingsId: string): { key: BoxOrderKey, index: number } | null {
    for (const key of BOX_ORDER_KEYS) {
        const order = settings.get_strv(key);
        const index = order.indexOf(settingsId);
        if (index !== -1) {
            return { key, index };
        }
    }
    return null;
}

/**
 * Removes the given settings id from every `${box}-box-order` array it
 * appears in.
 */
export function removeSettingsIdFromBoxOrders(settings: Gio.Settings, settingsId: string): void {
    for (const key of BOX_ORDER_KEYS) {
        const order = settings.get_strv(key);
        const filtered = order.filter(id => id !== settingsId);
        if (filtered.length !== order.length) {
            settings.set_strv(key, filtered);
        }
    }
}

/**
 * Manually assigns a currently-standalone role to the given family: removes
 * it from whichever `${box}-box-order` array holds it, adds it to the
 * family's persisted member order, and — if the family doesn't already have
 * a collapsed-group placeholder somewhere — inserts one where the role used
 * to be, so the assignment doesn't drop the item out of the top bar
 * entirely until the extension side happens to re-derive it.
 */
export function assignRoleToFamily(settings: Gio.Settings, family: Family, role: string): void {
    // This writes up to three keys (a box-order array, the family's order
    // key, and possibly another box-order array for the group placeholder).
    // `delay()`/`apply()` batches them into one atomic backend commit, so
    // the extension process — running in a separate GJS runtime, reacting
    // to each key's own `changed` signal independently — never observes an
    // in-between state where the role is already gone from its box-order
    // array but not yet added to the family (or vice versa). Without this,
    // `BoxOrderManager#saveNewTopBarItems` can catch the role in that gap,
    // see it as an unclassified-but-still-present item that structurally
    // matches this (or another) family, and reclassify it on its own,
    // fighting this function's own writes.
    settings.delay();

    const location = findSettingsIdLocation(settings, role);
    removeSettingsIdFromBoxOrders(settings, role);

    const orderKey = familyOrderKey(family.id);
    const roles = settings.get_strv(orderKey);
    if (!roles.includes(role)) {
        settings.set_strv(orderKey, [...roles, role]);
    }

    const groupId = familyGroupSettingsId(family.id);
    if (findSettingsIdLocation(settings, groupId) === null && location !== null) {
        const order = settings.get_strv(location.key);
        order.splice(location.index, 0, groupId);
        settings.set_strv(location.key, order);
    }

    settings.apply();
}

/**
 * Manually removes a role from the given family's persisted member order,
 * reinstating it as a standalone top-level item right next to the family's
 * collapsed-group placeholder (or in its former slot, if this was the
 * family's last member — an empty group has nothing left to place).
 */
export function removeRoleFromFamily(settings: Gio.Settings, family: Family, role: string): void {
    // See the matching comment in `assignRoleToFamily` — same cross-process
    // race, same fix. Without batching these two writes, the extension
    // process can observe the role already removed from the family's order
    // but not yet reinstated in a box-order array, decide (via
    // `#findFamilyForRole`'s structural creator-uuid/prefix match) that the
    // role still belongs to this family, and silently re-add it — which is
    // exactly what "Remove from Group" sometimes appearing to duplicate or
    // silently undo itself turned out to be.
    settings.delay();

    const orderKey = familyOrderKey(family.id);
    const remainingRoles = settings.get_strv(orderKey).filter(r => r !== role);
    settings.set_strv(orderKey, remainingRoles);

    const groupId = familyGroupSettingsId(family.id);
    const groupLocation = findSettingsIdLocation(settings, groupId);

    if (groupLocation === null) {
        // No placeholder currently placed (shouldn't normally happen while
        // the family had members) — fall back to appending the freed role.
        const order = settings.get_strv("left-box-order");
        settings.set_strv("left-box-order", [...order, role]);
        settings.apply();
        return;
    }

    const order = settings.get_strv(groupLocation.key);
    if (remainingRoles.length === 0) {
        // The family is now empty — replace its placeholder's slot with the
        // freed role directly instead of leaving a pointless empty group.
        order[groupLocation.index] = role;
    } else {
        // Other members remain — insert the freed role right next to the
        // still-active placeholder.
        order.splice(groupLocation.index, 0, role);
    }
    settings.set_strv(groupLocation.key, order);

    settings.apply();
}
