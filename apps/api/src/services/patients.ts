import { Types } from 'mongoose';
import {
  doctorKey,
  doctorWords,
  type AdminIdentity,
  type PatientInput,
  type PatientQuery,
  type PatientUpdate,
} from '@doctor-tracker/shared';
import { DoctorModel } from '../models/doctor.js';
import { PatientModel } from '../models/patient.js';
import { AppError } from '../utils/errors.js';

const projection = 'name condition doctorId createdAt updatedAt';
const prefix = (value: string) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
function authorize(admin: AdminIdentity) {
  if (!admin || admin.role !== 'admin')
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
}
async function parent(id: string) {
  const doctor = await DoctorModel.findById(id)
    .select('name specialization')
    .maxTimeMS(3000)
    .lean();
  if (!doctor)
    throw new AppError(404, 'DOCTOR_NOT_FOUND', 'This doctor record could not be found.');
  return { id: doctor._id.toString(), name: doctor.name, specialization: doctor.specialization };
}
const missing = () =>
  new AppError(404, 'PATIENT_NOT_FOUND', 'This patient record could not be found.');
export function patientFilter(query: PatientQuery) {
  const filter: Record<string, unknown> = {};
  if (query.doctorId) filter.doctorId = new Types.ObjectId(query.doctorId);
  if (query.condition) filter.conditionKey = doctorKey(query.condition);
  if (query.q) {
    const words = doctorWords(query.q);
    if (words.length) filter.searchTokens = { $all: words.map(prefix) };
    else filter._id = { $in: [] };
  }
  if (query.from || query.to)
    filter.createdAt = {
      ...(query.from ? { $gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to
        ? { $lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86400_000) }
        : {}),
    };
  return filter;
}
type Stored = {
  _id: Types.ObjectId;
  name: string;
  condition: string;
  doctorId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
const present = (record: Stored, doctor: Awaited<ReturnType<typeof parent>>) => ({
  id: record._id.toString(),
  name: record.name,
  condition: record.condition,
  doctorId: record.doctorId.toString(),
  doctor,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
export async function createPatient(admin: AdminIdentity, doctorId: string, input: PatientInput) {
  authorize(admin);
  const doctor = await parent(doctorId);
  // Doctor removal is not exposed by this application. The validated parent is immutable here.
  const record = await PatientModel.create({
    name: input.name,
    condition: input.condition,
    doctorId,
  });
  return { patient: present(record, doctor) };
}
export async function listPatients(admin: AdminIdentity, query: PatientQuery, scope?: string) {
  authorize(admin);
  if (scope) await parent(scope);
  else if (query.doctorId) await parent(query.doctorId);
  const filter = patientFilter({ ...query, ...(scope ? { doctorId: scope } : {}) });
  const sort: Record<string, 1 | -1> =
    query.sort === 'name-asc'
      ? { nameKey: 1, _id: 1 }
      : query.sort === 'name-desc'
        ? { nameKey: -1, _id: -1 }
        : query.sort === 'oldest'
          ? { createdAt: 1, _id: 1 }
          : { createdAt: -1, _id: -1 };
  const count = PatientModel.countDocuments(filter).maxTimeMS(3000);
  if (!Object.keys(filter).length) count.hint('_id_');
  const [records, totalItems] = await Promise.all([
    PatientModel.find(filter)
      .select(projection)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .maxTimeMS(3000)
      .lean(),
    count,
  ]);
  // One bounded lookup for the whole page, never one query per patient.
  const doctors = await DoctorModel.find({
    _id: { $in: [...new Set(records.map((r) => r.doctorId.toString()))] },
  })
    .select('name specialization')
    .maxTimeMS(3000)
    .lean();
  const byId = new Map(
    doctors.map((d) => [
      d._id.toString(),
      { id: d._id.toString(), name: d.name, specialization: d.specialization },
    ]),
  );
  const totalPages = Math.ceil(totalItems / query.limit);
  return {
    items: records.map((r) =>
      present(
        r,
        byId.get(r.doctorId.toString()) ?? {
          id: r.doctorId.toString(),
          name: 'Doctor unavailable',
          specialization: '',
        },
      ),
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1 && totalItems > 0,
    },
  };
}
export async function getPatient(admin: AdminIdentity, id: string) {
  authorize(admin);
  const record = await PatientModel.findById(id).select(projection).maxTimeMS(3000).lean();
  if (!record) throw missing();
  return { patient: present(record, await parent(record.doctorId.toString())) };
}
export async function updatePatient(admin: AdminIdentity, id: string, input: PatientUpdate) {
  authorize(admin);
  // Only supplied fields are set atomically: parallel name/condition edits cannot overwrite each other.
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = input.name;
    set.nameKey = doctorKey(input.name);
  }
  if (input.condition !== undefined) {
    set.condition = input.condition;
    set.conditionKey = doctorKey(input.condition);
  }
  // Derive tokens from the resulting document in the same atomic database operation.
  const record = await PatientModel.findOneAndUpdate(
    { _id: id },
    [
      {
        $set: Object.fromEntries(
          Object.entries(set).map(([key, value]) => [key, { $literal: value }]),
        ),
      },
      {
        $set: {
          searchTokens: {
            $setUnion: [
              {
                $map: {
                  input: { $regexFindAll: { input: '$nameKey', regex: '[\\p{L}\\p{M}\\p{N}]+' } },
                  as: 'word',
                  in: '$$word.match',
                },
              },
              {
                $map: {
                  input: {
                    $regexFindAll: { input: '$conditionKey', regex: '[\\p{L}\\p{M}\\p{N}]+' },
                  },
                  as: 'word',
                  in: '$$word.match',
                },
              },
            ],
          },
          updatedAt: '$$NOW',
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  )
    .select(projection)
    .maxTimeMS(3000)
    .lean();
  if (!record) throw missing();
  return { patient: present(record, await parent(record.doctorId.toString())) };
}
export async function deletePatient(admin: AdminIdentity, id: string, doctorId?: string) {
  authorize(admin);
  if (doctorId) await parent(doctorId);
  const removed = await PatientModel.findOneAndDelete({
    _id: id,
    ...(doctorId ? { doctorId } : {}),
  })
    .select('_id')
    .maxTimeMS(3000)
    .lean();
  if (!removed) throw missing();
  return { deleted: true, id: removed._id.toString() };
}
