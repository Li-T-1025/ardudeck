# Fonts

`antonio-variable.woff2` is the latin subset of [Antonio](https://fonts.google.com/specimen/Antonio),
served by Google Fonts and vendored here so the app never fetches a font at runtime.

Licence: SIL Open Font License 1.1, which permits bundling in this application.

Used by the Bridge theme for headings, labels and console captions
(`--bridge-display` in `renderer/styles/globals.css`). Every rule that uses it
falls back to a condensed system stack, so the theme still reads if the file is
ever missing.
