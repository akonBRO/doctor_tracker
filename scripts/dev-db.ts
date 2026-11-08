import { MongoMemoryReplSet } from 'mongodb-memory-server';
const database = await MongoMemoryReplSet.create({
  instanceOpts: [{ port: 27017 }],
  replSet: { count: 1, name: 'rs0', dbName: 'doctor_tracker' },
});
console.log(
  'Disposable development MongoDB ready at 127.0.0.1:27017 (replica set rs0). Data is removed on exit. Use Atlas or a persistent replica set to keep accounts.',
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await database.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
