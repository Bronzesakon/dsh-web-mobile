/** `mobileNav` namespace dictionaries: drawer controls. */
export const NS = 'mobileNav'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'open': '打开目录',
  'close': '收起目录',
  'backdrop': '点击关闭目录',
  'sessionLog': '导出会话日志',
  'files': '文件浏览',
  'previewFullscreen': '全屏预览',
  'previewExitFullscreen': '退出全屏',
  'haptic.title': '点按振动（Mobile）',
  'haptic.desc': '由 dsh-web-mobile 插件提供，仅支持手机等支持振动的设备',
  'haptic.intensityLabel': '振动强度',
  'haptic.intensity.light': '轻',
  'haptic.intensity.medium': '中',
  'haptic.intensity.heavy': '重',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<MobileNavKey, string> = {
  'open': 'Open directory',
  'close': 'Close directory',
  'backdrop': 'Click to close directory',
  'sessionLog': 'Session log',
  'files': 'Files',
  'previewFullscreen': 'Fullscreen preview',
  'previewExitFullscreen': 'Exit fullscreen',
  'haptic.title': 'Tap vibration (Mobile)',
  'haptic.desc': 'Provided by the dsh-web-mobile plugin; vibration only on phones and other devices that support it',
  'haptic.intensityLabel': 'Vibration intensity',
  'haptic.intensity.light': 'Light',
  'haptic.intensity.medium': 'Medium',
  'haptic.intensity.heavy': 'Heavy',
}

/** Key domain of the `mobileNav` namespace (zh is the source of truth). */
export type MobileNavKey = keyof typeof zh
