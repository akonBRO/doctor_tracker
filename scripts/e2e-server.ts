import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase } from '../apps/api/src/config/database.js';
import { loadConfig } from '../apps/api/src/config/env.js';
import { createApp } from '../apps/api/src/app.js';
import { randomToken } from '../apps/api/src/utils/security.js';

const database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const config = loadConfig({
  NODE_ENV: 'test',
  MONGODB_URI: database.getUri(),
  WEB_ORIGIN: 'http://localhost:3000',
  JWT_SECRET: randomToken(),
  MFA_ENCRYPTION_KEY: randomToken(),
  CSRF_SECRET: randomToken(),
  COOKIE_SECURE: 'false',
});
await connectDatabase(config);
const app = await createApp(config);
const server = app.listen(4000, '127.0.0.1', () => {
  process.send?.({ uri: database.getUri() });
});
server.on('error', () => {
  void shutdown(1);
});
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await database.stop();
  process.exit(code);
}
process.on('message', (message) => {
  if (message === 'stop') void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
