# Electricity

A lightweight scaffold for an electricity teaching web app with support for:

- multiple course modules
- lecture-friendly navigation
- student self-study exploration
- Swedish and English translations

## Current modules

- Electrostatics

## Structure

```text
.
├── index.html
├── public
│   └── images
│       └── .gitkeep
├── README.md
└── src
    ├── app.js
    ├── config
    │   └── modules.js
    ├── i18n
    │   ├── index.js
    │   └── locales
    │       ├── en.json
    │       └── sv.json
    ├── main.js
    ├── modules
    │   └── electrostatics
    │       └── index.js
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

## Assets

Place externally created images in `public/images/`.

Example:

- `public/images/university-logo.png`

Those files can then be referenced from the app with paths like `/images/university-logo.png`.

## Next steps

- Add the first electrostatics simulation view
- Add more modules under `src/modules`
- Replace the minimal router with a fuller app router if the project grows
- Add build and deployment steps once the app is ready to publish
