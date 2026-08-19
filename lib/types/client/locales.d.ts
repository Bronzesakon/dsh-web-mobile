/** `mobileNav` namespace dictionaries: drawer controls. */
export declare const NS = "mobileNav";
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    readonly open: "打开目录";
    readonly close: "收起目录";
    readonly backdrop: "点击关闭目录";
    readonly sessionLog: "导出会话日志";
    readonly files: "文件浏览";
    readonly previewFullscreen: "全屏预览";
    readonly previewExitFullscreen: "退出全屏";
    readonly 'haptic.title': "点按振动（Mobile）";
    readonly 'haptic.desc': "由 dsh-web-mobile 插件提供，仅支持手机等支持振动的设备";
    readonly 'haptic.intensityLabel': "振动强度";
    readonly 'haptic.intensity.light': "轻";
    readonly 'haptic.intensity.medium': "中";
    readonly 'haptic.intensity.heavy': "重";
};
/** English dictionary, key-identical to the Chinese source of truth. */
export declare const en: Record<MobileNavKey, string>;
/** Key domain of the `mobileNav` namespace (zh is the source of truth). */
export type MobileNavKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map