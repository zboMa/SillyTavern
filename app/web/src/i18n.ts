import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import zhCN from './locales/zh-cn.json';

const LANGUAGE_STORAGE_KEY = 'language';
const DEFAULT_LOCALE = 'zh-cn';

const MESSAGES = {
    'zh-cn': zhCN,
    en,
};

/**
 * Runtime setter installed during `createI18nInstance()`.
 * @type {null | ((next: string) => Promise<void>)}
 */
let runtimeSetLocale = null;

/**
 * @param {string} locale
 * @returns {boolean}
 */
function isKnownLocale(locale) {
    return Object.prototype.hasOwnProperty.call(MESSAGES, locale);
}

/**
 * @returns {string}
 */
export function getStartingLocale() {
    const override = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const normalized = override ? String(override).toLowerCase() : '';
    if (normalized && isKnownLocale(normalized)) return normalized;
    return DEFAULT_LOCALE;
}

export async function createI18nInstance() {
    const locale = getStartingLocale();

    const i18n = createI18n({
        legacy: false,
        locale,
        fallbackLocale: DEFAULT_LOCALE,
        messages: MESSAGES,
    });

    /**
     * @param {string} next
     * @returns {Promise<void>}
     */
    async function setLocale(next) {
        const normalized = String(next || DEFAULT_LOCALE).toLowerCase();
        const target = isKnownLocale(normalized) ? normalized : DEFAULT_LOCALE;

        i18n.global.locale.value = target;
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, target);
    }

    runtimeSetLocale = setLocale;
    return { i18n, setLocale };
}

/**
 * @param {string} next
 * @returns {Promise<void>}
 */
export async function setLocaleRuntime(next) {
    if (!runtimeSetLocale) throw new Error('i18n not initialized yet');
    await runtimeSetLocale(next);
}

