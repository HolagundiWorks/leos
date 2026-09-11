const { rmSync } = require('node:fs');
const { join, basename } = require('node:path');
const target = join(__dirname, '.operations-test');
if (basename(target) !== '.operations-test') throw new Error('Unexpected cleanup target');
rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
