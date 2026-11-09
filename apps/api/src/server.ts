import mongoose from 'mongoose';
import { loadConfig, ConfigurationError } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { createRuntime } from './runtime.js';

async function start() {
  if (process.argv.includes('--require-production') && process.env.NODE_ENV !== 'production')
    throw new ConfigurationError(['NODE_ENV'], 'Production start requires NODE_ENV=production.');
  const config = loadConfig();
  mongoose.connection.on('error', () => logger.error({ event: 'database_error' }));
  mongoose.connection.on('disconnected', () => logger.warn({ event: 'database_disconnected' }));
  mongoose.connection.on('reconnected', () => logger.info({ event: 'database_reconnected' }));
  await connectDatabase(config);
  const state = { draining: false };
  const app = await createApp(config, state);
  const { server, shutdown } = createRuntime(app, state);
  server.listen(config.PORT, config.HOST, () =>
    logger.info({ event: 'server_started', port: config.PORT }),
  );
  process.on('SIGINT', () => {
    void shutdown().then((code) => process.exit(code));
  });
  process.on('SIGTERM', () => {
    void shutdown().then((code) => process.exit(code));
  });
  server.on('error', () => {
    logger.error({ event: 'server_error' });
    void shutdown(1).then((code) => process.exit(code));
  });
}
start().catch((error: unknown) => {
  if (error instanceof ConfigurationError)
    logger.fatal({ event: 'configuration_invalid', fields: error.fields });
  logger.fatal({
    event: 'startup_failed',
    message:
      'Check environment variables, MongoDB availability, replica-set configuration, and database permissions.',
  });
  process.exit(1);
});
