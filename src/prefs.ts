"use strict";

import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import type Adw from "gi://Adw";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import PrefsPage from "./prefsModules/PrefsPage.js";
import PrefsGroupsPage from "./prefsModules/PrefsGroupsPage.js";
import PrefsSettingsPage from "./prefsModules/PrefsSettingsPage.js";
import PrefsAboutPage from "./prefsModules/PrefsAboutPage.js";

export default class TopBarOrganizerPreferences extends ExtensionPreferences {
    // `fillPreferencesWindow` (rather than `getPreferencesWidget`) lets more
    // than one page be added to the window as sidebar entries.
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const provider = new Gtk.CssProvider();
        provider.load_from_path(this.metadata.dir.get_path() + "/css/prefs.css");
        const defaultGdkDisplay = Gdk.Display.get_default();
        Gtk.StyleContext.add_provider_for_display(
            (defaultGdkDisplay as Gdk.Display),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        window.connect("destroy", () => {
            Gtk.StyleContext.remove_provider_for_display(
                (defaultGdkDisplay as Gdk.Display),
                provider
            );
        });

        window.add(new PrefsPage());
        window.add(new PrefsGroupsPage());
        window.add(new PrefsSettingsPage());
        window.add(new PrefsAboutPage());
    }
}
