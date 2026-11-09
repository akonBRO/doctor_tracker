import { Schema, model, type Types } from 'mongoose';
import {
  doctorKey,
  doctorWords,
  normalizeDoctorText,
  patientRecordSchema,
  PATIENT_RECORD_FIELDS,
  type PatientRecord,
} from '@doctor-tracker/shared';

export type StoredPatient = PatientRecord & {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  nameKey: string;
  conditionKey: string;
  searchTokens: string[];
  createdAt: Date;
  updatedAt: Date;
};
const optionalText = (max: number) => ({ type: String, maxlength: max });
const schema = new Schema<StoredPatient>(
  {
    name: { type: String, required: true, maxlength: 120, set: normalizeDoctorText },
    condition: { type: String, required: true, maxlength: 160, set: normalizeDoctorText },
    nameBangla: optionalText(120),
    dateOfBirth: optionalText(10),
    approximateAge: {
      type: new Schema({ value: Number, unit: String }, { _id: false, strict: 'throw' }),
      required: false,
    },
    gender: optionalText(20),
    bloodGroup: optionalText(7),
    mobile: optionalText(40),
    email: optionalText(254),
    division: optionalText(60),
    district: optionalText(60),
    upazila: optionalText(100),
    addressLine: optionalText(300),
    postalCode: optionalText(4),
    emergencyContact: {
      type: new Schema(
        { name: String, relationship: String, mobile: String, relationshipOther: String },
        { _id: false, strict: 'throw' },
      ),
      required: false,
    },
    chiefComplaint: optionalText(1000),
    allergyStatus: optionalText(10),
    allergies: optionalText(1000),
    medicalHistory: optionalText(2000),
    currentMedications: optionalText(1000),
    clinicalNotes: optionalText(2000),
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, immutable: true },
    nameKey: { type: String, required: true, select: false },
    conditionKey: { type: String, required: true, select: false },
    searchTokens: { type: [String], required: true, select: false },
  },
  { timestamps: true, strict: 'throw' },
);
schema.pre('validate', function () {
  const source = this.toObject();
  const result = patientRecordSchema.safeParse(
    Object.fromEntries(
      PATIENT_RECORD_FIELDS.filter((key) => source[key] !== undefined).map((key) => [
        key,
        source[key],
      ]),
    ),
  );
  if (!result.success)
    for (const issue of result.error.issues) this.invalidate(String(issue.path[0]), issue.message);
  else this.set(result.data);
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
