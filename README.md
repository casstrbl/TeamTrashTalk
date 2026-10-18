# TeamTrashTalk

Smart campus waste bin monitoring system for the Sac State sustainability office. It tracks how full each tribin (landfill, recycling, compost) is so staff only visit the bins that need emptying.

## What's in here

| Folder | What it is |
|---|---|
| `src/` | React dashboard website, built with Vite |
| `backend/` | Java server, database setup and sensor logic |
| `docs/` | Early HTML mockup from Sprint 1 |
| `.github/workflows/` | Publishes the website to GitHub Pages on every push to `main` |

## Run the backend

You need a JDK and either VS Code (with Extension Pack for Java) or Eclipse.

1. Set `backend/src` as the source folder, since the packages start with `main.java...`. In VS Code, run `Java: Configure Classpath`, open the Sources tab and add `backend/src`.
2. Add every `.jar` in `backend/lib` to the classpath.
3. To use Supabase, copy `backend/db.properties.example` to `backend/db.properties` and add the database password. Without that file the backend uses a local H2 database instead. The `DB_URL`, `DB_USER` and `DB_PASSWORD` environment variables override the file.
4. Run `Application.java`. The server starts on `http://localhost:8080`.

Routes:

- `/api/health`
- `/api/tribins`
- `/api/tribins/{id}/history`
- `/api/pickups`

## Run the website

You need Node and pnpm.

1. Run `pnpm install`, then `pnpm dev`.
2. Open `http://localhost:5173/TeamTrashTalk/`.

While `pnpm dev` is running, it forwards `/api` requests to the backend on port 8080, so no extra setup is needed. To point the site at a different backend, set `VITE_API_URL` in a `.env` file.

If the backend isn't running, the site falls back to the sample bins in `src/data/mockBins.ts`.

## Notes

- Never commit `backend/db.properties` or `.env`. Both are in `.gitignore`.
- The GitHub Pages site only hosts the website, so it shows the sample bins.
- The tests in `backend/src/test` need JUnit, which isn't in `backend/lib` yet.
