const dictionaries = {
  en: () => import("./locales/en.json", { with: { type: "json" } }),
  sv: () => import("./locales/sv.json", { with: { type: "json" } }),
};

function resolveInitialLanguage(defaultLanguage) {
  const savedLanguage = window.localStorage.getItem("electricity-language");
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
      window.localStorage.setItem("electricity-language", nextLanguage);
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
