# RideFlow

RideFlow is organized into separate frontend and backend applications.

## Project structure

- `frontend/` — React, Vite, styles, maps, and browser environment settings.
- `backend/` — Express API, MongoDB models, controllers, and server environment settings.
- `compose.yaml` — local MongoDB container.
- Root `package.json` — convenience commands for running both applications.

## Install and run locally

From the project root, install each application's dependencies:

```powershell
npm install --prefix frontend
npm install --prefix backend
```

Set frontend settings in `frontend/.env` and API/database settings in `backend/.env` using the corresponding `.env.example` files as a guide. Keep those secret files private.

Start MongoDB with Docker Desktop running:

```powershell
npm run db:up
```

Then use separate terminals from the project root:

```powershell
npm run server
npm run dev
```

Open the frontend URL printed by Vite, usually `http://localhost:5173`.

Other root commands include `npm run build`, `npm run seed:admin`, and `npm run db:down`.

## Deploy: Render API + Vercel frontend

### 1. Create the Vercel frontend project

Import this repository into Vercel and set **Root Directory** to `frontend`. Vercel will use the Vite build (`npm run build`) and `dist` output. `frontend/vercel.json` proxies API requests and includes the SPA rewrite so routes such as `/admin/login` work when opened directly. The API will be unavailable until the Render service is deployed.

Add these Vercel Production environment variables:

- `VITE_GOOGLE_CLIENT_ID` — your Google OAuth Web client ID.
- `VITE_GOOGLE_MAPS_API_KEY` — optional; OpenStreetMap remains the fallback.

### 2. Deploy the Render backend

Create a Render Blueprint from the repository's root `render.yaml`, or create a Node web service manually with **Root Directory** `backend`, **Build Command** `npm install`, and **Start Command** `npm start`. The health-check path is `/api/health`.

Set these Render environment variables:

- `MONGODB_URI` — your Atlas URI. Rotate the database password shared earlier, then URL-encode reserved characters in the new database user's username/password (for example, `@` becomes `%40` and `#` becomes `%23`).
- `MONGODB_DB` — `rideflow`.
- `CLIENT_URL` — the exact Vercel production origin, such as `https://your-app.vercel.app`, without a path.
- `GOOGLE_CLIENT_ID` — the same Web client ID used by `VITE_GOOGLE_CLIENT_ID`.
- `JWT_SECRET` — a unique random secret of at least 32 characters. The Blueprint generates one.
- `NODE_ENV=production` and `COOKIE_SAME_SITE=lax` (the Blueprint sets both; browser API calls use the Vercel same-origin proxy).

Vercel proxies `/api/*` to `https://rideflow-api-vp3e.onrender.com/api/*` using `frontend/vercel.json`. If Render assigns a different hostname, update that rewrite destination and redeploy Vercel. `CLIENT_URL` must match the final Vercel production domain; if it changes, update the Render setting and restart the service.

### 3. Configure Google OAuth and Atlas

In Google Cloud Console, open the OAuth **Web application** client used by RideFlow and add the exact Vercel production origin to **Authorized JavaScript origins**. Add any Vercel preview origins you intend to use. Set the backend `GOOGLE_CLIENT_ID` on Render and the frontend `VITE_GOOGLE_CLIENT_ID` on Vercel to the same client ID. If using Google Maps tiles, restrict the Maps key to the Vercel frontend origin. Vercel preview origins also need to be included in Render's comma-separated `CLIENT_URL` value if you want API access from previews.

In MongoDB Atlas, add the Render service's outbound IP addresses to the project's IP access list, or use an appropriate network access option for your deployment. Do not commit either `.env` file or place Atlas credentials in Vercel variables; the Atlas URI belongs only on Render.

### 4. Create the admin account

Render's Free web service does not provide dashboard Shell access. To create the production admin, set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD` (at least 12 characters), and the production Atlas `MONGODB_URI` in your local `backend/.env`. Temporarily add your current public IP to Atlas **Network Access → IP Access List** as well as Render's outbound IP ranges. From the project root, run:

```powershell
npm run seed:admin
```

Remove your temporary local IP access-list entry afterward; keep Render's ranges. Never commit or share the `.env` values.
