/**
 * Strings for every place this cargo writes to the pilot. Loaded once by the
 * renderer entry through `host.i18n.addResources`, so a picker row and the
 * setup panel read the same translations.
 *
 * `basemap.<id>` is what the host looks up for a picker row: the layer key is
 * `mb-<slug>.<id>`, and the renderer asks the cargo's namespace for that name.
 * All three styles ship; only `hybrid` is marked `primary`, so the narrow
 * flight-log picker shows just that row.
 */
export const strings = {
  en: {
    panelTitle: 'Tianditu basemaps',
    intro: 'Adds China-reachable Tianditu imagery, vector and terrain basemaps to the app; the small flight-log picker shows imagery only.',
    keyLabel: 'Server-side key',
    keyPlaceholder: '32-character key from the Tianditu console',
    save: 'Save key',
    saved: 'Key saved. The basemaps are ready in the layer picker.',
    clear: 'Remove key',
    cleared: 'Key removed. The basemaps are gone from the layer picker.',
    keyInvalid: 'That does not look like a Tianditu key: it should be 32 characters of 0-9 and a-f.',
    saveFailed: 'Could not save the key: {{error}}',
    serverKeyNote:
      'Use a server-side key (服务端). A browser-side key is checked against the referrer, so it cannot be fetched by the app and the tiles will fail with 403.',
    ipNote: 'If the key has an IP allow-list, add the public IP of the machine running ArduDeck.',
    setupTitle: 'How to get a key',
    setupStep1: 'Sign in at cloudcenter.tianditu.gov.cn → 应用管理 (my applications) and create an application.',
    setupStep2: 'Add a key of type 服务端 (server-side), not 浏览器端.',
    setupStep3: 'Paste the 32-character key above. Tiles are fetched by ArduDeck and cached locally.',
    consoleLink: 'Open the Tianditu console',
    authLink: 'Key types and authorisation',
    attributionNote: 'Attribution required by the platform: 天地图 · 国家地理信息公共服务平台.',
    basemap: {
      hybrid: 'Tianditu imagery',
      vector: 'Tianditu vector',
      terrain: 'Tianditu terrain',
    },
  },

  'zh-CN': {
    panelTitle: '天地图底图',
    intro: '为应用内地图加入国内可达的天地图影像、矢量与地形底图；飞行记录的小选择器只显示影像混合。',
    keyLabel: '服务端密钥',
    keyPlaceholder: '天地图控制台生成的 32 位密钥',
    save: '保存密钥',
    saved: '密钥已保存，图层选择器里已经可以使用天地图底图。',
    clear: '清除密钥',
    cleared: '密钥已清除，图层选择器里的天地图底图已移除。',
    keyInvalid: '这不像是天地图密钥：应当是 0-9 与 a-f 组成的 32 个字符。',
    saveFailed: '保存密钥失败：{{error}}',
    serverKeyNote:
      '请使用服务端类型的密钥。浏览器端密钥按 Referer 校验，应用直接请求会被拒绝（403），不能改用伪装浏览器的方式绕过。',
    ipNote: '如果密钥设置了 IP 白名单，请把运行 ArduDeck 这台机器的公网 IP 加进去。',
    setupTitle: '如何申请密钥',
    setupStep1: '登录 cloudcenter.tianditu.gov.cn 的「应用管理」，创建一个应用。',
    setupStep2: '在应用里添加一个“服务端”类型的密钥（不是“浏览器端”）。',
    setupStep3: '把 32 位密钥粘贴到上方。瓦片由 ArduDeck 请求并在本地缓存。',
    consoleLink: '打开天地图控制台',
    authLink: '密钥类型与授权说明',
    attributionNote: '平台要求的署名：天地图 · 国家地理信息公共服务平台。',
    basemap: {
      hybrid: '天地图混合',
      vector: '天地图矢量',
      terrain: '天地图地形',
    },
  },

  'zh-TW': {
    panelTitle: '天地圖底圖',
    intro: '為應用程式地圖加入中國可達的天地圖影像、向量與地形底圖；飛行記錄的小選擇器只顯示影像混合。',
    keyLabel: '伺服器端金鑰',
    keyPlaceholder: '天地圖控制台產生的 32 位金鑰',
    save: '儲存金鑰',
    saved: '金鑰已儲存，圖層選擇器已可使用天地圖底圖。',
    clear: '清除金鑰',
    cleared: '金鑰已清除，圖層選擇器中的天地圖底圖已移除。',
    keyInvalid: '這不像天地圖金鑰：應為 0-9 與 a-f 組成的 32 個字元。',
    saveFailed: '儲存金鑰失敗：{{error}}',
    serverKeyNote:
      '請使用伺服器端金鑰。瀏覽器端金鑰以 Referer 驗證，應用程式直接請求會被拒絕（403），不可用偽裝瀏覽器的方式繞過。',
    ipNote: '若金鑰設有 IP 白名單，請加入執行 ArduDeck 這台機器的公網 IP。',
    setupTitle: '如何申請金鑰',
    setupStep1: '登入 cloudcenter.tianditu.gov.cn 的「應用管理」，建立一個應用程式。',
    setupStep2: '在應用程式中新增「伺服器端」金鑰（不是「瀏覽器端」）。',
    setupStep3: '把 32 位金鑰貼到上方。圖磚由 ArduDeck 請求並在本機快取。',
    consoleLink: '開啟天地圖控制台',
    authLink: '金鑰類型與授權說明',
    attributionNote: '平台要求的署名：天地图 · 国家地理信息公共服务平台。',
    basemap: {
      hybrid: '天地圖混合',
      vector: '天地圖向量',
      terrain: '天地圖地形',
    },
  },

  de: {
    panelTitle: 'Tianditu-Karten',
    intro: 'Fügt in China erreichbare Tianditu-Luftbild-, Vektor- und Geländekarten hinzu; die kleine Auswahl im Flugprotokoll zeigt nur das Luftbild.',
    keyLabel: 'Serverseitiger Schlüssel',
    keyPlaceholder: '32-stelliger Schlüssel aus der Tianditu-Konsole',
    save: 'Schlüssel speichern',
    saved: 'Schlüssel gespeichert. Die Karten stehen in der Layer-Auswahl bereit.',
    clear: 'Schlüssel entfernen',
    cleared: 'Schlüssel entfernt. Die Karten fehlen jetzt in der Layer-Auswahl.',
    keyInvalid: 'Das sieht nicht nach einem Tianditu-Schlüssel aus: 32 Zeichen aus 0-9 und a-f.',
    saveFailed: 'Schlüssel konnte nicht gespeichert werden: {{error}}',
    serverKeyNote:
      'Einen serverseitigen Schlüssel verwenden. Ein Browser-Schlüssel wird über den Referer geprüft, die App bekommt damit 403.',
    ipNote: 'Hat der Schlüssel eine IP-Freigabeliste, trage die öffentliche IP des Rechners mit ArduDeck ein.',
    setupTitle: 'Schlüssel beantragen',
    setupStep1: 'In der Konsole cloudcenter.tianditu.gov.cn unter 应用管理 eine Anwendung anlegen.',
    setupStep2: 'Einen Schlüssel vom Typ 服务端 (serverseitig) hinzufügen, nicht 浏览器端.',
    setupStep3: 'Den 32-stelligen Schlüssel oben einfügen. ArduDeck lädt die Kacheln und speichert sie lokal.',
    consoleLink: 'Tianditu-Konsole öffnen',
    authLink: 'Schlüsseltypen und Freigabe',
    attributionNote: 'Vorgeschriebene Quellenangabe: 天地图 · 国家地理信息公共服务平台.',
    basemap: {
      hybrid: 'Tianditu Luftbild',
      vector: 'Tianditu Vektor',
      terrain: 'Tianditu Gelände',
    },
  },

  uk: {
    panelTitle: 'Карти Tianditu',
    intro: 'Додає доступні в Китаї супутникові, векторні та рельєфні карти Tianditu; малий вибір у журналі польотів показує лише супутник.',
    keyLabel: 'Серверний ключ',
    keyPlaceholder: '32-символьний ключ із консолі Tianditu',
    save: 'Зберегти ключ',
    saved: 'Ключ збережено. Карти доступні у виборі шару.',
    clear: 'Видалити ключ',
    cleared: 'Ключ видалено. Карти зникли з вибору шару.',
    keyInvalid: 'Це не схоже на ключ Tianditu: потрібно 32 символи з 0-9 і a-f.',
    saveFailed: 'Не вдалося зберегти ключ: {{error}}',
    serverKeyNote:
      'Використовуйте серверний ключ. Браузерний ключ перевіряється за Referer, тож застосунок отримає 403.',
    ipNote: 'Якщо в ключа є список дозволених IP, додайте публічну IP машини з ArduDeck.',
    setupTitle: 'Як отримати ключ',
    setupStep1: 'Увійдіть на cloudcenter.tianditu.gov.cn у розділ 应用管理 і створіть застосунок.',
    setupStep2: 'Додайте ключ типу 服务端 (серверний), а не 浏览器端.',
    setupStep3: 'Вставте 32-символьний ключ вище. ArduDeck завантажує тайли й кешує їх локально.',
    consoleLink: 'Відкрити консоль Tianditu',
    authLink: 'Типи ключів і авторизація',
    attributionNote: 'Обов’язкове зазначення джерела: 天地图 · 国家地理信息公共服务平台.',
    basemap: {
      hybrid: 'Tianditu супутник',
      vector: 'Tianditu вектор',
      terrain: 'Tianditu рельєф',
    },
  },
} as const;

/** The five locales the app ships, in the order a reviewer reads them. */
export type CargoLocale = keyof typeof strings;
