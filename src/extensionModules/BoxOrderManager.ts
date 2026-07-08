"use strict";

import GObject from "gi://GObject";
import GLib from "gi://GLib";
import St from "gi://St";
import type Gio from "gi://Gio";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import type { CustomPanel } from "../extension.js"
import { FAMILIES, familyOrderKey, familyGroupSettingsId, findFamilyByGroupSettingsId, type Family } from "../Families.js";

export type Box = "left" | "center" | "right";
type Hide = "hide" | "show" | "default";
/**
 * A resolved box order item containing the items role, settings identifier and
 * additional information.
 */
interface ResolvedBoxOrderItem {
    settingsId: string // The settings identifier of the item.
    role: string // The role of the item.
    hide: Hide // Whether the item should be (forcefully) hidden, (forcefully) shown or just be left as is.
}

/**
 * This class provides an interfaces to the box orders stored in settings.
 * It takes care of handling AppIndicator and Task Up UltraLite items and
 * resolving from the internal item settings identifiers to roles.
 * In the end this results in convenient functions, which are directly useful in
 * other extension code.
 *
 * NOTE: reparenting a disposed AppIndicator/KStatusNotifierItem (tray)
 * container crashes gnome-shell (SIGSEGV in mutter) — their containers are
 * destroyed and recreated on the application side (readiness transitions,
 * reconnects, legacy XEmbed socket rebuilds). `handleAppIndicatorItem` below
 * only derives identity; nothing yet consumes it to actually reorder tray
 * containers (see `saveNewTopBarItems`), so this is safe on its own.
 */
export default class BoxOrderManager extends GObject.Object {
    static {
        GObject.registerClass({
            Signals: {
                "appIndicatorReady": {},
            },
        }, this);
    }

    // Can't have type guarantees here, since this is working with types from
    // the KStatusNotifier/AppIndicator extension.
    #appIndicatorReadyHandlerIdMap: Map<any, any>;
    #appIndicatorItemSettingsIdToRolesMap: Map<string, string[]>;
    #settings: Gio.Settings;
    // Persisted in the `item-creators` setting (as `role -> uuid`, with `""`
    // standing in for a confirmed-null creator, since GSettings' `a{ss}`
    // can't hold an actual null). Loaded once here and kept in sync on every
    // write, so a role's creator only ever needs to be determined once
    // across a role's entire lifetime, not just once per session — see
    // `recordItemCreator`.
    #itemCreatorUuids: Map<string, string | null>;

    constructor(params = {}, settings: Gio.Settings) {
        // @ts-ignore Params should be passed, see: https://gjs.guide/guides/gobject/subclassing.html#subclassing-gobject
        super(params);

        this.#appIndicatorReadyHandlerIdMap = new Map();
        this.#appIndicatorItemSettingsIdToRolesMap = new Map();

        this.#settings = settings;

        const persistedCreators = this.#settings.get_value("item-creators").deep_unpack() as Record<string, string>;
        this.#itemCreatorUuids = new Map(
            Object.entries(persistedCreators).map(([role, uuid]) => [role, uuid === "" ? null : uuid])
        );
    }

    /**
     * Records which extension (if any could be determined) created the item
     * associated with the given role. Used for family matching — see
     * `extractCreatorExtensionUuid` in `extension.ts` for how this is derived.
     *
     * First write wins: once a role's creator is known (this session or a
     * past one, via the persisted `item-creators` setting), later calls are
     * no-ops. This matters because a role's `_addToPanelBox` call can be
     * re-triggered later by an extension other than its true creator (e.g.
     * an extension removing and reinserting a core indicator to reposition
     * it) — without first-write-wins, that later call would overwrite the
     * correct creator with the wrong one.
     * @param {string} role - The role of the item.
     * @param {string | null} creatorUuid - The creating extension's uuid, or
     * `null` if it couldn't be determined (e.g. added by GNOME Shell itself).
     */
    recordItemCreator(role: string, creatorUuid: string | null): void {
        if (this.#itemCreatorUuids.has(role)) {
            return;
        }

        this.#itemCreatorUuids.set(role, creatorUuid);
        this.#persistItemCreators();
    }

    /**
     * Writes the current in-memory creator map to the `item-creators`
     * setting.
     */
    #persistItemCreators(): void {
        const obj: Record<string, string> = {};
        for (const [role, uuid] of this.#itemCreatorUuids) {
            obj[role] = uuid ?? "";
        }
        this.#settings.set_value("item-creators", new GLib.Variant("a{ss}", obj));
    }

    /**
     * Gets a string array setting's value. Key-agnostic so it can be reused
     * for both `${box}-box-order` keys and `family-order-${id}` keys.
     * @param {string} key - The settings key to read.
     * @returns {string[]} - The setting's current value.
     */
    #getStrv(key: string): string[] {
        return this.#settings.get_strv(key);
    }

    /**
     * Saves a string array setting's value, making sure to only write if the
     * value actually changed, to avoid loops when listening on settings
     * changes. Key-agnostic, see `#getStrv`.
     * @param {string} key - The settings key to write.
     * @param {string[]} value - The value to save.
     */
    #saveStrv(key: string, value: string[]): void {
        const currentValue = this.#getStrv(key);

        // Only save the given value to settings, if it is different, to
        // avoid loops when listening on settings changes.
        if (JSON.stringify(value) !== JSON.stringify(currentValue)) {
            this.#settings.set_strv(key, value);
        }
    }

    /**
     * Gets a box order for the given top bar box from settings.
     * @param {Box} box - The top bar box for which to get the box order.
     * @returns {string[]} - The box order consisting of an array of item
     * settings identifiers.
     */
    #getBoxOrder(box: Box): string[] {
        return this.#getStrv(`${box}-box-order`);
    }

    /**
     * Save the given box order to settings.
     * @param {Box} box - The top bar box for which to save the box order.
     * @param {string[]} boxOrder - The box order to save. Must be an array of
     * item settings identifiers.
     */
    #saveBoxOrder(box: Box, boxOrder: string[]): void {
        this.#saveStrv(`${box}-box-order`, boxOrder);
    }

    /**
     * Finds the family the given role belongs to, if any. See `Family` for
     * how creator-uuid vs. role-prefix matching is chosen.
     * @param {string} role - The role to find a family for.
     * @returns {Family | undefined} The matching family, if any.
     */
    #findFamilyForRole(role: string): Family | undefined {
        const creatorUuid = this.#itemCreatorUuids.get(role) ?? null;

        return FAMILIES.find(family => {
            if (creatorUuid !== null && family.creatorExtensionUuid !== undefined) {
                // Both sides have a known creator uuid to compare — a
                // confident answer either way, don't second-guess it with
                // the weaker prefix heuristic below.
                return creatorUuid === family.creatorExtensionUuid;
            }

            return family.rolePrefixFallback !== undefined && role.startsWith(family.rolePrefixFallback);
        });
    }

    /**
     * Gets the configured AppIndicator/KStatusNotifierItem (tray) ordering
     * mode: "off", "safe" or "full".
     * @returns {string} The configured mode.
     */
    #getAppIndicatorOrderMode(): string {
        return this.#settings.get_string("appindicator-order-mode");
    }

    /**
     * Handles an AppIndicator/KStatusNotifierItem item by deriving a settings
     * identifier and then associating the role of the given item to the items
     * settings identifier.
     * It then returns the derived settings identifier.
     * In the case, where the settings identifier can't be derived, because the
     * application can't be determined, this method throws an error. However it
     * then also makes sure that once the app indicators "ready" signal emits,
     * this classes "appIndicatorReady" signal emits as well, such that it and
     * other methods can be called again to properly handle the item.
     * Legacy X11 tray icons handled by the AppIndicator extension don't expose
     * an `_indicator` object; for those, the application name is derived from
     * the role's `appindicator-legacy:` prefix instead.
     * @param {St.Bin} indicatorContainer - The container of the indicator of the
     * AppIndicator/KStatusNotifierItem item.
     * @param {string} role - The role of the AppIndicator/KStatusNotifierItem
     * item.
     * @returns {string} The derived items settings identifier.
     */
    handleAppIndicatorItem(indicatorContainer: St.Bin, role: string): string {
        // Since this is working with types from the
        // AppIndicator/KStatusNotifierItem extension, we loose a bunch of type
        // safety here.
        // https://github.com/ubuntu/gnome-shell-extension-appindicator
        // The AppIndicator and KStatusNotifierItem Support extension places
        // `_indicator` directly on the container. The Ubuntu AppIndicator
        // extension places it on the child instead.
        const appIndicator = (indicatorContainer as any)._indicator ?? (indicatorContainer.get_child() as any)?._indicator;

        let application: string | undefined;
        if (appIndicator) {
            application = appIndicator.id;
        } else if (role.startsWith("appindicator-legacy:")) {
            // Legacy X11 tray icons (e.g. Steam, Discord) handled by the
            // AppIndicator extension don't expose an `_indicator` object at
            // all. Derive an application name from the role instead.
            const parts = role.split(":");
            application = "legacy-" + (parts.length >= 2 ? parts[1] : "unknown");
        }

        if (!application) {
            if (appIndicator && this.#appIndicatorReadyHandlerIdMap) {
                const handlerId = appIndicator.connect("ready", () => {
                    this.emit("appIndicatorReady");
                    appIndicator.disconnect(handlerId);
                    this.#appIndicatorReadyHandlerIdMap.delete(handlerId);
                });
                this.#appIndicatorReadyHandlerIdMap.set(handlerId, appIndicator);
            }
            throw new Error("Application can't be determined.");
        }

        // Since the Dropbox client appends its PID to the id, drop the PID and
        // the hyphen before it.
        if (application.startsWith("dropbox-client-")) {
            application = "dropbox-client";
        }

        // Derive the items settings identifier from the application name.
        const itemSettingsId = `appindicator-kstatusnotifieritem-${application}`;

        // Associate the role with the items settings identifier.
        let roles = this.#appIndicatorItemSettingsIdToRolesMap.get(itemSettingsId);
        if (roles) {
            // If the settings identifier already has an array of associated
            // roles, just add the role to it, if needed.
            if (!roles.includes(role)) {
                roles.push(role);
            }
        } else {
            // Otherwise create a new array.
            this.#appIndicatorItemSettingsIdToRolesMap.set(itemSettingsId, [role]);
        }

        // Return the item settings identifier.
        return itemSettingsId;
    }

    /**
     * Handles an AppIndicator/KStatusNotifierItem item for "full" ordering
     * mode: derives its (per-application) settings identifier via
     * `handleAppIndicatorItem`, records that identifier as a member of the
     * "appindicator" family's persisted order (if not already present), and
     * returns that family's group slot id, shared by all tray icons in
     * "full" mode.
     *
     * Deliberately not routed through `#handleFamilyItem`: that method's
     * persisted member order holds roles 1:1 (one member = one live role),
     * while AppIndicator's identity granularity is per-application — a
     * churning set of roles can map to one application id over its
     * lifetime (see `handleAppIndicatorItem`). Reuses the "appindicator"
     * family's naming helpers (`familyOrderKey`/`familyGroupSettingsId`)
     * for consistency, not its per-role membership logic.
     * @param {St.Bin} indicatorContainer - The container of the indicator of
     * the AppIndicator/KStatusNotifierItem item.
     * @param {string} role - The role of the AppIndicator/KStatusNotifierItem
     * item.
     * @returns {string} The settings identifier to use, i.e. the
     * "appindicator" family's group slot id.
     */
    #handleFullModeAppIndicatorItem(indicatorContainer: St.Bin, role: string): string {
        const itemSettingsId = this.handleAppIndicatorItem(indicatorContainer, role);

        const key = familyOrderKey("appindicator");
        const familyOrder = this.#getStrv(key);
        if (!familyOrder.includes(itemSettingsId)) {
            familyOrder.push(itemSettingsId);
            this.#saveStrv(key, familyOrder);
        }

        return familyGroupSettingsId("appindicator");
    }

    /**
     * Gets the AppIndicator/KStatusNotifierItem application id (as derived by
     * `handleAppIndicatorItem`, e.g. "Nextcloud") associated with the given
     * role, if any is currently known.
     * @param {string} role - The role to look up.
     * @returns {string | undefined} The application id, if found.
     */
    getAppIndicatorApplicationId(role: string): string | undefined {
        for (const [itemSettingsId, roles] of this.#appIndicatorItemSettingsIdToRolesMap) {
            if (roles.includes(role)) {
                return itemSettingsId.replace(/^appindicator-kstatusnotifieritem-/, "");
            }
        }
        return undefined;
    }

    /**
     * Handles a family item by storing its role in that family's persisted
     * member order (if not already present) and returning the family's
     * settings identifier.
     * @param {Family} family - The family the item belongs to.
     * @param {string} role - The role of the item.
     * @returns {string} The settings identifier to use.
     */
    #handleFamilyItem(family: Family, role: string): string {
        const key = familyOrderKey(family.id);
        const roles = this.#getStrv(key);

        if (!roles.includes(role)) {
            // Defense-in-depth: never absorb a role that already has its
            // own top-level box-order entry (see the standalone guard in
            // saveNewTopBarItems for why this can happen).
            const boxOrders = [
                this.#getBoxOrder("left"),
                this.#getBoxOrder("center"),
                this.#getBoxOrder("right"),
            ];
            if (boxOrders.some(bo => bo.includes(role))) {
                return role;
            }

            roles.push(role);
            this.#saveStrv(key, roles);
        }

        return familyGroupSettingsId(family.id);
    }

    /**
     * Finds the family whose persisted member order (`family-order-${id}`)
     * already includes the given role, if any.
     *
     * Consulted before falling back to `#findFamilyForRole`'s structural
     * creator-uuid/role-prefix matching in `saveNewTopBarItems`'s
     * reconciliation loop — that match only ever answers with the role's
     * original creator and has no notion of a later, explicit
     * reassignment. Without checking existing membership first, a role
     * manually moved to a different family via the prefs "Move to Group"
     * action would get silently pulled back into its original family on
     * the very next reconciliation pass (triggered by any settings
     * change), ending up a member of both at once.
     * @param {string} role - The role to look up.
     * @returns {Family | undefined} The family role is already a member
     * of, if any.
     */
    #findExistingFamilyMembership(role: string): Family | undefined {
        return FAMILIES.find(family => this.#getStrv(familyOrderKey(family.id)).includes(role));
    }

    /**
     * Gets a resolved box order for the given top bar box, where all Task Up
     * UltraLite items got resolved using their roles, meaning they might be
     * present multiple times or not at all depending on the roles stored.
     * The items of the box order also have additional information stored.
     * @param {Box} box - The top bar box for which to get the resolved box order.
     * @returns {ResolvedBoxOrderItem[]} - The resolved box order.
     */
    #getResolvedBoxOrder(box: Box): ResolvedBoxOrderItem[] {
        let boxOrder = this.#getBoxOrder(box);

        const itemsToHide = this.#settings.get_strv("hide");
        const itemsToShow = this.#settings.get_strv("show");

        let resolvedBoxOrder = [];
        for (const itemSettingsId of boxOrder) {
            const resolvedBoxOrderItem = {
                settingsId: itemSettingsId,
                role: "",
                hide: "",
            };

            // Set the hide state of the item.
            if (itemsToHide.includes(resolvedBoxOrderItem.settingsId)) {
                resolvedBoxOrderItem.hide = "hide";
            } else if (itemsToShow.includes(resolvedBoxOrderItem.settingsId)) {
                resolvedBoxOrderItem.hide = "show";
            } else {
                resolvedBoxOrderItem.hide = "default";
            }

            // If the item's settings identifier isn't a family group, then
            // its identifier is the role and it can just be added to the
            // resolved box order.
            // (Any leftover `appindicator-kstatusnotifieritem-*` identifiers
            // from older settings are treated the same way; they won't match a
            // current status area role and get dropped by getValidBoxOrder.)
            const family = findFamilyByGroupSettingsId(itemSettingsId);
            if (!family) {
                resolvedBoxOrderItem.role = resolvedBoxOrderItem.settingsId;
                resolvedBoxOrder.push(resolvedBoxOrderItem);
                continue;
            }

            // The family group is expanded to its persisted member roles —
            // except "appindicator", whose persisted member order holds
            // per-application settings identifiers rather than roles
            // directly (see `#handleFullModeAppIndicatorItem`), so its
            // members are expanded to their currently-known roles instead.
            // Also unlike other families, "appindicator"'s persisted group
            // slot and member order must stay inert outside "full" mode —
            // they're deliberately never cleared on a mode switch (so the
            // configured order survives switching back to "full" later),
            // so without this check the group would keep resolving to
            // (and being reparented as) live roles in "off"/"safe" mode
            // too, using settings that mode has no business acting on.
            const roles = family.id === "appindicator"
                ? (this.#getAppIndicatorOrderMode() === "full"
                    ? this.#getStrv(familyOrderKey(family.id))
                        .flatMap(memberSettingsId => this.#appIndicatorItemSettingsIdToRolesMap.get(memberSettingsId) ?? [])
                    : [])
                : this.#getStrv(familyOrderKey(family.id));

            // Create a new resolved box order item for each role and add it to
            // the resolved box order.
            for (const role of roles) {
                const newResolvedBoxOrderItem = JSON.parse(JSON.stringify(resolvedBoxOrderItem));
                newResolvedBoxOrderItem.role = role;
                resolvedBoxOrder.push(newResolvedBoxOrderItem);
            }
        }

        return resolvedBoxOrder;
    }

    /**
     * Disconnects all signals (and disables future signal connection).
     * This is typically used before nulling an instance of this class to make
     * sure all signals are disconnected.
     */
    disconnectSignals(): void {
        for (const [handlerId, appIndicator] of this.#appIndicatorReadyHandlerIdMap) {
            if (handlerId && appIndicator?.signalHandlerIsConnected(handlerId)) {
                appIndicator.disconnect(handlerId);
            }
        }
        // @ts-ignore
        this.#appIndicatorReadyHandlerIdMap = null;
    }

    /**
     * Gets a valid box order for the given top bar box, where all Task Up
     * UltraLite items got resolved and where only items are
     * included, which are in some GNOME Shell top bar box.
     * The items of the box order also have additional information stored.
     * @param {Box} box - The top bar box to return the valid box order for.
     * @returns {ResolvedBoxOrderItem[]} - The valid box order.
     */
    getValidBoxOrder(box: Box): ResolvedBoxOrderItem[] {
        // Get a resolved box order.
        let resolvedBoxOrder = this.#getResolvedBoxOrder(box);

        // Get the indicator containers (of the items) currently present in the
        // GNOME Shell top bar.
        // They should be St.Bins (see link), so ensure that using a filter.
        // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.2/js/ui/panelMenu.js?ref_type=tags#L21
        const indicatorContainers = new Set([
            (Main.panel as CustomPanel)._leftBox.get_children(),
            (Main.panel as CustomPanel)._centerBox.get_children(),
            (Main.panel as CustomPanel)._rightBox.get_children(),
        ].flat().filter(ic => ic instanceof St.Bin));

        // Go through the resolved box order and only add items to the valid box
        // order, where their indicator is currently present in the GNOME Shell
        // top bar.
        let validBoxOrder: ResolvedBoxOrderItem[] = [];
        for (const item of resolvedBoxOrder) {
            const associatedIndicatorContainer = (Main.panel.statusArea as any)[item.role]?.container;
            if (!(associatedIndicatorContainer instanceof St.Bin)) {
                // TODO: maybe add logging
                continue;
            }

            if (indicatorContainers.has(associatedIndicatorContainer)) {
                validBoxOrder.push(item);
            }
        }

        return validBoxOrder;
    }

    /**
     * This method saves all new items currently present in the GNOME Shell top
     * bar to the settings.
     */
    saveNewTopBarItems(): void {
        // Only run, when the session mode is "user" or the parent session mode
        // is "user".
        if (Main.sessionMode.currentMode !== "user" && Main.sessionMode.parentMode !== "user") {
            return;
        }

        // Get the box orders.
        const boxOrders = {
            left: this.#getBoxOrder("left"),
            center: this.#getBoxOrder("center"),
            right: this.#getBoxOrder("right"),
        };

        // Get roles (of items) currently present in the GNOME Shell top bar and
        // index them using their associated indicator container.
        let indicatorContainerRoleMap = new Map<St.Bin, string>();
        for (const role in (Main.panel.statusArea as any)) {
            const associatedIndicatorContainer = (Main.panel.statusArea as any)[role]?.container;
            if (!(associatedIndicatorContainer instanceof St.Bin)) {
                // TODO: maybe add logging
                continue;
            }
            indicatorContainerRoleMap.set(associatedIndicatorContainer, role);
        }

        // Prune families whose members shouldn't be remembered once they're
        // no longer present anywhere in the top bar (see `pruneStaleMembers`
        // on `Family`), before any new items get added below.
        const currentlyPresentRoles = new Set(indicatorContainerRoleMap.values());
        for (const family of FAMILIES) {
            if (!family.pruneStaleMembers) {
                continue;
            }
            const key = familyOrderKey(family.id);
            const prunedRoles = this.#getStrv(key).filter(role => currentlyPresentRoles.has(role));
            this.#saveStrv(key, prunedRoles);
        }

        // Get the indicator containers (of the items) currently present in the
        // GNOME Shell top bar boxes.
        // They should be St.Bins (see link), so ensure that using a filter.
        // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.2/js/ui/panelMenu.js?ref_type=tags#L21
        const boxIndicatorContainers = {
            left: (Main.panel as CustomPanel)._leftBox.get_children().filter(ic => ic instanceof St.Bin),
            center: (Main.panel as CustomPanel)._centerBox.get_children().filter(ic => ic instanceof St.Bin),
            // Reverse this array, since the items in the left and center box
            // are logically LTR, while the items in the right box are RTL.
            right: (Main.panel as CustomPanel)._rightBox.get_children().filter(ic => ic instanceof St.Bin).reverse(),
        };

        // This function goes through the indicator containers of the given box
        // and adds new item settings identifiers to the given box order.
        const addNewItemSettingsIdsToBoxOrder = (indicatorContainers: St.Bin[], boxOrder: string[], box: Box) => {
            for (const indicatorContainer of indicatorContainers) {
                // First get the role associated with the current indicator
                // container.
                let role = indicatorContainerRoleMap.get(indicatorContainer);
                if (!role) {
                    continue;
                }

                // Record this role as having no known creator, in case it's
                // never seen going through the `_addToPanelBox` override
                // (e.g. it already existed when this extension was
                // enabled). First-write-wins in `recordItemCreator` means
                // this is always safe: it never overwrites a creator
                // already determined by the override, this session or a
                // past one.
                this.recordItemCreator(role, null);

                // Then get a settings identifier for the item.
                let itemSettingsId;
                if (role.startsWith("appindicator-")) {
                    // Dispatch on the configured AppIndicator/KStatusNotifierItem
                    // (tray) ordering mode.
                    if (this.#getAppIndicatorOrderMode() === "full") {
                        try {
                            itemSettingsId = this.#handleFullModeAppIndicatorItem(indicatorContainer, role);
                        } catch (e) {
                            if (!(e instanceof Error) || e.message !== "Application can't be determined.") {
                                throw e;
                            }
                            // The "appIndicatorReady" signal will trigger a
                            // retry for this item once its application is
                            // determined.
                            continue;
                        }
                    } else {
                        // "off": tray items are never tracked, saved or
                        // ordered here. Their containers get destroyed and
                        // recreated on the application side, and reparenting
                        // a disposed container (which the ordering pass does)
                        // crashes gnome-shell. Leave tray icons wherever the
                        // AppIndicator extension places them.
                        // "safe": handled entirely by a separate one-shot
                        // mechanism in extension.ts's panel-box override,
                        // which never touches the box-order settings.
                        continue;
                    }
                } else {
                    // A role already tracked as a standalone top-level
                    // entry must not get reclassified into a family.
                    // This guards against misattribution when another
                    // extension re-adds a core indicator (e.g.
                    // tasks-in-panel removing and reinserting dateMenu to
                    // reposition it) — the creator-uuid captured on that
                    // re-add would otherwise absorb the indicator into
                    // the wrong family.
                    const isAlreadyStandalone = boxOrders.left.includes(role)
                        || boxOrders.center.includes(role)
                        || boxOrders.right.includes(role);
                    if (!isAlreadyStandalone) {
                        // Prefer a family this role is already an explicit
                        // member of over re-deriving one structurally — see
                        // `#findExistingFamilyMembership`.
                        const family = this.#findExistingFamilyMembership(role) ?? this.#findFamilyForRole(role);
                        if (family) {
                            itemSettingsId = this.#handleFamilyItem(family, role);
                        } else {
                            itemSettingsId = role;
                        }
                    } else {
                        itemSettingsId = role;
                    }
                }

                // Add the items settings identifier to the box order, if it
                // isn't in in one already.
                if (!boxOrders.left.includes(itemSettingsId)
                    && !boxOrders.center.includes(itemSettingsId)
                    && !boxOrders.right.includes(itemSettingsId)) {
                    if (box === "right") {
                        // Add the items to the beginning for this array, since
                        // its RTL.
                        boxOrder.unshift(itemSettingsId);
                    } else {
                        boxOrder.push(itemSettingsId);
                    }
                }
            }
        };

        addNewItemSettingsIdsToBoxOrder(boxIndicatorContainers.left, boxOrders.left, "left");
        addNewItemSettingsIdsToBoxOrder(boxIndicatorContainers.center, boxOrders.center, "center");
        addNewItemSettingsIdsToBoxOrder(boxIndicatorContainers.right, boxOrders.right, "right");

        this.#saveBoxOrder("left", boxOrders.left);
        this.#saveBoxOrder("center", boxOrders.center);
        this.#saveBoxOrder("right", boxOrders.right);

        // Drop persisted creator entries for roles no longer referenced
        // anywhere (not currently present, not in any box order, not a
        // family member) — keeps `item-creators` from growing without
        // bound for roles that are gone for good (e.g. tray icons or
        // window-scoped roles that come and go across app restarts).
        const stillReferencedRoles = new Set(currentlyPresentRoles);
        for (const role of [...boxOrders.left, ...boxOrders.center, ...boxOrders.right]) {
            stillReferencedRoles.add(role);
        }
        for (const family of FAMILIES) {
            for (const role of this.#getStrv(familyOrderKey(family.id))) {
                stillReferencedRoles.add(role);
            }
        }
        let creatorsChanged = false;
        for (const role of this.#itemCreatorUuids.keys()) {
            if (!stillReferencedRoles.has(role)) {
                this.#itemCreatorUuids.delete(role);
                creatorsChanged = true;
            }
        }
        if (creatorsChanged) {
            this.#persistItemCreators();
        }
    }
}
