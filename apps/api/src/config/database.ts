import mongoose from 'mongoose';
import type { Config } from './env.js';
import { Admin, Invitation, Challenge, Session } from '../models/auth.js';
import { DoctorModel } from '../models/doctor.js';
import { PatientModel } from '../models/patient.js';

export const databaseModels = [Admin, Invitation, Challenge, Session, DoctorModel, PatientModel];

export async function connectDatabase(config: Config, prepareIndexes = false) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    waitQueueTimeoutMS: 5000,
    socketTimeoutMS: 15000,
    autoIndex: false,
    autoCreate: config.NODE_ENV !== 'production',
    ...(config.NODE_ENV === 'production' ? { tls: true } : {}),
  });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error('MongoDB must support transactions. Use Atlas or a local replica set.');
  }
  if (config.NODE_ENV !== 'production' || prepareIndexes) {
    // Only the explicit operator command opts into creation in production. Never sync/drop indexes.
    await Promise.all(databaseModels.map((model) => model.createIndexes()));
  } else {
    for (const model of databaseModels) {
      const difference = await model.diffIndexes();
      if (difference.toCreate.length)
        throw new Error(
          'Required database indexes are missing or incompatible. Run the approved database preparation procedure.',
        );
    }
  }
}
