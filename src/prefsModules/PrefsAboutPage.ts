"use strict";

import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";

import { getPrefsMetadata, getPrefsDir } from "./prefsContext.js";

const UPSTREAM_PROJECT_URL = "https://gitlab.gnome.org/june/top-bar-organizer";

export default class PrefsAboutPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({
            GTypeName: "PrefsAboutPage",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-about-page.ui", GLib.UriFlags.NONE),
            InternalChildren: [
                "name-label",
                "version-label",
                "description-label",
            ],
        }, this);
    }

    declare _name_label: Gtk.Label;
    declare _version_label: Gtk.Label;
    declare _description_label: Gtk.Label;
    // The extension's homepage, as declared in metadata.json - the only
    // link metadata.json actually has a recognized field for (see
    // `loadExtensionMetadata` in GNOME Shell's own extensionUtils.js, which
    // only requires/reads uuid/name/description/shell-version; "url" is a
    // separately-established convention, not a distinct "repository"/
    // "bugs" field). "Report an Issue" and "Source Code" below are derived
    // from it rather than stored separately.
    #homepageUrl: string;

    constructor(params = {}) {
        super(params);

        const metadata = getPrefsMetadata();
        this.#homepageUrl = metadata.url as string;

        this._name_label.set_label(metadata.name as string);
        this._version_label.set_label(`Version ${metadata["version-name"] ?? metadata.version}`);
        this._description_label.set_label(metadata.description as string);
    }

    onHomepageActivated(): void {
        this.#launchUri(this.#homepageUrl);
    }

    onIssuesActivated(): void {
        this.#launchUri(`${this.#homepageUrl}/issues`);
    }

    onUpstreamActivated(): void {
        this.#launchUri(UPSTREAM_PROJECT_URL);
    }

    onLicenseActivated(): void {
        // Shipped verbatim as COPYING alongside the rest of the extension's
        // files (see package.sh) - opened locally instead of linking out,
        // so what's shown is always exactly what this specific version was
        // distributed under.
        const copyingFile = getPrefsDir().get_child("COPYING");
        const launcher = new Gtk.FileLauncher({ file: copyingFile });
        launcher.launch(this.get_root() as Gtk.Window, null, (_source, result) => {
            try {
                launcher.launch_finish(result);
            } catch (e) {
                console.error(`top-bar-organizer-plus: failed to open COPYING: ${e}`);
            }
        });
    }

    #launchUri(uri: string): void {
        const launcher = new Gtk.UriLauncher({ uri });
        launcher.launch(this.get_root() as Gtk.Window, null, (_source, result) => {
            try {
                launcher.launch_finish(result);
            } catch (e) {
                console.error(`top-bar-organizer-plus: failed to open "${uri}": ${e}`);
            }
        });
    }
}
