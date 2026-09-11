const { rmSync } = require("node:fs");
const { basename, join } = require("node:path");
const target = join(__dirname, ".cocurricular-test");
if (basename(target) !== ".cocurricular-test")
  throw new Error("Unexpected cleanup target");
rmSync(target, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
});
