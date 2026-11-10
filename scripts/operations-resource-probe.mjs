// Test-only preload, never enabled by deployment services. Writes a numeric whitelist.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setInterval } from 'node:timers';

const base = fileURLToPath(new URL('../tmp/stage7/', import.meta.url));
const directory = process.env.OPERATIONS_PROFILE_DIR && resolve(process.env.OPERATIONS_PROFILE_DIR);
if (directory) {
  const within = relative(base, directory);
  if (within.startsWith('..') || isAbsolute(within) || directory === resolve(base))
    throw new Error('Invalid resource-profile destination.');
  mkdirSync(directory, { recursive: true });
  const record = (exitCode = null) => {
    const memory = process.memoryUsage();
    const usage = process.resourceUsage();
    writeFileSync(
      join(directory, `${process.pid}.json`),
      JSON.stringify({
        role: process.env.OPERATIONS_PROFILE_ROLE ?? 'worker',
        pid: process.pid,
        node: process.version,
        platform: process.platform,
        exitCode,
        elapsedMs: process.uptime() * 1000,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        peakRssBytes: usage.maxRSS * 1024,
        userCpuMs: usage.userCPUTime / 1000,
        systemCpuMs: usage.systemCPUTime / 1000,
      }),
    );
  };
  record();
  setInterval(record, 1000).unref();
  process.once('exit', record);
}
