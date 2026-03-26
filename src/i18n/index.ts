const dictionaries = {
  en: () => import("./locales/en.json", { with: { type: "json" } }),
  sv: () => import("./locales/sv.json", { with: { type: "json" } }),
};

function getStoredLanguage() {
  try {
    return window.localStorage.getItem("electricity-language");
  } catch (_error) {
    return null;
  }
}

function setStoredLanguage(language) {
  try {
    window.localStorage.setItem("electricity-language", language);
  } catch (_error) {
    // Ignore storage write failures in restricted browser contexts.
  }
}

function resolveInitialLanguage(defaultLanguage) {
  const savedLanguage = getStoredLanguage();
  if (savedLanguage && savedLanguage in dictionaries) {
    return savedLanguage;
  }

  const browserLanguage = window.navigator.language.slice(0, 2).toLowerCase();
  return browserLanguage in dictionaries ? browserLanguage : defaultLanguage;
}

export async function createI18n({ defaultLanguage }) {
  const i18n = {
    language: resolveInitialLanguage(defaultLanguage),
    dictionary: {},
    async setLanguage(nextLanguage) {
      if (!(nextLanguage in dictionaries)) {
        return;
      }

      const module = await dictionaries[nextLanguage]();
      i18n.language = nextLanguage;
      i18n.dictionary = module.default;
      setStoredLanguage(nextLanguage);
    },
    t(key, values = {}) {
      const resolved = key.split(".").reduce((value, part) => value?.[part], i18n.dictionary);

      if (typeof resolved !== "string") {
        return resolved ?? key;
      }

      return resolved.replace(/\{(\w+)\}/g, (_match, token) => (
        values[token] === undefined ? `{${token}}` : String(values[token])
      ));
    },
  };

  await i18n.setLanguage(i18n.language);
  window.__electricityI18n = i18n;
  return i18n;
}
