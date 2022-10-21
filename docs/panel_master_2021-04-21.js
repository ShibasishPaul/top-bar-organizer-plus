// My annotated and cut down `js/ui/panel.js` from gnome-shell/master.
// All annotations are what I guessed and interpreted while reading the code and
// might be wrong. They are prefixed with "Annotation:" to indicate that they're
// my comments, not comments that originally existed.

// Taken from: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/master/js/ui/panel.js
// On: 2021-04-21
// License: This code is licensed under GPLv2

// Parts taken from: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/master/js/ui/sessionMode.js
// On: 2021-04-21
// License: This code is licensed under GPLv2

// I'm using the word "item" to refer to the thing, which gets added to the top
// (menu)bar / panel, where an item has a role/name and an indicator.


// Annotation: [...] Cut out bunch of stuff here, which isn't relevant for this
// Extension.

const Main = imports.ui.main;

// Annotation: [...] Cut out bunch of stuff here, which isn't relevant for this
// Extension.

const PANEL_ITEM_IMPLEMENTATIONS = {
    'activities': ActivitiesButton,
    'aggregateMenu': AggregateMenu,
    'appMenu': AppMenuButton,
    'dateMenu': imports.ui.dateMenu.DateMenuButton,
    'a11y': imports.ui.status.accessibility.ATIndicator,
    'keyboard': imports.ui.status.keyboard.InputSourceIndicator,
    'dwellClick': imports.ui.status.dwellClick.DwellClickIndicator,
};

var Panel = GObject.registerClass(
class Panel extends St.Widget {
    // Annotation: Initializes the top (menu)bar / panel.
    // Does relevant stuff like:
    // - Defining `this._leftBox`, `this._centerBox` and `this._rightBox`.
    // - Finally calling `this._updatePanel()`.
    _init() {
        super._init({ name: 'panel',
                      reactive: true });

        this.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);

        this._sessionStyle = null;

        this.statusArea = {};

        this.menuManager = new PopupMenu.PopupMenuManager(this);

        this._leftBox = new St.BoxLayout({ name: 'panelLeft' });
        this.add_child(this._leftBox);
        this._centerBox = new St.BoxLayout({ name: 'panelCenter' });
        this.add_child(this._centerBox);
        this._rightBox = new St.BoxLayout({ name: 'panelRight' });
        this.add_child(this._rightBox);

        this._leftCorner = new PanelCorner(St.Side.LEFT);
        this.bind_property('style', this._leftCorner, 'style', GObject.BindingFlags.SYNC_CREATE);
        this.add_child(this._leftCorner);

        this._rightCorner = new PanelCorner(St.Side.RIGHT);
        this.bind_property('style', this._rightCorner, 'style', GObject.BindingFlags.SYNC_CREATE);
        this.add_child(this._rightCorner);

        Main.overview.connect('showing', () => {
            this.add_style_pseudo_class('overview');
        });
        Main.overview.connect('hiding', () => {
            this.remove_style_pseudo_class('overview');
        });

        Main.layoutManager.panelBox.add(this);
        Main.ctrlAltTabManager.addGroup(this, _("Top Bar"), 'focus-top-bar-symbolic',
                                        { sortGroup: CtrlAltTab.SortGroup.TOP });

        Main.sessionMode.connect('updated', this._updatePanel.bind(this));

        global.display.connect('workareas-changed', () => this.queue_relayout());
        this._updatePanel();
    }

    // Annotation: [...] Cut out bunch of stuff here, which isn't relevant for
    // this Extension.

    // Annotation: Gets called by `this._init()` to populate the top (menu)bar /
    // panel initially.
    //
    // It does the following relevant stuff:
    // - Calls `this._hideIndicators()`
    // - Calls `this._updateBox()` for `this._leftBox`, `this._centerBox` and
    //   `this._rightBox` with `panel.left`, `panel.center` and `panel.right` to
    //   populate the boxes with items defined in `panel.left`, `panel.center`
    //   and panel.right`.
    //
    //   `panel.left`, `panel.center` and `panel.right` get set via the line
    //   `let panel = Main.sessionMode.panel`, which uses the panel of Mains
    //   (`js/ui/main.js`) instance of SessionMode (`js/ui/sessionMode.js`).
    // 
    //   And in js/ui/sessionMode.js you have different modes with different
    //   panel configurations. For example the "user" mode with:
    //   ```
    //   panel: {
    //       left: ['activities', 'appMenu'],
    //       center: ['dateMenu'],
    //       right: ['dwellClick', 'a11y', 'keyboard', 'aggregateMenu'],
    //   },
    //   ```
    //
    //   This way this function populates the top (menu)bar / panel with the
    //   default stuff you see on a fresh Gnome.
    _updatePanel() {
        let panel = Main.sessionMode.panel;
        this._hideIndicators();
        this._updateBox(panel.left, this._leftBox);
        this._updateBox(panel.center, this._centerBox);
        this._updateBox(panel.right, this._rightBox);

        if (panel.left.includes('dateMenu'))
            Main.messageTray.bannerAlignment = Clutter.ActorAlign.START;
        else if (panel.right.includes('dateMenu'))
            Main.messageTray.bannerAlignment = Clutter.ActorAlign.END;
        // Default to center if there is no dateMenu
        else
            Main.messageTray.bannerAlignment = Clutter.ActorAlign.CENTER;

        if (this._sessionStyle)
            this._removeStyleClassName(this._sessionStyle);

        this._sessionStyle = Main.sessionMode.panelStyle;
        if (this._sessionStyle)
            this._addStyleClassName(this._sessionStyle);

        if (this.get_text_direction() == Clutter.TextDirection.RTL) {
            this._leftCorner.setStyleParent(this._rightBox);
            this._rightCorner.setStyleParent(this._leftBox);
        } else {
            this._leftCorner.setStyleParent(this._leftBox);
            this._rightCorner.setStyleParent(this._rightBox);
        }
    }

    // Annotation: This function hides all items, which are in the top (menu)bar
    // panel and in PANEL_ITEM_IMPLEMENTATIONS.
    _hideIndicators() {
        for (let role in PANEL_ITEM_IMPLEMENTATIONS) {
            let indicator = this.statusArea[role];
            if (!indicator)
                continue;
            indicator.container.hide();
        }
    }

    // Annotation: This function takes a role (of an item) and returns an
    // corresponding indicator, if either of two things are true:
    // - The indicator is already in `this.statusArea`.
    //   Then it just returns the indicator by using `this.statusArea`.
    // - The role is in PANEL_ITEM_IMPLEMENTATIONS.
    //   Then it creates a new indicator, adds it to `this.statusArea` and
    //   returns it.
    _ensureIndicator(role) {
        let indicator = this.statusArea[role];
        if (!indicator) {
            let constructor = PANEL_ITEM_IMPLEMENTATIONS[role];
            if (!constructor) {
                // This icon is not implemented (this is a bug)
                return null;
            }
            indicator = new constructor(this);
            this.statusArea[role] = indicator;
        }
        return indicator;
    }

    // Annotation: This function takes a list of items (or rather their roles)
    // and adds the indicators of those items to a box (like `this._leftBox`)
    // using `this._ensureIndicator()` to get the indicator corresponding to the
    // given role.
    // So only items with roles `this._ensureIndicator()` knows, get added.
    _updateBox(elements, box) {
        let nChildren = box.get_n_children();

        for (let i = 0; i < elements.length; i++) {
            let role = elements[i];
            let indicator = this._ensureIndicator(role);
            if (indicator == null)
                continue;

            this._addToPanelBox(role, indicator, i + nChildren, box);
        }
    }

    // Annotation: This function adds the given item to the specified top
    // (menu)bar / panel box and connects to "destroy" and "menu-set" events.
    //
    // It takes the following arguments:
    // - role: the name of the item to add
    // - indicator: the indicator of the item to add
    // - position: where in the box to add the item
    // - box: the box to add the item to
    //   can be one of the following:
    //      - `this._leftBox`
    //      - `this._centerBox`
    //      - `this._rightBox`
    _addToPanelBox(role, indicator, position, box) {
        let container = indicator.container;
        container.show();

        let parent = container.get_parent();
        if (parent)
            parent.remove_actor(container);


        box.insert_child_at_index(container, position);
        if (indicator.menu)
            this.menuManager.addMenu(indicator.menu);
        this.statusArea[role] = indicator;
        let destroyId = indicator.connect('destroy', emitter => {
            delete this.statusArea[role];
            emitter.disconnect(destroyId);
        });
        indicator.connect('menu-set', this._onMenuSet.bind(this));
        this._onMenuSet(indicator);
    }

    // Annotation: This function allows you to add an item to the top (menu)bar
    // / panel.
    // While per default, it adds the item to the status area (the right box of
    // the top bar), you can specify the box and add the item to any of the
    // three boxes of the top bar.
    // To add an item to the top bar, you need to give its role and indicator.
    //
    // This function takes the following arguments:
    // - role: a name for the item to add
    // - indicator: the indicator for the item to add (must be an instance of
    //   PanelMenu.Button)
    // - position: where in the box to add the item
    // - box: the box to add the item to
    //   can be one of the following:
    //      - "left": referring to `this._leftBox`
    //      - "center": referring to `this._centerBox`
    //      - "right": referring to `this._rightBox`
    //   These boxes are what you see in top bar as the left, right and center
    //   sections.
    //
    // Finally this function just calls `this._addToPanelBox()` for the actual
    // work, so it basically just makes sure the input to
    // `this._addToPanelBox()` is correct.
    addToStatusArea(role, indicator, position, box) {
        if (this.statusArea[role])
            throw new Error('Extension point conflict: there is already a status indicator for role %s'.format(role));

        if (!(indicator instanceof PanelMenu.Button))
            throw new TypeError('Status indicator must be an instance of PanelMenu.Button');

        position = position || 0;
        let boxes = {
            left: this._leftBox,
            center: this._centerBox,
            right: this._rightBox,
        };
        let boxContainer = boxes[box] || this._rightBox;
        this.statusArea[role] = indicator;
        this._addToPanelBox(role, indicator, position, boxContainer);
        return indicator;
    }

    _addStyleClassName(className) {
        this.add_style_class_name(className);
        this._rightCorner.add_style_class_name(className);
        this._leftCorner.add_style_class_name(className);
    }

    _removeStyleClassName(className) {
        this.remove_style_class_name(className);
        this._rightCorner.remove_style_class_name(className);
        this._leftCorner.remove_style_class_name(className);
    }

    _onMenuSet(indicator) {
        if (!indicator.menu || indicator.menu._openChangedId)
            return;

        indicator.menu._openChangedId = indicator.menu.connect('open-state-changed',
            (menu, isOpen) => {
                let boxAlignment;
                if (this._leftBox.contains(indicator.container))
                    boxAlignment = Clutter.ActorAlign.START;
                else if (this._centerBox.contains(indicator.container))
                    boxAlignment = Clutter.ActorAlign.CENTER;
                else if (this._rightBox.contains(indicator.container))
                    boxAlignment = Clutter.ActorAlign.END;

                if (boxAlignment == Main.messageTray.bannerAlignment)
                    Main.messageTray.bannerBlocked = isOpen;
            });
    }

    // Annotation: [...] Cut out bunch of stuff here, which isn't relevant for
    // this Extension.
});
