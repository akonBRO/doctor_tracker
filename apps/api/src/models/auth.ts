import { Schema, model, type InferSchemaType } from 'mongoose';

const adminSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin'], default: 'admin', required: true },
    disabled: { type: Boolean, default: false },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    lastTotpStep: { type: Number, default: -1 },
    recoveryHashes: { type: [String], default: [], select: false },
  },
  { timestamps: true },
);

const invitationSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const challengeSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    kind: { type: String, enum: ['enroll', 'verify'], required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
);

const sessionSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
);

export const Admin = model('Admin', adminSchema);
export const Invitation = model('Invitation', invitationSchema);
export const Challenge = model('Challenge', challengeSchema);
export const Session = model('Session', sessionSchema);
export type AdminRecord = InferSchemaType<typeof adminSchema> & {
  _id: Schema.Types.ObjectId | { toString(): string };
};
