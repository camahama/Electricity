import { createApp } from "./app.js";

const container = document.querySelector("#app");

if (!container) {
  throw new Error("App container was not found.");
}

createApp(container);
