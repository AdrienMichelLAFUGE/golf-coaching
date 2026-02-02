const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function fail(message) {
  console.error(`[db] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let envKey;
let migrationPath;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--env") {
    envKey = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith("--")) {
    continue;
  }
  if (!migrationPath) {
    migrationPath = arg;
  }
}

if (!envKey) {
  fail("Missing --env DATABASE_URL_*.");
}
if (!migrationPath) {
  fail(
    "Missing migration path. Example: npm run db:staging:apply -- supabase/migrations/20260202000100_baseline.sql"
  );
}

const databaseUrl = process.env[envKey];
if (!databaseUrl) {
  fail(`Missing required env var ${envKey}.`);
}

if (!fs.existsSync(migrationPath)) {
  fail(`Migration file not found: ${migrationPath}`);
}

const resolvedPath = path.resolve(migrationPath);
const result = spawnSync(
  "psql",
  ["-v", "ON_ERROR_STOP=1", "-f", resolvedPath, databaseUrl],
  { stdio: "inherit" }
);

if (result.error) {
  if (result.error.code === "ENOENT") {
    fail("psql not found in PATH. Install PostgreSQL client tools.");
  }
  throw result.error;
}

process.exit(result.status ?? 1);
