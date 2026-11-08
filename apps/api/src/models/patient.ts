import { Schema, model } from 'mongoose';
import {
  doctorKey,
  doctorWords,
  normalizeDoctorText,
  patientInputSchema,
} from '@doctor-tracker/shared';

const schema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120, set: normalizeDoctorText },
    condition: { type: String, required: true, maxlength: 160, set: normalizeDoctorText },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, immutable: true },
    nameKey: { type: String, required: true, select: false },
    conditionKey: { type: String, required: true, select: false },
    searchTokens: { type: [String], required: true, select: false },
  },
  { timestamps: true, strict: 'throw' },
);
schema.pre('validate', function () {
  for (const key of ['name', 'condition'] as const) {
    const result = patientInputSchema.shape[key].safeParse(this[key]);
    if (!result.success) this.invalidate(key, result.error.issues[0]!.message);
  }
  this.nameKey = doctorKey(this.name ?? '');
  this.conditionKey = doctorKey(this.condition ?? '');
  this.searchTokens = [...new Set(doctorWords(`${this.name} ${this.condition}`))];
});
schema.index({ createdAt: -1, _id: -1 });
schema.index({ nameKey: 1, _id: 1 });
schema.index({ doctorId: 1, createdAt: -1, _id: -1 });
schema.index({ conditionKey: 1, createdAt: -1, _id: -1 });
schema.index({ doctorId: 1, conditionKey: 1, createdAt: -1, _id: -1 });
schema.index({ searchTokens: 1 });
export const PatientModel = model('Patient', schema);
