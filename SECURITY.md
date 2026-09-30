# Security Policy

Hangram stores logged-in Telegram sessions, so security reports are taken seriously and handled
before anything else.

## Reporting a vulnerability

Please report privately through GitHub: open the **Security** tab of this repository and choose
**Report a vulnerability**. Do not open a public issue or pull request for a security problem.

Useful things to include:

- what an attacker needs (local access, a stolen data folder, a malicious file to import, etc.);
- what they gain;
- steps to reproduce, Hangram version and OS.

Do not include real session data. A `tdata` folder or a session string is a working login.

You can expect a first reply within a week. Once a fix is released, the report is published as an
advisory with credit to the reporter, unless you prefer to stay anonymous.

## Supported versions

Only the latest release receives fixes.

## Scope

In scope:

- recovering sessions, keys or the account list from a locked vault without the PIN;
- weaknesses in key derivation, encryption or the sealed container format;
- plaintext left behind after locking that the README does not already describe;
- the renderer escaping its sandbox or reaching main-process functionality outside the IPC contract;
- accepting a tampered Telegram Desktop download.

Known limitations, documented in the README and not considered vulnerabilities:

- a short PIN can be brute-forced offline from stolen files;
- the existence and number of hidden spaces is visible in the files on disk; only their contents
  are protected;
- a profile is in plaintext on disk while its Telegram client is running;
- deleted files cannot be reliably wiped from SSDs;
- traces the operating system or Telegram Desktop leave outside the data folder;
- an attacker who already runs code as your user while the vault is unlocked.

Vulnerabilities in Telegram Desktop itself should be reported to Telegram.

## About the release binaries

Release builds are produced by GitHub Actions from the tagged commit. They are not signed with a
developer certificate, so the operating system cannot verify the publisher. If that matters to you,
build from source.
