# Release notes

Each `yyyy.N/` or `yyyy.N.P/` directory contains one JSON page for every supported locale (`ja`, `en`, `zh`, `es`, `it`, `fr`, `la`). All locales share one English full-page JPEG screenshot and one English screenshot per topic. Older directories stay in place. The version list is discovered automatically; there is no separate index to update.

When bumping the version:

1. Set `package.json` to `yyyy.N.0` and add `yyyy.N/` here. For a patch release, use `yyyy.N.P` in both places (for example, `2026.2.1`). An omitted patch number compares as zero.
2. Write the user-visible changes in each locale. Each page has `title`, `introduction`, `imageAlt`, and `sections` (each with `title`, `body`, `image` and `imageAlt`). These are plain text, not HTML.
3. When screenshots differ only in UI wording and that wording is not essential to the change being explained, share English screenshots: `en.jpg` for the full page and `<image>-en.jpg` for each topic, where `image` is its stable identifier. Use a legible viewport and JPEG compression; omit unrelated personal data. Keep `imageAlt` localized in each JSON page. Keep language-specific screenshots when the wording itself is essential evidence, such as a translation correction or a language-specific display fix; document that reason here and set `screenshotLocale` on the relevant JSON page to select those images. The existing 2026.1, 2026.2, and 2026.2.1 articles explain features and workflows rather than language-specific wording, so they share English screenshots.
4. Run `tests/changelog-ui.test.mjs` and the production build. Review the full-screen history in light and dark themes.

Pages and screenshots load when the history is opened. The Help menu is available in the main window and detached windows. Automatic display runs only in the main window, after any already-open dialog is closed.

For an exception affecting only one topic, set `screenshotLocale` on that section instead of the whole page, so the other screenshots remain shared.

`jaspera.lastVersion` records the last acknowledged version in local storage. A first visit establishes a baseline without opening the history. An upgrade opens the current entry; closing it acknowledges that version. Reloading or using an older build does not repeatedly show it or lower the stored version. Builds released before this feature did not record a version, so their first visit establishes the same baseline.

The 2026.1 images illustrate its existing features. They were captured while preparing the retrospective notes, not from an archived release binary.
