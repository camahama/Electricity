import { moduleRegistry } from "./config/modules.js";
import { createI18n } from "./i18n/index.js";

const DEFAULT_ROUTE = "home";
const DEFAULT_LANGUAGE = "en";
const ASSET_BASE_URL = import.meta.env.BASE_URL;

function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash || DEFAULT_ROUTE;
}

function setDocumentLanguage(language) {
  document.documentElement.lang = language;
}

export async function createApp(container) {
  const i18n = await createI18n({ defaultLanguage: DEFAULT_LANGUAGE });

  function render() {
    const route = getRoute();
    const moduleDefinition = moduleRegistry.find(
      (entry) => entry.slug === route,
    );

    const view = moduleDefinition
      ? moduleDefinition.render({ t: i18n.t, language: i18n.language })
      : renderHome({ t: i18n.t, language: i18n.language });

    container.innerHTML = "";
    container.append(view);
    setDocumentLanguage(i18n.language);
    document.title = i18n.t("app.meta.title");
  }

  window.addEventListener("hashchange", render);

  render();
}

function renderHome({ t, language }) {
  const page = document.createElement("main");
  page.className = "page-shell";

  const hero = document.createElement("section");
  hero.className = "hero";

  const branding = document.createElement("div");
  branding.className = "branding";

  const logo = document.createElement("img");
  logo.className = "brand-logo";
  logo.src = `${ASSET_BASE_URL}images/lunds-universitet-huvudlogotyp-liggande3.png.webp`;
  logo.alt = t("home.logoAlt");

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = t("home.eyebrow");

  const title = document.createElement("h1");
  title.className = "hero-title";
  title.textContent = t("app.title");

  const description = document.createElement("p");
  description.className = "hero-description";
  description.textContent = t("home.description");

  const languagePicker = renderLanguagePicker({
    label: t("home.languageLabel"),
    language,
    onChange: changeLanguage,
  });

  const menuTitle = document.createElement("h2");
  menuTitle.className = "section-title";
  menuTitle.textContent = t("home.menuTitle");

  const menu = document.createElement("nav");
  menu.className = "module-menu";
  menu.setAttribute("aria-label", t("home.menuTitle"));

  const moduleList = document.createElement("ul");
  moduleList.className = "module-list";

  moduleRegistry
    .filter((moduleDefinition) => !moduleDefinition.hiddenFromMenu)
    .forEach((moduleDefinition) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#/${moduleDefinition.slug}`;
      link.className = "module-link";
      link.textContent = t(moduleDefinition.titleKey);
      item.append(link);
      moduleList.append(item);
    });

  const externalItem = document.createElement("li");
  const externalLink = document.createElement("a");
  externalLink.href = "https://camahama.github.io/3phase_sim/";
  externalLink.className = "module-link";
  externalLink.target = "_blank";
  externalLink.rel = "noreferrer";
  externalLink.textContent = t("home.externalThreePhase");
  externalItem.append(externalLink);
  moduleList.append(externalItem);

  menu.append(moduleList);
  branding.append(logo);
  hero.append(branding, eyebrow, title, description, languagePicker, menuTitle, menu);
  page.append(hero);

  return page;
}

function renderLanguagePicker({ label: pickerLabel, language, onChange }) {
  const wrapper = document.createElement("div");
  wrapper.className = "language-picker";

  const label = document.createElement("span");
  label.className = "language-label";
  label.textContent = pickerLabel;

  const languages = [
    { code: "en", label: "English" },
    { code: "sv", label: "Svenska" },
  ];

  languages.forEach(({ code, label: languageLabel }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = code === language ? "language-button active" : "language-button";
    button.textContent = languageLabel;
    button.addEventListener("click", () => onChange(code));
    wrapper.append(button);
  });

  wrapper.prepend(label);
  return wrapper;
}

async function changeLanguage(language) {
  await window.__electricityI18n?.setLanguage(language);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
