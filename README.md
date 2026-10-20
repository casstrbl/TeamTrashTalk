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

## Sprint 3: Fake sensor timer (Waiss)

The fake sensor service already simulated **one** reading. The optional
`FakeSensorScheduler` now simulates an ongoing stream, saves its results to the
local database, and the React dashboard refreshes `/api/tribins` every 5 seconds.

**Important:** It is off by default. Use the local H2 database for the demo;
never turn it on while pointing at a shared production/Supabase database.

For a demo on macOS, set the variables in the terminal **before** starting
`Application.java` in that same terminal:

```bash
export FAKE_SENSOR_ENABLED=true
export SENSOR_INTERVAL_SECONDS=5
```

In VS Code's Java launch configuration, you can instead set these in `env`.
The seconds setting accepts integer values from 1 to 3600. The timer starts
immediately, then sends another reading after every interval. Stop the Java
server to stop it. Unset `FAKE_SENSOR_ENABLED` to disable simulation.

Each simulated reading uses the existing `FakeSensorService` and gateway path.
The scheduler then saves the updated bin heights and `lastUpdated` timestamps
so the dashboard can read them. The simulator skips offline bins and clamps
fill height to `Bin.BIN_HEIGHT` (currently a placeholder 77 cm). These values
simulate **waste height** for the demo; real HC-SR04 sensors report distance
from sensor to trash and still need calibration/conversion.

To verify: run the local backend with simulation enabled; open
`http://localhost:8080/api/tribins` twice a few seconds apart. Fill levels
should rise. Then run `pnpm dev` and open the local dashboard, which polls the
API. GitHub Pages has no Java backend and will continue to show mock data.
