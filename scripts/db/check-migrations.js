const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`[db] ${message}`);
  process.exit(1);
}

const migrationsDir = path.resolve("supabase", "migrations");
if (!fs.existsSync(migrationsDir)) {
  fail("Missing supabase/migrations directory.");
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.toLowerCase().endsWith(".sql"))
  .map((file) => path.join(migrationsDir, file));

const errors = [];

const insertRegex = /\bINSERT\s+INTO\b/i;
const createFunctionRegex = /\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i;
const asDollarRegex = /\bAS\s+(\$[^$]*\$)/i;

for (const filePath of files) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  let inFunction = false;
  let pendingFunction = false;
  let dollarTag = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("--") || trimmed === "") {
      continue;
    }

    if (inFunction && dollarTag) {
      if (trimmed.endsWith(`${dollarTag};`)) {
        inFunction = false;
        dollarTag = null;
      }
      continue;
    }

    if (pendingFunction) {
      const asMatch = trimmed.match(asDollarRegex);
      if (asMatch) {
        inFunction = true;
        dollarTag = asMatch[1];
        pendingFunction = false;
      }
      continue;
    }

    if (createFunctionRegex.test(trimmed)) {
      const asMatch = trimmed.match(asDollarRegex);
      if (asMatch) {
        inFunction = true;
        dollarTag = asMatch[1];
      } else {
        pendingFunction = true;
      }
      continue;
    }

    if (insertRegex.test(trimmed)) {
      errors.push({ filePath, line: i + 1, content: trimmed });
    }
  }
}

if (errors.length > 0) {
  console.error("[db] Found INSERT INTO statements in migrations:");
  for (const err of errors) {
    console.error(`- ${err.filePath}:${err.line} ${err.content}`);
  }
  process.exit(1);
}
