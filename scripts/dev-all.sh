#!/bin/sh
# pnpm dev:all - builds + starts the java backend (fake sensors on), then the website.
# ctrl + c stops both
#   pnpm dev:all --fresh         start the bins over from the seed data (wipes the local h2 db)
#   SIM_SPEED=30 pnpm dev:all    slower fake sensors (default 60 = 1 real minute is 1 hour)

cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
LOG="$ROOT/backend/out/backend.log"

# need a jdk for the backend
if ! command -v javac >/dev/null 2>&1; then
  echo "Java isn't installed (no javac found). Starting just the website."
  exec pnpm dev
fi

# backend already running? just start the website
if curl -s -m 2 http://localhost:8080/api/health >/dev/null 2>&1; then
  echo "Backend is already running on port 8080."
  exec pnpm dev
fi

# build the backend
echo "Building the backend..."
cd "$ROOT/backend" || exit 1

# --fresh: wipe the local database so bins start from the seed data again
if [ "$1" = "--fresh" ]; then
  rm -rf data
  echo "Starting fresh: local database reset."
fi
mkdir -p out
find src/main -name '*.java' > out/sources.txt
if ! javac -nowarn -d out -cp "lib/*" @out/sources.txt; then
  echo "The backend didn't build. Check the errors above."
  exit 1
fi

# fake sensors only on the local database, never on supabase
if [ -f db.properties ] || [ -n "$DB_URL" ]; then
  echo "Using Supabase, so fake sensors stay off."
  FAKE=false
else
  FAKE=true
fi

# start the backend in the background, its output goes to backend/out/backend.log
FAKE_SENSOR_ENABLED=$FAKE SENSOR_INTERVAL_SECONDS=5 SIM_SPEED=${SIM_SPEED:-60} \
  java -cp "out:src/main/resources:lib/*" main.java.trashtalk.wastemonitoring.Application > "$LOG" 2>&1 &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null' EXIT INT TERM

# wait up to 30s for it to answer
printf "Starting the backend"
i=0
until curl -s -m 2 http://localhost:8080/api/health >/dev/null 2>&1; do
  if ! kill -0 $BACKEND_PID 2>/dev/null || [ $i -ge 30 ]; then
    echo ""
    echo "The backend didn't start. Last lines of backend/out/backend.log:"
    tail -15 "$LOG"
    exit 1
  fi
  printf "."
  sleep 1
  i=$((i + 1))
done
echo " ready on http://localhost:8080 (fake sensors: $FAKE, speed: ${SIM_SPEED:-60}x)"

# start the website, ctrl + c stops both
cd "$ROOT" || exit 1
pnpm dev
