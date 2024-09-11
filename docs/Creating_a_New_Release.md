# Creating a Release

## Create a Tag

To create a new tag, do the following:

1. Fill out `git_annotated_tag_template`.
2. Run the following command to tag the current commit with `vX`:

   ```
   git tag -a -F git_annotated_tag_template -s --cleanup=verbatim vX
   ```

3. Restore `git_annotated_tag_template` to its original state:

   ```
   git restore git_annotated_tag_template
   ```

4. Push the tag:

   ```
   git push --tags
   ```

## Build a Release-ZIP

1. Build the release-ZIP:

   ```
   ./package.sh
   ```

2. Name the release-ZIP after the current version:

   ```
   mv top-bar-organizer@julian.gse.jsts.xyz.shell-extension.zip top-bar-organizer@julian.gse.jsts.xyz.shell-extension_vX.zip
   ```

## Create a GitLab Release

1. Go to the [Releases section of the repo](https://gitlab.gnome.org/june/top-bar-organizer/-/releases) and click on the "New Release" button.
2. Select the corresponding tag created earlier.
3. Name the release "Top Bar Organizer vX".
4. Copy the [release notes template](./release_notes_template.md) and fill it out.
5. Drop the release-ZIP created in the previous step at the end of the release notes.
6. Create the release.

## Uploading to the GNOME Extensions Website

1. Go to the [upload page of the GNOME extensions website](https://extensions.gnome.org/upload/) and upload the release-ZIP.
