# frontend (fastapi-vite-shadcn)

React 19 + JavaScript on **Vite**, Tailwind CSS **v4** via `@tailwindcss/vite` (theme tokens live in
`src/index.css` under `@theme`; there is no `tailwind.config.js`/`postcss.config.js`), shadcn/ui (Radix),
react-router-dom, axios, TanStack Query (`QueryClientProvider` mounted in `src/index.js`, client in
`src/lib/queryClient.js`).

Same conventions as the classic `shadcn` (fastapi_react_mongo_shadcn) template: JSX lives in `.js` files (`src/index.js`,
`src/App.js`), the `@/*` alias maps to `src/*`, and the frontend reads
`process.env.REACT_APP_BACKEND_URL` from `frontend/.env` (Vite inlines every `REACT_APP_*` key
at build time via `vite.config.mjs`).

For local setup, copy `frontend/.env.example` to `frontend/.env` and set the backend URL.
Copy `backend/.env.example` to `backend/.env` and replace its placeholders with your local
database connection and private credentials. Never commit the populated `.env` files.

## Scripts

- `yarn start` / `yarn dev` — Vite dev server on port 3000 (supervisor runs `yarn start`)
- `yarn build` — production bundle into `build/`
- `yarn preview` — serve the production bundle locally

Hot reload is always enabled via Vite HMR and polling so file changes are reflected in the
Emergent preview. Restart the `frontend` supervisor program only after changing `.env` or
`vite.config.mjs`, or after installing dependencies (`yarn add`, never npm).

Visual edits: the packaged `@emergentbase/visual-edits` plugin tags `.jsx`/`.tsx`; because this
template keeps JSX in `.js`, `vite.config.mjs` stamps the same `x-*` metadata on `src/**/*.js`
before compiling the JSX (dev server only; `DISABLE_VISUAL_EDITS=true` turns it off).
