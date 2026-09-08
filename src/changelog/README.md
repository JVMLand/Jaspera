# Release notes

Each `yyyy.N/` directory contains one JSON page and a full-page JPEG screenshot plus one screenshot per topic for every supported locale (`ja`, `en`, `zh`, `es`, `it`, `fr`, `la`). Older directories stay in place. The version list is discovered automatically; there is no separate index to update.

When bumping the version:

1. Set `package.json` to `yyyy.N.0` and add `yyyy.N/` here.
2. Write the user-visible changes in each locale. Each page has `title`, `introduction`, `imageAlt`, and `sections` (each with `title`, `body`, `image` and `imageAlt`). These are plain text, not HTML.
3. Capture a real screenshot in each language as `<locale>.jpg`. Use a legible viewport and JPEG compression; omit unrelated personal data. Use `<image>-<locale>.jpg` for each topic, where `image` is its stable identifier. Describe every screenshot with its `imageAlt`.
4. Run `tests/changelog-ui.test.mjs` and the production build. Review the full-screen history in light and dark themes.

Pages and screenshots load when the history is opened. The Help menu is available in the main window and detached windows. Automatic display runs only in the main window, after any already-open dialog is closed.

`jaspera.lastVersion` records the last acknowledged version in local storage. A first visit establishes a baseline without opening the history. An upgrade opens the current entry; closing it acknowledges that version. Reloading or using an older build does not repeatedly show it or lower the stored version. Builds released before this feature did not record a version, so their first visit establishes the same baseline.

The 2026.1 images illustrate its existing features. They were captured while preparing the retrospective notes, not from an archived release binary.
