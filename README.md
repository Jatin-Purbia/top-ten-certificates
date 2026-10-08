# Enterprise Certificate Distribution & Magazine Results

## How to run the app

1. Install dependencies (from the repo root):

   ```bash
   npm install
   ```

2. Create your env file (on Windows PowerShell use `Copy-Item .env.example .env`):

   ```bash
   cp .env.example .env
   ```

3. Start the web app and API together:

   ```bash
   npm run dev
   ```

4. Open the apps:

   - Admin login: http://localhost:3000/admin/login
   - Public claim page: http://localhost:3000/certificate/claim/{cycle-public-slug}
   - API docs: http://localhost:4000/api/docs

To run against a real database instead of demo data, set `DEMO_MODE=false` in `.env`, then run `docker compose up mongo mongo-init -d` and `npm run seed`. To build and start production containers, run `docker compose up --build`.
