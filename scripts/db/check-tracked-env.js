const { execSync } = require("child_process");

let output = "";
try {
  output = execSync("git ls-files .env*", { encoding: "utf8" }).trim();
} catch (error) {
  console.error("[db] Failed to run git ls-files to check tracked env files.");
  throw error;
}

if (output.length > 0) {
  console.error("[db] Tracked .env files detected. Remove them from git:");
  console.error(output);
  process.exit(1);
}
