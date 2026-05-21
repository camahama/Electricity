import type { ModuleRenderContext } from "../config/modules.js";

export function createPackageCredit(t: ModuleRenderContext["t"]): HTMLElement {
  const credit = document.createElement("p");
  credit.className = "package-credit";
  credit.append(`${t("home.creditPrefix")} `);

  const emailLink = document.createElement("a");
  emailLink.href = "mailto:martin.magnusson@fysik.lu.se";
  emailLink.textContent = "martin.magnusson@fysik.lu.se";
  credit.append(emailLink, `. ${t("home.creditLicensePrefix")} `);

  const licenseLink = document.createElement("a");
  licenseLink.href = "https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1";
  licenseLink.target = "_blank";
  licenseLink.rel = "license noopener noreferrer";
  licenseLink.textContent = t("home.creditLicenseLabel");
  credit.append(licenseLink);

  return credit;
}
