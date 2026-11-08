import mongoose from 'mongoose';
import type { Config } from './env.js';
import { Admin, Invitation, Challenge, Session } from '../models/auth.js';
import { DoctorModel } from '../models/doctor.js';

export async function connectDatabase(config: Config) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    autoIndex: false,
  });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error('MongoDB must support transactions. Use Atlas or a local replica set.');
  }
  await Promise.all([
    Admin.createIndexes(),
    Invitation.createIndexes(),
    Challenge.createIndexes(),
    Session.createIndexes(),
    DoctorModel.createIndexes(),
  ]);
}
