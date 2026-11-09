import { createServer } from 'node:http';
import type { Express } from 'express';
import mongoose from 'mongoose';
import { logger } from './utils/logger.js';

export type RuntimeState = { draining: boolean };

export function createRuntime(
  app: Express,
  state: RuntimeState,
  disconnect = () => mongoose.disconnect(),
  graceMs = 10000,
) {
  const server = createServer({ maxHeaderSize: 16384 }, app);
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  server.setTimeout(30000, (socket) => socket.destroy());
  let stopping: Promise<number> | undefined;
  function shutdown(exitCode = 0): Promise<number> {
    if (stopping) return stopping;
    state.draining = true;
    logger.info({ event: 'server_draining' });
    stopping = new Promise<number>((resolve) => {
      const timer = setTimeout(() => {
        server.closeAllConnections();
        logger.error({ event: 'shutdown_deadline_exceeded' });
        resolve(1);
      }, graceMs);
      server.close(() => {
        void disconnect()
          .then(() => {
            clearTimeout(timer);
            logger.info({ event: 'server_stopped' });
            resolve(exitCode);
          })
          .catch(() => {
            clearTimeout(timer);
            logger.error({ event: 'shutdown_failed' });
            resolve(1);
          });
      });
    });
    return stopping;
  }
  return { server, shutdown };
}
