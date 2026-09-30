# Hangram

An encrypted vault and account manager for Telegram Desktop on macOS, Windows and Linux.

It does two jobs:

- **Launcher.** Every account gets its own `tdata` folder. Clicking an account starts the official
  Telegram Desktop client with `-workdir`, i.e. in portable mode, so accounts know nothing about
  each other.
- **Vault.** Sessions are kept encrypted at rest with AES-256-GCM behind a PIN and/or Touch ID. A
  profile is decrypted only while its client is open and sealed again the moment it closes.

Hangram does not modify Telegram and is not a client itself. It stores profiles, encrypts them and
starts the real Telegram Desktop with the right one.

## 🤔 Why

Telegram Desktop lets you add several accounts, but they share one window and one `tdata`. If you
have many accounts, or need to keep them apart, the usual answer is a pile of portable client copies
in different folders and a good memory.

Those folders are also the weak spot. A `tdata` is a logged-in session: whoever copies it gets into
the account without a code or a password. Telegram's own local passcode is optional and per-profile,
and most portable copies just lie around unprotected.

Hangram keeps the convenience and fixes the storage:

- one list of accounts with avatars, labels, tags and notes;
- one Telegram Desktop install for all profiles instead of a copy per account;
- several accounts open at once, each in its own window;
- everything is encrypted when not in use: sessions, and the account list itself with names and
  phone numbers. A stolen folder is useless without the PIN;
- it works as cold storage too: accounts you rarely open can sit sealed for months.

## ✨ Features

**Adding accounts**

| Method                         | What happens                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Phone number                   | login code, then the cloud password if set; a `tdata` is built from the resulting session |
| QR code                        | same, but the login is confirmed from another device                                      |
| Log in inside Telegram Desktop | a clean client opens and you log in there                                                 |
| Import `tdata`                 | an existing folder is copied; the media cache is left behind                              |
| Session string                 | a Telethon or GramJS StringSession is converted into a `tdata`                            |

**Managing**

- labels, tags, notes, pinning, search;
- export a `tdata` back to a plain folder;
- refresh name and avatar from Telegram;
- your own `api_id` / `api_hash` instead of the ones Telegram Desktop uses;
- your own Telegram Desktop build instead of the managed one, with its auto-updates optionally off.

**Protection**

- PIN, auto-lock on idle and on sleep;
- Touch ID on macOS;
- hidden spaces: a second PIN opens a completely different account list;
- locking closes every client and seals every profile.

Shortcuts: `Ctrl/Cmd+N` add account, `Ctrl/Cmd+O` import `tdata`, `Ctrl/Cmd+L` lock,
`Ctrl/Cmd+,` settings.

## 📦 Install

Prebuilt packages are on the [Releases](../../releases) page.

| Platform             | File                 |
| -------------------- | -------------------- |
| macOS, Apple Silicon | `…-mac-arm64.dmg`    |
| macOS, Intel         | `…-mac-x64.dmg`      |
| Windows 10/11, x64   | `…-win-x64.exe`      |
| Linux, x64           | `…-linux-….AppImage` |

Each build comes in two flavours:

- **regular** — Telegram Desktop is bundled, works right away;
- **lite** (`-lite` suffix) — several times smaller, the client is downloaded from telegram.org on
  first launch.

The App Store version ("Telegram for macOS") will not work: it is a different client with a different
data format. Hangram only works with Telegram Desktop from desktop.telegram.org.

### Why your OS complains on first launch

The builds are not signed with paid developer certificates. A certificate does not make a program
safer; it states who published it and that the file was not altered on the way. Without one the
operating system does not know the publisher and says so. The check only applies to files downloaded
from the internet: the browser tags them.

**macOS.** You will get an "Apple could not verify" dialog. Open System Settings → Privacy & Security,
scroll down and click "Open Anyway". Or drop the quarantine flag in a terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Hangram.app
```

The same command helps if macOS claims the app "is damaged".

**Windows.** SmartScreen shows "Windows protected your PC". Click "More info" → "Run anyway".

**Linux.** The file needs the executable bit, and AppImage needs FUSE (the `libfuse2` package on
Ubuntu 22.04 and later):

```bash
chmod +x Hangram-*.AppImage
```

If you would rather not trust someone else's binary, build from source — see below. Anything built
on your own machine runs without warnings.

## ⚙️ How it works

### Starting a client

Telegram Desktop can run from an arbitrary working directory: `Telegram -workdir <path>`. Hangram
starts one process per account, each with its own folder. The processes are detached: if you quit
Hangram with protection turned off, the clients keep running, and the next launch picks them up again
from a saved pid.

The client itself comes from the package (regular build) or from telegram.org (lite). On macOS the
download is checked to be signed by Telegram FZ-LLC before it is installed; a fake will be rejected.
After that the client updates itself as usual.

### Where the data lives

| OS      | Path                                         |
| ------- | -------------------------------------------- |
| macOS   | `~/Library/Application Support/Hangram/data` |
| Windows | `%APPDATA%\Hangram\data`                     |
| Linux   | `~/.config/Hangram/data`                     |

Override it with the `HANGRAM_DATA_DIR` environment variable.

```
data/
  settings.json            settings, always plain text
  vault.json               master keys, one per space, each wrapped with its PIN
  accounts.enc             account list (accounts.json when protection is off)
  accounts.<id>.enc        account list of a hidden space
  accounts/<id>/
    tdata.sealed           encrypted profile
    tdata/                 decrypted profile, while its client is open
  runtime/                 Telegram Desktop
```

### 🔐 Encryption

```
PIN ── scrypt (N=2^17) ──► key ── AES-256-GCM ──► master key ── HKDF ──► account database key
                                                                    └──► one key per tdata
```

- The master key is random. The PIN only unwraps it, so changing the PIN does not re-encrypt
  profiles.
- A `tdata` is decrypted only while its client is open. On lock — manual, idle, sleep or quit —
  clients are closed, profiles are sealed and the key is wiped from memory.
- Touch ID: the master key is additionally encrypted to a Secure Enclave key. Decryption is done by
  the chip itself and only after a fingerprint match; if the enrolled fingerprints change, the key
  becomes invalid and the PIN is the way back in.
- The media cache (`tdata/user_data`) is not re-encrypted: Telegram already encrypts it with its
  local key, and that key is inside the sealed container.

### Hidden spaces

A vault can hold more than one account list. Each list, or space, has its own PIN and its own
master key, and the PIN typed on the lock screen decides which one opens. Nothing in the interface
of one space mentions the others: there is no switcher, no counter and no list of spaces.

A new space is created in Settings → Protection. To enter it, lock Hangram and type its PIN.
Touch ID always opens the main space. Protection cannot be turned off while hidden spaces exist,
because their data cannot be decrypted without their PINs; a hidden space is deleted from inside,
together with its accounts.

This hides a space from someone looking at the screen, not from someone examining the disk:
`vault.json` shows how many spaces there are, and the `accounts` folder holds the profiles of all
of them. What stays secret without the PIN is what is inside.

### ⚠️ What this does not protect against

- **A short PIN.** If the files are stolen, the PIN can be brute-forced offline. scrypt makes every
  guess expensive, but four digits is only 10,000 guesses. Use a long one.
- **An open client.** While Telegram is running, its `tdata` is on disk in the clear.
- **SSDs.** Deleted files on solid-state drives cannot be reliably wiped.
- **Traces outside the data folder.** `-workdir` only relocates Telegram's own data. Whatever the
  operating system writes stays in shared places: notification text, downloaded files
  (`Downloads/Telegram Desktop` by default), system caches and window state, camera and microphone
  permissions, crash reports.
- **Size and timing.** The number of accounts and the size of their caches are visible from the
  files even when locked.
- **The server side.** Logging in by phone, QR or session string creates a new session that Telegram
  sees with a device model and OS version, like any other login.

## 🛠 Building from source

You need Node.js 22 and npm. On macOS, Touch ID support also needs the Xcode command line tools;
without them everything still builds, just without that option.

```bash
npm install
npm run dev        # run in development mode
npm test           # tests
npm run dist       # package with Telegram Desktop bundled
npm run dist:lite  # package without the client
```

Output goes to `dist/`. `npm run dist` builds for the OS it runs on.

### Releases

Builds for all platforms are made by GitHub Actions, see
[.github/workflows/release.yml](.github/workflows/release.yml). The workflow runs on a version tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Six packages are built (three operating systems, regular and lite), the version is taken from the
tag, and the files are attached to a draft release. The draft is then reviewed and published by hand.

## Project layout

```
src/shared      types and the IPC contract between processes
src/main        main process
  core/         crypto, key vault, tdata sealing, account database
  tdata/        reading and writing the tdata format
  mtproto/      login by phone, QR and session string
  telegram/     fetching the client and managing its processes
  services/     account lifecycle
src/preload     bridge between the UI and the main process
src/renderer    React UI
native/         Swift helper: Touch ID and graceful client shutdown on macOS
```

Built with Electron and TypeScript. The UI runs sandboxed with no access to Node.js; every request
goes through a single IPC channel and is validated with zod schemas.

## 🤝 Contributing

Bug reports, ideas and pull requests are welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md).
Found a security problem? Please do not open a public issue; see [SECURITY.md](SECURITY.md).

## Disclaimer

Hangram is an independent project and is not affiliated with Telegram. Telegram Desktop is
distributed by its authors under their own terms. Running many accounts, or logging in with
unofficial `api_id` values, may get you restricted by Telegram; following its rules is on you.

## 📄 License

[GPL-3.0](LICENSE). You may use, modify and redistribute Hangram, provided derivative works stay
under the same license and ship with their source.
