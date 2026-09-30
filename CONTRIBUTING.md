# Contributing to Hangram

Thanks for taking the time. This is a small project, so the process is light.

## Before you start

- **Bugs**: open an issue using the bug report form. Include your OS, the Hangram version and the
  Telegram Desktop version shown in Settings.
- **Features**: open an issue first and describe the problem you want solved. It saves you from
  writing a pull request that does not fit.
- **Security problems**: do not open a public issue. See [SECURITY.md](SECURITY.md).

Never attach a `tdata` folder, a session string, `vault.json`, or a screenshot showing phone
numbers or login codes. Anyone holding a `tdata` or a session string is logged in to that account.

## Setup

You need Node.js 22 and npm. On macOS the Xcode command line tools are needed for the Touch ID
helper; everything else builds without them.

```bash
npm install
npm run dev
```

Development builds use the same data folder as the installed app. To keep your real accounts out of
the way, point it somewhere else:

```bash
HANGRAM_DATA_DIR=/tmp/hangram-dev npm run dev
```

## Checks

Run these before opening a pull request. CI runs the same ones on release.

```bash
npm run typecheck
npm test
```

## Code

- TypeScript, strict. Match the style of the file you are editing.
- The renderer has no access to Node.js. Anything it needs goes through the IPC contract in
  `src/shared/ipc.ts` and is validated with a zod schema in the main process.
- Comments explain why, not what.
- User-facing strings live in `src/shared/i18n`. Add every new string to both `ru.ts` and `en.ts`;
  `ru.ts` defines the shape, and the type checker flags a key missing from `en.ts`.

Changes under `src/main/core` (crypto, vault, sealing) and `src/main/tdata` need a test. These are
the parts where a mistake costs someone their accounts.

Changing anything that ends up on disk — file formats, key derivation labels, container layout —
breaks existing vaults. If a change like that is really needed, it must come with a migration, and
the pull request should say so up front.

## Pull requests

- One topic per pull request.
- Describe what changed and how you checked it. For UI changes, add a screenshot.
- Say which platforms you tested on. Not having all three is fine, just be clear about it.

## License

By contributing you agree that your work is released under the project's
[GPL-3.0 license](LICENSE).
