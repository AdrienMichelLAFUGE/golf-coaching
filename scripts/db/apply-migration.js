const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    // Keep existing env as the source of truth.
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function fail(message) {
  console.error(`[db] ${message}`);
  process.exit(1);
}

function escapeSqlLiteral(value) {
  return value.replace(/'/g, "''");
}

function getMigrationMeta(filePath) {
  const base = path.basename(filePath);
  const withoutExt = base.replace(/\.sql$/i, "");
  const parts = withoutExt.split("_");
  const version = parts[0] || withoutExt;
  const name = parts.length > 1 ? parts.slice(1).join("_") : withoutExt;
  return { base, version, name };
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

// Load local env files so `npm run db:*:apply` works without manually exporting vars.
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

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

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

const meta = getMigrationMeta(resolvedPath);
const version = escapeSqlLiteral(meta.version);
const name = escapeSqlLiteral(meta.name);
const filename = escapeSqlLiteral(meta.base);
const insertSql = `
DO $$
BEGIN
  IF to_regclass('public.app_migrations') IS NOT NULL THEN
    INSERT INTO public.app_migrations (version, name, filename)
    VALUES ('${version}', '${name}', '${filename}')
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END $$;
`;

const insertResult = spawnSync(
  "psql",
  ["-v", "ON_ERROR_STOP=1", "-c", insertSql, databaseUrl],
  { stdio: "inherit" }
);

if (insertResult.error) {
  if (insertResult.error.code === "ENOENT") {
    fail("psql not found in PATH. Install PostgreSQL client tools.");
  }
  throw insertResult.error;
}

process.exit(insertResult.status ?? 1);
