import mongoose from 'mongoose';
import { loadConfig } from '../config/env.js';
import { connectDatabase } from '../config/database.js';

// Privileged, explicit release operation. Not called by application startup or CI against Atlas.
async function main() {
  if (process.argv.slice(2).join(' ') !== '--apply-indexes')
    throw new Error('Explicit index preparation approval is required.');
  await connectDatabase(loadConfig(), true);
  process.stdout.write('Required indexes prepared; no indexes or records were deleted.\n');
}
main()
  .catch(() => {
    process.stderr.write(
      'Database preparation failed. Check configuration, access and index compatibility using the release runbook.\n',
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
