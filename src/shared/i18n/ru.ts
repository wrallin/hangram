function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const telegramErrors: Record<string, string> = {
  PHONE_NUMBER_INVALID: 'Неверный номер телефона',
  PHONE_NUMBER_BANNED: 'Этот номер заблокирован в Telegram',
  PHONE_NUMBER_UNOCCUPIED: 'На этот номер не зарегистрирован аккаунт',
  PHONE_NUMBER_FLOOD: 'Слишком много попыток для этого номера. Попробуйте позже',
  PHONE_PASSWORD_FLOOD: 'Слишком много попыток входа. Попробуйте позже',
  PHONE_CODE_INVALID: 'Неверный код',
  PHONE_CODE_EMPTY: 'Введите код',
  PHONE_CODE_EXPIRED: 'Код устарел. Запросите новый',
  PASSWORD_HASH_INVALID: 'Неверный облачный пароль',
  SESSION_PASSWORD_NEEDED: 'Требуется облачный пароль',
  AUTH_KEY_UNREGISTERED: 'Сессия больше не действительна (выход выполнен на стороне Telegram)',
  AUTH_KEY_DUPLICATED: 'Сессия была использована с двух адресов одновременно и аннулирована Telegram',
  SESSION_REVOKED: 'Сессия завершена с другого устройства',
  SESSION_EXPIRED: 'Сессия истекла',
  USER_DEACTIVATED: 'Аккаунт удалён',
  USER_DEACTIVATED_BAN: 'Аккаунт заблокирован Telegram',
  API_ID_INVALID: 'Неверные api_id / api_hash (проверьте настройки)',
  AUTH_TOKEN_EXPIRED: 'QR-код устарел',
  SEND_CODE_UNAVAILABLE: 'Telegram не может отправить код другим способом'
}

/** The source dictionary: its shape is the contract every other language must satisfy. */
export const ru = {
  common: {
    cancel: 'Отмена',
    close: 'Закрыть',
    back: 'Назад',
    loading: 'Загрузка',
    save: 'Сохранить',
    repeat: 'Ещё раз',
    pin: 'PIN-код',
    wrongPin: 'Неверный PIN-код'
  },

  errors: {
    vaultLocked: 'Хранилище заблокировано',
    accountNotFound: 'Аккаунт не найден',
    protectionAlreadyOn: 'Защита уже включена',
    protectionOff: 'Защита выключена',
    pinTooShort: (min: number) => `PIN-код должен быть не короче ${min} символов`,
    touchIdNotConfigured: 'Touch ID не настроен',
    touchIdBadKey: 'Touch ID вернул неверный ключ',
    touchIdEnableFailed: (reason: string) => `Не удалось включить Touch ID: ${reason}`,
    pinUnavailable: 'Этот PIN-код использовать нельзя. Выберите другой',
    mainSpaceOnly: 'Это действие доступно только в основном пространстве',
    otherSpacesExist:
      'Защиту нельзя выключить, пока есть скрытые пространства. Войдите в каждое под его PIN-кодом и удалите его в настройках',
    windowClosed: 'Окно закрыто',
    invalidInput: 'Некорректные данные',

    sealedButUnprotected: 'Данные аккаунта зашифрованы, но защита выключена. Включите защиту тем же PIN-кодом',
    passcodeProtected: 'tdata защищена код-паролем Telegram — профиль можно посмотреть только в самом клиенте',
    notLoggedIn: 'В этом профиле ещё не выполнен вход',
    alreadyAdded: (name: string) => `Этот аккаунт уже добавлен: ${name}`,
    noTdata: 'В выбранной папке нет tdata (не найден файл key_datas)',
    ownFolder: 'Эта папка уже принадлежит Hangram',
    tdataCorrupt: 'tdata повреждена и не читается',
    tdataDuplicate: 'Аккаунт из этой tdata уже добавлен',
    targetHasTdata: 'В выбранной папке уже есть tdata',
    profileEmpty: 'В этом профиле ещё нет данных',
    noRuntime: 'Telegram Desktop ещё не установлен',
    launchFailed: (reason: string) => `Не удалось запустить Telegram Desktop: ${reason}`,

    notTelegramDesktop:
      'Это не Telegram Desktop. Версия из App Store («Telegram» для macOS) не подходит — нужен клиент с desktop.telegram.org.',
    chooseExecutable: 'Выберите исполняемый файл Telegram Desktop',
    downloadFailed: (reason: string) => `Не удалось загрузить Telegram Desktop: ${reason}`,

    unknownDc: (dcId: number) => `Неизвестный дата-центр: ${dcId}`,
    emptyProfile: 'Telegram вернул пустой профиль',
    noAuthKey: 'Не удалось получить ключ авторизации',
    floodWait: (seconds: number) => {
      const minutes = Math.ceil(seconds / 60)
      return `Telegram просит подождать ${minutes >= 2 ? `${minutes} мин.` : `${seconds} сек.`} перед следующей попыткой`
    },
    telegram: (code: string) => `Ошибка Telegram: ${code}`,
    network: 'Не удалось связаться с Telegram. Проверьте подключение к сети',

    flowExpired: 'Сессия входа истекла. Начните заново',
    unexpectedReply: 'Telegram ответил неожиданно. Попробуйте войти через Telegram Desktop',
    emailRequired:
      'Telegram требует привязать e-mail к этому аккаунту. Воспользуйтесь способом «Войти в Telegram Desktop»',
    badPhone: 'Неверный номер телефона',
    requestCodeFirst: 'Сначала запросите код',
    phoneUnoccupied: 'На этот номер не зарегистрирован аккаунт Telegram',
    loginFailed: 'Вход не выполнен',
    badSession: 'Строка не похожа на сессию Telethon / GramJS (StringSession)'
  },

  telegramErrors,

  /** Completes the system prompt "Hangram wants to …". */
  touchIdReason: 'разблокировать Hangram',

  menu: {
    settings: 'Настройки…',
    lock: 'Заблокировать',
    about: (app: string) => `О программе ${app}`,
    hide: (app: string) => `Скрыть ${app}`,
    hideOthers: 'Скрыть остальные',
    unhide: 'Показать все',
    quitApp: (app: string) => `Завершить ${app}`,
    file: 'Файл',
    addAccount: 'Добавить аккаунт…',
    importTdata: 'Импортировать tdata…',
    closeWindow: 'Закрыть окно',
    quit: 'Выход',
    edit: 'Правка',
    undo: 'Отменить',
    redo: 'Повторить',
    cut: 'Вырезать',
    copy: 'Скопировать',
    paste: 'Вставить',
    selectAll: 'Выбрать все',
    find: 'Найти',
    view: 'Вид',
    fullscreen: 'Полноэкранный режим',
    window: 'Окно',
    minimize: 'Свернуть',
    zoom: 'Изменить масштаб',
    front: 'Все окна — на передний план'
  },

  dialogs: {
    importTitle: 'Импорт tdata',
    importMessage: 'Выберите папку tdata (или папку Telegram Desktop, в которой она лежит)',
    importButton: 'Импортировать',
    accountFallback: 'аккаунт',
    removeMessage: (name: string) => `Удалить «${name}»?`,
    removeDetail:
      'Папка tdata этого аккаунта будет удалена с этого компьютера. Сам аккаунт Telegram останется, но сессия в списке устройств сохранится, пока вы не завершите её вручную.',
    remove: 'Удалить',
    exportTitle: 'Экспорт tdata',
    exportMessage: 'Куда сохранить незашифрованную копию tdata?',
    exportButton: 'Экспортировать',
    chooseTelegramMac: 'Выберите Telegram Desktop (Telegram.app с desktop.telegram.org)',
    applications: 'Приложения'
  },

  accountMenu: {
    stop: 'Закрыть Telegram',
    launch: 'Открыть в Telegram',
    edit: 'Изменить…',
    pin: 'Закрепить',
    unpin: 'Открепить',
    refresh: 'Обновить профиль из Telegram',
    revealMac: 'Показать в Finder',
    reveal: 'Показать в проводнике',
    export: 'Экспортировать tdata…',
    remove: 'Удалить…'
  },

  account: {
    newProfile: 'Новый профиль',
    passcodeProtected: 'Защищён код-паролем Telegram',
    profileNotLoaded: 'Профиль ещё не загружен из Telegram',
    notLoggedIn: 'Вход ещё не выполнен'
  },

  lock: {
    title: 'Hangram заблокирован',
    text: 'Данные аккаунтов зашифрованы. Введите PIN-код, чтобы продолжить.',
    unlock: 'Разблокировать'
  },

  sidebar: {
    all: 'Все аккаунты',
    running: 'Запущенные',
    pinned: 'Закреплённые',
    tags: 'Теги',
    settings: 'Настройки',
    lock: 'Заблокировать'
  },

  list: {
    count: (n: number) => `${n} ${plural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}`,
    search: 'Поиск',
    addAccount: 'Добавить аккаунт',
    accounts: 'Аккаунты',
    telegramRunning: 'Telegram запущен',
    open: 'Открыть',
    close: 'Закрыть',
    needTelegram: 'Нужен Telegram Desktop',
    needTelegramText: 'Официальная сборка будет загружена с telegram.org (около 200 МБ) и проверена по подписи.',
    installFailed: 'Не удалось установить Telegram Desktop',
    installing: 'Установка Telegram Desktop…',
    downloading: 'Загрузка Telegram Desktop…',
    retry: 'Повторить',
    download: 'Загрузить',
    emptyTitle: 'Пока нет аккаунтов',
    emptyText: 'Добавьте первый: войдите по номеру или QR-коду, либо импортируйте готовую tdata.',
    nothingFound: 'Ничего не найдено',
    noMatches: (query: string) => `По запросу «${query}» аккаунтов нет.`,
    emptySection: 'В этом разделе пусто.'
  },

  add: {
    titles: {
      choose: 'Добавить аккаунт',
      phone: 'Вход по номеру',
      code: 'Код подтверждения',
      password: 'Облачный пароль',
      qr: 'Вход по QR-коду',
      session: 'Строка сессии'
    },
    phoneTitle: 'Номер телефона',
    phoneText: 'Код из Telegram или SMS и облачный пароль, если он включён',
    qrTitle: 'QR-код',
    qrText: 'Отсканируйте код в Telegram на другом устройстве',
    desktopTitle: 'Войти в Telegram Desktop',
    desktopText: 'Откроется чистый клиент — войдите в нём как обычно',
    desktopNeedsRuntime: 'Сначала загрузите Telegram Desktop',
    tdataTitle: 'Импорт tdata',
    tdataText: 'Папка tdata от уже настроенного Telegram Desktop',
    sessionTitle: 'Строка сессии',
    sessionText: 'StringSession от Telethon или GramJS',

    phonePrompt: 'Введите номер в международном формате. Telegram пришлёт код подтверждения.',
    phonePlaceholder: '+7 900 000-00-00',
    getCode: 'Получить код',
    codeViaApp: 'Код отправлен в Telegram на других ваших устройствах.',
    codeViaSms: 'Код отправлен по SMS.',
    codeViaOther: 'Telegram отправил код подтверждения.',
    number: (phone: string) => `Номер: ${phone}`,
    resend: 'Отправить код другим способом',
    next: 'Продолжить',
    passwordPrompt: 'Аккаунт защищён двухэтапной аутентификацией. Введите облачный пароль.',
    hint: (hint: string) => `Подсказка: ${hint}`,
    passwordPlaceholder: 'Облачный пароль',
    signIn: 'Войти',
    qrAlt: 'QR-код для входа',
    tryAgain: 'Попробовать снова',
    qrSteps: ['Откройте Telegram на телефоне', 'Настройки → Устройства → Подключить устройство', 'Наведите камеру на этот код'],
    sessionPrompt:
      'Вставьте строку StringSession. Hangram проверит её, соберёт из неё tdata и больше нигде не сохранит саму строку.',
    import: 'Импортировать'
  },

  edit: {
    title: 'Аккаунт',
    sources: {
      phone: 'Вход по номеру',
      qr: 'Вход по QR-коду',
      session: 'Строка сессии',
      tdata: 'Импорт tdata',
      desktop: 'Вход в Telegram Desktop'
    },
    name: 'Название',
    tags: 'Теги',
    tagsHint: 'Через запятую',
    tagsPlaceholder: 'работа, личное',
    pinToTop: 'Закрепить вверху списка',
    note: 'Заметка',
    details: 'Сведения',
    phone: 'Телефон',
    username: 'Имя пользователя',
    dc: 'Дата-центр',
    added: 'Добавлен',
    lastLaunch: 'Последний запуск',
    never: 'никогда'
  },

  settings: {
    title: 'Настройки',
    tabs: { security: 'Защита', telegram: 'Telegram', general: 'Основные', about: 'О программе' },

    autoLock: (minutes: number) =>
      minutes === 0
        ? 'Никогда'
        : minutes === 60
          ? '1 час'
          : `${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`,

    pinMismatch: 'PIN-коды не совпадают',
    newPinMismatch: 'Новые PIN-коды не совпадают',
    protectionIntro:
      'С защитой все tdata и список аккаунтов шифруются (AES-256-GCM). Расшифровывается только профиль, открытый в Telegram прямо сейчас; при блокировке клиенты закрываются и всё снова запечатывается.',
    pinFooter:
      'Подойдут и цифры, и обычный пароль. Чем длиннее — тем лучше: короткий PIN можно перебрать, если кто-то унесёт файлы. Забытый PIN восстановить нельзя.',
    pinPlaceholder: 'не короче 4 символов',
    enable: 'Включить защиту',

    locking: 'Блокировка',
    touchId: 'Разблокировка по Touch ID',
    touchIdHint: 'Ключ хранится в Secure Enclave и выдаётся только по отпечатку',
    lockOnIdle: 'Блокировать при бездействии',
    lockOnSleep: 'Блокировать при сне и блокировке экрана',
    pinFooterManage: 'При блокировке открытые клиенты Telegram закрываются — иначе их данные остались бы расшифрованными.',
    changePin: 'Изменить PIN-код',
    change: 'Изменить…',
    disable: 'Выключить защиту',
    disableHint: 'Все данные будут расшифрованы',
    disableButton: 'Выключить…',
    changingPin: 'Изменение PIN-кода',
    disabling: 'Выключение защиты',
    currentPin: 'Текущий PIN-код',
    newPin: 'Новый PIN-код',
    decryptAndDisable: 'Расшифровать и выключить',

    hiddenSpace: 'Скрытое пространство',
    hiddenSpaceHint: 'Отдельный список аккаунтов под другим PIN-кодом',
    addSpace: 'Добавить…',
    addingSpace: 'Новое скрытое пространство',
    addSpaceFooter:
      'Какой PIN-код введён на экране блокировки, тот список и откроется. Чтобы попасть в новое пространство, заблокируйте Hangram и введите этот PIN-код. Нигде в интерфейсе оно не показывается; забытый PIN восстановить нельзя.',
    spacePin: 'PIN-код пространства',
    createSpace: 'Создать',
    removeSpace: 'Удалить это пространство',
    removeSpaceHint: 'Его аккаунты будут удалены с этого компьютера',
    removeSpaceButton: 'Удалить…',
    removingSpace: 'Удаление пространства',
    removeSpaceConfirm: 'Удалить пространство и аккаунты',

    runtimeVersion: (version: string, custom: boolean) => `Версия ${version}${custom ? ' · своя сборка' : ''}`,
    downloading: (percent: number | null) => `Загрузка…${percent === null ? '' : ` ${percent}%`}`,
    installing: 'Установка…',
    notInstalled: 'Не установлен',
    telegramFooter: 'Каждый аккаунт открывается в отдельном окне официального клиента со своей папкой данных.',
    client: 'Клиент',
    closeClientsFirst: 'Сначала закройте запущенные клиенты',
    reinstall: 'Переустановить',
    download: 'Загрузить',
    customBuild: 'Своя сборка',
    customBuildHint: 'Использовать уже установленный Telegram Desktop',
    reset: 'Сбросить',
    choose: 'Выбрать…',
    noUpdates: 'Запретить клиенту обновляться',
    noUpdatesHint: 'Запуск с параметром -noupdate',
    apiTitle: 'API для входа по номеру и QR',
    apiFooter:
      'По умолчанию используются данные самого Telegram Desktop — так сессия выглядит для Telegram одинаково до и после передачи клиенту. Свои можно получить на',
    byDefault: 'по умолчанию',

    language: 'Язык',
    languageSystem: 'Как в системе',

    version: (version: string) => `Версия ${version}`,
    aboutText:
      'Лаунчер и хранилище аккаунтов Telegram Desktop. Данные лежат только на этом компьютере; приложение обращается к сети лишь для входа в аккаунт, обновления профиля по вашей команде и загрузки клиента с telegram.org.',
    notOfficial: 'Не является официальным продуктом Telegram.'
  }
}
