Top Bar Organizer Plus v17.2 includes the following changes:

# Changes

## Bug Fixes & Refactoring
- **AppIndicators**: Prune awaiting-ready indicators upon destruction to prevent "No signal connection found" crashes during disable. Thanks to @riodevelop for the initial report and fix in PR #4! (#5, PR #7)
- **Lifecycle Management**: Track `enable()` cleanup actions deterministically on a stack rather than unconditionally reverting them. This ensures safe teardowns even if `enable()` fails mid-setup or if GNOME Shell forces an unconditional extension rebase. (#6)

## Documentation & Metadata
- **README**: Added detailed contribution guidelines.
- **Metadata**: Updated GNOME Extensions (EGO) URL and description to point to the new extension page. (#3)

# `git shortlog`

The git shortlog for this version:

```
Shibasish Paul (5):
      docs: Enhance contribution section in README
      fix: update EGO link to point to the new extension
      doc: update EGO description
      fix(appindicator): prune awaiting-ready indicators on destroy
      refactor(extension): track enable() teardowns instead of guessing from nulls
```
