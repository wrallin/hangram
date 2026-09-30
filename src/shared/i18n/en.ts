import type { Messages } from './index'

const telegramErrors: Record<string, string> = {
  PHONE_NUMBER_INVALID: 'Invalid phone number',
  PHONE_NUMBER_BANNED: 'This number is banned from Telegram',
  PHONE_NUMBER_UNOCCUPIED: 'No account is registered with this number',
  PHONE_NUMBER_FLOOD: 'Too many attempts for this number. Try again later',
  PHONE_PASSWORD_FLOOD: 'Too many login attempts. Try again later',
  PHONE_CODE_INVALID: 'Wrong code',
  PHONE_CODE_EMPTY: 'Enter the code',
  PHONE_CODE_EXPIRED: 'The code has expired. Request a new one',
  PASSWORD_HASH_INVALID: 'Wrong cloud password',
  SESSION_PASSWORD_NEEDED: 'A cloud password is required',
  AUTH_KEY_UNREGISTERED: 'The session is no longer valid (it was logged out on the Telegram side)',
  AUTH_KEY_DUPLICATED: 'The session was used from two addresses at once and revoked by Telegram',
  SESSION_REVOKED: 'The session was terminated from another device',
  SESSION_EXPIRED: 'The session has expired',
  USER_DEACTIVATED: 'The account has been deleted',
  USER_DEACTIVATED_BAN: 'The account is banned by Telegram',
  API_ID_INVALID: 'Invalid api_id / api_hash (check the settings)',
  AUTH_TOKEN_EXPIRED: 'The QR code has expired',
  SEND_CODE_UNAVAILABLE: 'Telegram cannot send the code any other way'
}

export const en: Messages = {
  common: {
    cancel: 'Cancel',
    close: 'Close',
    back: 'Back',
    loading: 'Loading',
    save: 'Save',
    repeat: 'Repeat',
    pin: 'PIN',
    wrongPin: 'Wrong PIN'
  },

  errors: {
    vaultLocked: 'The vault is locked',
    accountNotFound: 'Account not found',
    protectionAlreadyOn: 'Protection is already on',
    protectionOff: 'Protection is off',
    pinTooShort: (min) => `The PIN must be at least ${min} characters long`,
    touchIdNotConfigured: 'Touch ID is not set up',
    touchIdBadKey: 'Touch ID returned an invalid key',
    touchIdEnableFailed: (reason) => `Could not enable Touch ID: ${reason}`,
    pinUnavailable: 'This PIN cannot be used. Choose a different one',
    mainSpaceOnly: 'This is only available in the main space',
    otherSpacesExist:
      'Protection cannot be turned off while hidden spaces exist. Open each one with its PIN and delete it in Settings',
    windowClosed: 'The window is closed',
    invalidInput: 'Invalid input',

    sealedButUnprotected: 'The account data is encrypted but protection is off. Turn protection on with the same PIN',
    passcodeProtected: 'This tdata is locked with a Telegram passcode — the profile can only be viewed in the client itself',
    notLoggedIn: 'This profile is not logged in yet',
    alreadyAdded: (name) => `This account is already added: ${name}`,
    noTdata: 'There is no tdata in the selected folder (key_datas not found)',
    ownFolder: 'This folder already belongs to Hangram',
    tdataCorrupt: 'The tdata is corrupted and cannot be read',
    tdataDuplicate: 'The account from this tdata is already added',
    targetHasTdata: 'The selected folder already contains a tdata',
    profileEmpty: 'This profile has no data yet',
    noRuntime: 'Telegram Desktop is not installed yet',
    launchFailed: (reason) => `Could not start Telegram Desktop: ${reason}`,

    notTelegramDesktop:
      'This is not Telegram Desktop. The App Store version (“Telegram” for macOS) will not work — you need the client from desktop.telegram.org.',
    chooseExecutable: 'Choose the Telegram Desktop executable',
    downloadFailed: (reason) => `Could not download Telegram Desktop: ${reason}`,

    unknownDc: (dcId) => `Unknown data center: ${dcId}`,
    emptyProfile: 'Telegram returned an empty profile',
    noAuthKey: 'Could not obtain the authorization key',
    floodWait: (seconds) => {
      const minutes = Math.ceil(seconds / 60)
      return `Telegram asks you to wait ${minutes >= 2 ? `${minutes} min` : `${seconds} s`} before the next attempt`
    },
    telegram: (code) => `Telegram error: ${code}`,
    network: 'Could not reach Telegram. Check your network connection',

    flowExpired: 'The login session has expired. Start over',
    unexpectedReply: 'Telegram replied unexpectedly. Try logging in inside Telegram Desktop',
    emailRequired:
      'Telegram requires an e-mail to be linked to this account. Use “Log in inside Telegram Desktop” instead',
    badPhone: 'Invalid phone number',
    requestCodeFirst: 'Request a code first',
    phoneUnoccupied: 'No Telegram account is registered with this number',
    loginFailed: 'Login failed',
    badSession: 'This does not look like a Telethon / GramJS session (StringSession)'
  },

  telegramErrors,

  touchIdReason: 'unlock Hangram',

  menu: {
    settings: 'Settings…',
    lock: 'Lock',
    about: (app) => `About ${app}`,
    hide: (app) => `Hide ${app}`,
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quitApp: (app) => `Quit ${app}`,
    file: 'File',
    addAccount: 'Add Account…',
    importTdata: 'Import tdata…',
    closeWindow: 'Close Window',
    quit: 'Exit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    find: 'Find',
    view: 'View',
    fullscreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front'
  },

  dialogs: {
    importTitle: 'Import tdata',
    importMessage: 'Choose a tdata folder (or the Telegram Desktop folder that contains it)',
    importButton: 'Import',
    accountFallback: 'account',
    removeMessage: (name) => `Delete “${name}”?`,
    removeDetail:
      'The tdata folder of this account will be deleted from this computer. The Telegram account itself stays, and its session remains in the device list until you terminate it manually.',
    remove: 'Delete',
    exportTitle: 'Export tdata',
    exportMessage: 'Where should the unencrypted copy of the tdata be saved?',
    exportButton: 'Export',
    chooseTelegramMac: 'Choose Telegram Desktop (Telegram.app from desktop.telegram.org)',
    applications: 'Applications'
  },

  accountMenu: {
    stop: 'Close Telegram',
    launch: 'Open in Telegram',
    edit: 'Edit…',
    pin: 'Pin',
    unpin: 'Unpin',
    refresh: 'Refresh Profile from Telegram',
    revealMac: 'Show in Finder',
    reveal: 'Show in File Manager',
    export: 'Export tdata…',
    remove: 'Delete…'
  },

  account: {
    newProfile: 'New profile',
    passcodeProtected: 'Locked with a Telegram passcode',
    profileNotLoaded: 'Profile not loaded from Telegram yet',
    notLoggedIn: 'Not logged in yet'
  },

  lock: {
    title: 'Hangram is locked',
    text: 'Account data is encrypted. Enter your PIN to continue.',
    unlock: 'Unlock'
  },

  sidebar: {
    all: 'All accounts',
    running: 'Running',
    pinned: 'Pinned',
    tags: 'Tags',
    settings: 'Settings',
    lock: 'Lock'
  },

  list: {
    count: (n) => `${n} ${n === 1 ? 'account' : 'accounts'}`,
    search: 'Search',
    addAccount: 'Add account',
    accounts: 'Accounts',
    telegramRunning: 'Telegram is running',
    open: 'Open',
    close: 'Close',
    needTelegram: 'Telegram Desktop is required',
    needTelegramText: 'The official build will be downloaded from telegram.org (about 200 MB) and its signature verified.',
    installFailed: 'Could not install Telegram Desktop',
    installing: 'Installing Telegram Desktop…',
    downloading: 'Downloading Telegram Desktop…',
    retry: 'Retry',
    download: 'Download',
    emptyTitle: 'No accounts yet',
    emptyText: 'Add the first one: log in by phone number or QR code, or import an existing tdata.',
    nothingFound: 'Nothing found',
    noMatches: (query) => `No accounts match “${query}”.`,
    emptySection: 'Nothing here.'
  },

  add: {
    titles: {
      choose: 'Add account',
      phone: 'Log in by phone',
      code: 'Confirmation code',
      password: 'Cloud password',
      qr: 'Log in by QR code',
      session: 'Session string'
    },
    phoneTitle: 'Phone number',
    phoneText: 'A code from Telegram or SMS, plus the cloud password if it is set',
    qrTitle: 'QR code',
    qrText: 'Scan the code in Telegram on another device',
    desktopTitle: 'Log in inside Telegram Desktop',
    desktopText: 'A clean client opens — log in there as usual',
    desktopNeedsRuntime: 'Download Telegram Desktop first',
    tdataTitle: 'Import tdata',
    tdataText: 'A tdata folder from an already configured Telegram Desktop',
    sessionTitle: 'Session string',
    sessionText: 'A StringSession from Telethon or GramJS',

    phonePrompt: 'Enter the number in international format. Telegram will send a confirmation code.',
    phonePlaceholder: '+1 555 000 0000',
    getCode: 'Get code',
    codeViaApp: 'The code was sent to Telegram on your other devices.',
    codeViaSms: 'The code was sent by SMS.',
    codeViaOther: 'Telegram sent a confirmation code.',
    number: (phone) => `Number: ${phone}`,
    resend: 'Send the code another way',
    next: 'Continue',
    passwordPrompt: 'This account is protected by two-step verification. Enter the cloud password.',
    hint: (hint) => `Hint: ${hint}`,
    passwordPlaceholder: 'Cloud password',
    signIn: 'Log in',
    qrAlt: 'Login QR code',
    tryAgain: 'Try again',
    qrSteps: ['Open Telegram on your phone', 'Settings → Devices → Link Desktop Device', 'Point the camera at this code'],
    sessionPrompt:
      'Paste a StringSession. Hangram will verify it, build a tdata from it and will not keep the string itself anywhere.',
    import: 'Import'
  },

  edit: {
    title: 'Account',
    sources: {
      phone: 'Phone login',
      qr: 'QR login',
      session: 'Session string',
      tdata: 'tdata import',
      desktop: 'Login inside Telegram Desktop'
    },
    name: 'Name',
    tags: 'Tags',
    tagsHint: 'Comma-separated',
    tagsPlaceholder: 'work, personal',
    pinToTop: 'Pin to the top of the list',
    note: 'Note',
    details: 'Details',
    phone: 'Phone',
    username: 'Username',
    dc: 'Data center',
    added: 'Added',
    lastLaunch: 'Last launched',
    never: 'never'
  },

  settings: {
    title: 'Settings',
    tabs: { security: 'Protection', telegram: 'Telegram', general: 'General', about: 'About' },

    autoLock: (minutes) =>
      minutes === 0 ? 'Never' : minutes === 60 ? '1 hour' : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,

    pinMismatch: 'The PINs do not match',
    newPinMismatch: 'The new PINs do not match',
    protectionIntro:
      'With protection on, every tdata and the account list are encrypted (AES-256-GCM). Only the profile currently open in Telegram is decrypted; on lock, clients are closed and everything is sealed again.',
    pinFooter:
      'Digits or a regular password both work. Longer is better: a short PIN can be brute-forced if someone takes the files. A forgotten PIN cannot be recovered.',
    pinPlaceholder: 'at least 4 characters',
    enable: 'Turn on protection',

    locking: 'Locking',
    touchId: 'Unlock with Touch ID',
    touchIdHint: 'The key lives in the Secure Enclave and is released only on a fingerprint match',
    lockOnIdle: 'Lock when idle',
    lockOnSleep: 'Lock on sleep and screen lock',
    pinFooterManage: 'Locking closes open Telegram clients — otherwise their data would stay decrypted.',
    changePin: 'Change PIN',
    change: 'Change…',
    disable: 'Turn off protection',
    disableHint: 'All data will be decrypted',
    disableButton: 'Turn off…',
    changingPin: 'Changing the PIN',
    disabling: 'Turning off protection',
    currentPin: 'Current PIN',
    newPin: 'New PIN',
    decryptAndDisable: 'Decrypt and turn off',

    hiddenSpace: 'Hidden space',
    hiddenSpaceHint: 'A separate account list behind another PIN',
    addSpace: 'Add…',
    addingSpace: 'New hidden space',
    addSpaceFooter:
      'The PIN entered on the lock screen decides which list opens. To get into the new space, lock Hangram and enter this PIN. It is not shown anywhere in the interface; a forgotten PIN cannot be recovered.',
    spacePin: 'Space PIN',
    createSpace: 'Create',
    removeSpace: 'Delete this space',
    removeSpaceHint: 'Its accounts will be deleted from this computer',
    removeSpaceButton: 'Delete…',
    removingSpace: 'Deleting the space',
    removeSpaceConfirm: 'Delete the space and its accounts',

    runtimeVersion: (version, custom) => `Version ${version}${custom ? ' · custom build' : ''}`,
    downloading: (percent) => `Downloading…${percent === null ? '' : ` ${percent}%`}`,
    installing: 'Installing…',
    notInstalled: 'Not installed',
    telegramFooter: 'Each account opens in its own window of the official client, with its own data folder.',
    client: 'Client',
    closeClientsFirst: 'Close the running clients first',
    reinstall: 'Reinstall',
    download: 'Download',
    customBuild: 'Custom build',
    customBuildHint: 'Use a Telegram Desktop that is already installed',
    reset: 'Reset',
    choose: 'Choose…',
    noUpdates: 'Prevent the client from updating',
    noUpdatesHint: 'Starts it with -noupdate',
    apiTitle: 'API for phone and QR login',
    apiFooter:
      'By default the credentials of Telegram Desktop itself are used, so the session looks the same to Telegram before and after it is handed to the client. You can get your own at',
    byDefault: 'default',

    language: 'Language',
    languageSystem: 'System default',

    version: (version) => `Version ${version}`,
    aboutText:
      'A launcher and vault for Telegram Desktop accounts. Data stays on this computer; the app only goes online to log in to an account, to refresh a profile when you ask, and to download the client from telegram.org.',
    notOfficial: 'Not an official Telegram product.'
  }
}
