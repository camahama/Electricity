# Electricity

A lightweight scaffold for an electricity teaching web app with support for:

- multiple course modules
- lecture-friendly navigation
- student self-study exploration
- Swedish and English translations

## Current modules

- Electrostatics
- Electrostatics Materials sandbox (currently hidden from the menu)

## Structure

```text
.
├── index.html
├── tsconfig.json
├── vite.config.ts
├── public
│   └── images
│       └── .gitkeep
├── README.md
└── src
    ├── app.ts
    ├── config
    │   └── modules.ts
    ├── i18n
    │   ├── index.ts
    │   └── locales
    │       ├── en.json
    │       └── sv.json
    ├── main.ts
    ├── modules
    │   ├── electrostatics
    │   │   └── index.ts
    │   └── electrostatics-materials
    │       └── index.ts
    └── styles
        └── main.css
```

## Run

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173`.

Run the type checker:

```bash
npm run typecheck
```

## Assets

Place externally created images in `public/images/`.

Example:

- `public/images/university-logo.png`

Those files can then be referenced from the app with paths like `/images/university-logo.png`.

## Next steps

- Add the first electrostatics simulation view
- Add more modules under `src/modules`
- Replace the minimal router with a fuller app router if the project grows

## GitHub Pages

GitHub Pages should publish the built `dist/` output, not the repository root.

This repo now includes a workflow at `.github/workflows/deploy-pages.yml` that:

- installs dependencies
- runs `npm run typecheck`
- runs `npm test`
- runs `npm run build`
- deploys `dist/` to GitHub Pages

In the GitHub repository settings, set Pages to use **GitHub Actions** as the source.
