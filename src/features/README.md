# Feature templates and translations

Keep a feature's HTML, UI module, styles and `locales/*.json` together. Shared labels
belong in `common/locales`. The supported locales are defined once in
`../i18n/locales.json`. Every feature supplies the same set of locale files.

For example, the language settings dialog lives in `language/settings.html`,
`language/settings.ts`, `language/settings.css` and `language/locales/*.json`.
The help, search, offline and detached-tool dialogs follow the same pattern.
Other existing modules can consume their feature catalog without being moved.

## Message keys

Use stable names describing the feature and purpose, such as `language.choose`
or `help.manual.debug.stepping`. Change the translated value when wording changes;
do not generate a new key from the text. Keys are globally unique across features.
Use `{0}`, `{1}`, etc. for runtime values, with matching slots in every locale.

`msg(key)` produces canonical Japanese text for model/worker state.
`displayMessage(key)` produces the selected language for presentation. Both accept
the generated `MessageKey` type. Existing source-text translation is retained for
compiler diagnostics and vendor instruction documentation. Its intentional indirect
keys are listed in `scripts/check-localization.mjs`.

## HTML templates

```html
<label for="language-select">{{language.choose}}</label>
```

Import HTML with `?raw` and call `renderTemplate(template)`. The renderer escapes
all message values and `{{@0}}` positional parameters, including in attributes.
Use `renderTemplate(template, values, true)` when rendering the selected language
directly. Such views must refresh on `jaspera:locale`, as the help view does.
Canonical templates continue to use the presentation translation adapter.

Rich paragraphs keep their permitted elements in the template:

```html
<p data-i18n-rich="help.manual.debug.stepping">
  <kbd data-slot="kbd"></kbd>
</p>
```

The corresponding text can say `{kbd}F8{/kbd} resumes execution.` Slots may repeat
or move to suit the language. These are text placeholders, not HTML: the renderer
clones only elements declared by the template and inserts text with DOM text nodes.
Paragraphs, tables, IDs, classes and other UI structure never belong in catalogs.
JVM names such as `<init>` are ordinary text and are escaped when rendered.

## Checks and generation

`pnpm run generate` validates feature catalogs and creates ignored runtime catalog
modules and key types under `src/generated`. Edit the feature files, never those
generated files. Other languages remain lazy-loaded. Adding a feature does not
require maintaining a central import list.

Generation checks missing/extra keys and locale files, empty values, duplicate keys
across features, positional slots, rich slots, raw HTML, opaque keys, direct source
references, template references and unreferenced keys. Type checking covers typed
message calls, including keys passed through variables. Browser tests exercise all
supported languages and the help templates. These checks cannot judge translation
quality or detect arbitrary prose hard-coded outside the translation system.
