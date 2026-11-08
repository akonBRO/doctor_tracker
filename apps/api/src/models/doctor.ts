import { Schema, model } from 'mongoose';
import {
  doctorInputSchema,
  doctorKey,
  doctorWords,
  normalizeDoctorText,
} from '@doctor-tracker/shared';

const field = (max: number) => ({
  type: String,
  required: true,
  maxlength: max,
  minlength: 1,
  set: normalizeDoctorText,
});
const schema = new Schema(
  {
    name: field(120),
    specialization: field(100),
    hospital: field(160),
    phone: {
      type: String,
      required: true,
      maxlength: 40,
      trim: true,
      validate: (value: string) => doctorInputSchema.shape.phone.safeParse(value).success,
    },
    email: {
      type: String,
      required: true,
      maxlength: 254,
      trim: true,
      lowercase: true,
      validate: (value: string) => doctorInputSchema.shape.email.safeParse(value).success,
    },
    nameKey: { type: String, required: true, select: false },
    specializationKey: { type: String, required: true, select: false },
    hospitalKey: { type: String, required: true, select: false },
    searchTokens: { type: [String], required: true, select: false },
  },
  { timestamps: true, strict: 'throw' },
);

schema.pre('validate', function () {
  for (const key of ['name', 'specialization', 'hospital'] as const) {
    const parsed = doctorInputSchema.shape[key].safeParse(this[key]);
    if (!parsed.success) this.invalidate(key, parsed.error.issues[0]!.message);
  }
  this.nameKey = doctorKey(this.name ?? '');
  this.specializationKey = doctorKey(this.specialization ?? '');
  this.hospitalKey = doctorKey(this.hospital ?? '');
  this.searchTokens = [
    ...new Set(doctorWords(`${this.name} ${this.specialization} ${this.hospital}`)),
  ];
});
schema.index({ createdAt: -1, _id: -1 });
schema.index({ nameKey: 1, _id: 1 });
schema.index({ specializationKey: 1, createdAt: -1, _id: -1 });
schema.index({ hospitalKey: 1, createdAt: -1, _id: -1 });
schema.index({ specializationKey: 1, hospitalKey: 1, createdAt: -1, _id: -1 });
schema.index({ searchTokens: 1 });
export const DoctorModel = model('Doctor', schema);
