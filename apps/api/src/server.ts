import mongoose from 'mongoose';
import { loadConfig } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

async function start() {
  const config = loadConfig();
  await connectDatabase(config);
  const app = await createApp(config);
  const server = app.listen(config.PORT, () =>
    logger.info({ event: 'server_started', port: config.PORT }),
  );
  let stopping = false;
  async function shutdown(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(timer);
      process.exit(exitCode);
    });
  }
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
  server.on('error', () => {
    logger.error({ event: 'server_error' });
    void shutdown(1);
  });
}
start().catch(() => {
  logger.fatal({
    event: 'startup_failed',
    message:
      'Check environment variables, MongoDB availability, replica-set configuration, and database permissions.',
  });
  process.exit(1);
});
