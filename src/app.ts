import { moduleRegistry } from "./config/modules.js";
import { createPackageCredit } from "./components/packageCredit.js";
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

  const moduleList = document.createElement("div");
  moduleList.className = "module-list";

  moduleRegistry
    .filter((moduleDefinition) => !moduleDefinition.hiddenFromMenu)
    .forEach((moduleDefinition) => {
      const link = document.createElement("a");
      link.href = `#/${moduleDefinition.slug}`;
      link.className = "module-link";
      link.append(createModuleIcon(moduleDefinition.slug), moduleIconTitle(t(moduleDefinition.titleKey)));
      moduleList.append(link);
    });

  menu.append(moduleList);

  const credit = createPackageCredit(t);

  const repository = document.createElement("p");
  repository.className = "repository-link";
  const repositoryLink = document.createElement("a");
  repositoryLink.href = "https://github.com/camahama/Electricity";
  repositoryLink.target = "_blank";
  repositoryLink.rel = "noopener noreferrer";
  repositoryLink.textContent = t("home.repositoryLinkLabel");
  repository.append(repositoryLink);

  branding.append(logo);
  hero.append(branding, eyebrow, title, description, languagePicker, menuTitle, menu, credit, repository);
  page.append(hero);

  return page;
}

function moduleIconTitle(textContent) {
  const title = document.createElement("span");
  title.className = "module-icon-title";
  title.textContent = textContent;
  return title;
}

function createModuleIcon(slug) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "module-icon");
  svg.setAttribute("viewBox", "0 0 96 72");
  svg.setAttribute("aria-hidden", "true");

  const line = (x1, y1, x2, y2, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
    node.setAttribute("x1", String(x1));
    node.setAttribute("y1", String(y1));
    node.setAttribute("x2", String(x2));
    node.setAttribute("y2", String(y2));
    node.setAttribute("class", className);
    svg.append(node);
  };
  const circle = (cx, cy, r, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", String(cx));
    node.setAttribute("cy", String(cy));
    node.setAttribute("r", String(r));
    node.setAttribute("class", className);
    svg.append(node);
  };
  const rect = (x, y, width, height, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    node.setAttribute("x", String(x));
    node.setAttribute("y", String(y));
    node.setAttribute("width", String(width));
    node.setAttribute("height", String(height));
    node.setAttribute("rx", "4");
    node.setAttribute("class", className);
    svg.append(node);
  };
  const path = (d, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
    node.setAttribute("d", d);
    node.setAttribute("class", className);
    svg.append(node);
  };
  const text = (x, y, value, className = "text") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
    node.setAttribute("x", String(x));
    node.setAttribute("y", String(y));
    node.setAttribute("class", className);
    node.textContent = value;
    svg.append(node);
  };

  if (slug === "electrostatics") {
    path("M 26 18 C 36 16 60 16 70 18 M 26 54 C 36 56 60 56 70 54 M 20 28 C 35 24 61 24 76 28 M 20 44 C 35 48 61 48 76 44", "field faint");
    path("M 33 36 C 40 25 56 25 63 36 M 33 36 C 40 47 56 47 63 36", "field");
    path("M 18 22 C 26 28 28 44 18 50 M 78 22 C 70 28 68 44 78 50", "field faint");
    circle(32, 36, 13, "charge negative");
    circle(64, 36, 13, "charge positive");
    text(32, 41, "−", "charge-text");
    text(64, 41, "+", "charge-text");
  } else if (slug === "circuit-builder") {
    line(12, 36, 26, 36);
    rect(26, 26, 24, 20);
    line(50, 36, 62, 36);
    line(72, 36, 84, 36);
    circle(12, 36, 4);
    circle(84, 36, 4);
    line(62, 20, 62, 52, "accent battery-pole");
    line(72, 26, 72, 46, "accent battery-pole");
  } else if (slug === "phasor-diagram") {
    circle(32, 36, 22, "reference");
    line(32, 36, 51, 24, "phasor");
    path("M 58 36 C 62 14 70 14 74 36 C 78 58 86 58 90 36", "wave");
    line(51, 24, 90, 24, "guide");
  } else if (slug === "rlc-circuit") {
    line(10, 34, 20, 34);
    rect(20, 26, 20, 16);
    path("M 40 34 C 44 24 48 44 52 34 C 56 24 60 44 64 34", "stroke");
    line(70, 24, 70, 44);
    line(78, 24, 78, 44);
    line(78, 34, 86, 34);
    path("M 12 58 C 24 38 38 38 50 58 C 62 78 76 78 88 58", "wave");
    path("M 12 48 C 18 48 25 52 31 58 C 36 64 43 68 50 68 C 57 68 64 64 69 58 C 75 52 82 48 88 48", "wave red-wave");
  } else {
    line(48, 36, 24, 10, "three-phase a");
    line(24, 10, 86, 10, "three-phase a");
    path("M 32 11 L 44 24 L 36 31 L 24 18 Z", "three-phase-load a");
    line(48, 36, 86, 36, "three-phase b");
    rect(58, 31, 20, 10, "three-phase-load b");
    line(48, 36, 24, 62, "three-phase c");
    line(24, 62, 86, 62, "three-phase c");
    path("M 24 54 L 36 41 L 44 48 L 32 61 Z", "three-phase-load c");
    line(10, 36, 48, 36, "neutral");
    circle(10, 36, 4.5, "terminal neutral-terminal");
    circle(86, 10, 4.5, "terminal a");
    circle(86, 36, 4.5, "terminal b");
    circle(86, 62, 4.5, "terminal c");
  }

  return svg;
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
