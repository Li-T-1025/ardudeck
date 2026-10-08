# Translating ArduDeck

ArduDeck ships in English and German. If you fly in another language and want ArduDeck to speak it, this guide is for you. You do not need to know React or TypeScript: a translation is a folder of JSON files.

> **Before you start: the license agreement is required.** Every contribution to ArduDeck, translations included, requires accepting the [Contributor License Agreement](CLA.md). Your pull request description must contain this exact line:
>
> ```
> I have read and agree to the ArduDeck Contributor License Agreement (CLA.md).
> ```
>
> Pull requests without it are closed automatically. Add the line to the description and the pull request reopens by itself. Once you have accepted it in one pull request, your later ones are covered.

Questions, or want to tell others you are working on a language so nobody duplicates it? Post in the [community forum](https://forum.ardudeck.com) or on [Discord](https://discord.gg/JX2JdVXPPC).

---

## How it works

All text lives in `apps/desktop/src/shared/i18n/locales/`:

```
locales/
  en/          English, the source of truth
    common.json
    mission.json
    parameters.json
    ...        one file per area of the app (55 files)
  de/          German, same files, same keys
```

Each file maps keys to text. The keys stay exactly as they are; you only translate the values:

```json
{
  "waypointTable": {
    "holdTime": "Hold time",
    "deleteConfirm": "Delete {{count}} waypoints?"
  }
}
```

A new folder is picked up automatically: once `locales/fr/` exists, French appears in **Settings > Language**, named in its own language ("Français"). Anything you have not translated yet falls back to English, so you can ship a partial translation and fill it in over time.

---

## Starting a new language

1. Fork the repository and set it up (see [Building from Source](README.md#building-from-source)).
2. Copy the English folder and name it after the [language code](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) (`fr`, `es`, `pl`, `pt-BR` ...):
   ```bash
   cp -r apps/desktop/src/shared/i18n/locales/en apps/desktop/src/shared/i18n/locales/fr
   ```
3. Translate the values file by file. Good files to start with, because they are what everyone sees first: `common.json`, `navigation.json`, `connection.json`, `settings.json`, `telemetry.json`, `mission.json`.
4. Run the app (`pnpm dev`), pick your language in **Settings > Language**, and look at your text in place. Labels sit in tight spaces; seeing them is the only way to know they fit.
5. Check your files (see [Checking your work](#checking-your-work)) and open a pull request.

Improving an existing language works the same way: edit the files in its folder.

---

## Rules for the text

### Keep these exactly as they are

- **Placeholders** in double braces: `{{count}}`, `{{name}}`, `{{speed}}`. Move them wherever your grammar needs them, but do not rename, translate or drop them.
- **Tags** in angle brackets: `<b>Arm</b>` becomes `<b>...</b>` around your translated word. Keep the same tags.
- **Keys**: never rename, add or remove keys. If English has a key, your file has the same key.

### Do not translate

- Flight mode names: Loiter, RTL, Stabilize, AltHold, Guided, Auto ...
- Parameter names (`ARMING_CHECK`, `SERVO9_MIN`), MAVLink message and command names (`HEARTBEAT`, `MAV_CMD_*`).
- Brand, product, board and protocol names: ArduPilot, Betaflight, iNav, MAVLink, ExpressLRS, CRSF, Matek ...
- Unit symbols: m/s, km/h, V, mAh, Hz, °.
- Keyboard shortcuts: Ctrl+Z.

Text that comes from the flight controller itself (parameter descriptions, messages from the vehicle) is not in these files and stays in English; that is expected.

### Plurals

Some keys come in pairs ending in `_one` and `_other`:

```json
"waypoints_one": "{{count}} waypoint",
"waypoints_other": "{{count}} waypoints"
```

Use the plural forms your language has. French needs `_one` and `_other`; Polish, Russian and Czech also need `_few` and `_many`; Arabic adds `_zero` and `_two`; Japanese and Chinese use only `_other`. The [i18next plural guide](https://www.i18next.com/translation-function/plurals) lists the forms for every language.

### Style

- **Short wins.** Many labels sit on buttons and in instrument readouts. If your language runs long, prefer the shortest correct term over a literal translation.
- **Use the words pilots use.** Where pilots in your language say the English word (arm, failsafe, geofence), keep it. A dictionary translation nobody uses on the field is worse than the English.
- **Be consistent.** Pick one word for vehicle, waypoint, flight controller and so on, and keep it everywhere. Writing a short glossary helps; see [`tools/i18n/glossary-de.md`](tools/i18n/glossary-de.md) for the German one, and feel free to add `glossary-<code>.md` for yours.
- **No em dashes** (the long dash). Use a comma, a colon or a plain hyphen instead. The checker rejects them.

---

## Checking your work

From the repository root:

```bash
node tools/i18n/verify-locale.mjs fr
```

It compares your folder against English and reports:

| Message | What to do |
|---|---|
| `missing <key>` | A key English has and you do not. Translate it (or leave it out for now; it shows in English). |
| `extra key <key>` | A key English does not have. Usually a typo in the key or a key that was renamed; remove it. |
| `placeholders differ` | A `{{...}}` was changed or dropped. Copy it back exactly. |
| `tags differ` | A `<b>`-style tag was changed or dropped. |
| `em dash` | Replace the long dash. |
| `INVALID JSON` | A missing comma or quote. Most editors highlight the line. |

The last line counts strings that are still identical to English, which is a quick way to find what is left. You can check single files too: `node tools/i18n/verify-locale.mjs fr mission settings`.

A partial translation is welcome; missing keys simply show in English. Problems with placeholders, tags or JSON must be fixed before merging, because they break the text on screen.

---

## Keeping a translation up to date

The app keeps changing, and new English text arrives with it. To see what is new for your language after pulling the latest code, run the checker again: every `missing` line is a new string. Contributors adding features write the English (and German) text; other languages catch up through translators, and until then the new text shows in English.

If you maintain a language long-term, say so in your pull request: we can add it to the automatic checks so changes that break it are caught before they land.

---

## Submitting

Open a pull request with your language folder (and glossary, if you wrote one). Its description must contain the license line from the top of this guide (`I have read and agree to the ArduDeck Contributor License Agreement (CLA.md).`), or it is closed automatically. Screenshots of a few screens in your language are a great help for review.

Thank you for helping pilots fly in their own language.
