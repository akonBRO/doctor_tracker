import type { AdminIdentity, Doctor, DoctorInput, DoctorQuery } from '@doctor-tracker/shared';
import { doctorKey, doctorWords } from '@doctor-tracker/shared';
import { DoctorModel } from '../models/doctor.js';
import { AppError } from '../utils/errors.js';

const projection = {
  name: 1,
  specialization: 1,
  hospital: 1,
  phone: 1,
  email: 1,
  createdAt: 1,
  updatedAt: 1,
};
const literalPrefix = (value: string) =>
  new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const authorize = (admin: AdminIdentity) => {
  if (!admin || admin.role !== 'admin')
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
};
type StoredDoctor = {
  _id: { toString(): string };
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};
const present = (record: StoredDoctor): Doctor => ({
  id: record._id.toString(),
  name: record.name,
  specialization: record.specialization,
  hospital: record.hospital,
  phone: record.phone,
  email: record.email,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
export function doctorFilter(query: DoctorQuery) {
  const filter: Record<string, unknown> = {};
  if (query.q) {
    const terms = doctorWords(query.q);
    if (terms.length) filter.searchTokens = { $all: terms.map(literalPrefix) };
    else filter._id = { $in: [] };
  }
  if (query.specialization) filter.specializationKey = doctorKey(query.specialization);
  if (query.hospital) filter.hospitalKey = doctorKey(query.hospital);
  if (query.from || query.to)
    filter.createdAt = {
      ...(query.from ? { $gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to
        ? { $lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86400_000) }
        : {}),
    };
  return filter;
}
export async function createDoctor(admin: AdminIdentity, input: DoctorInput) {
  authorize(admin);
  return present(
    await DoctorModel.create({
      name: input.name,
      specialization: input.specialization,
      hospital: input.hospital,
      phone: input.phone,
      email: input.email,
    }),
  );
}
export async function listDoctors(admin: AdminIdentity, query: DoctorQuery) {
  authorize(admin);
  const filter = doctorFilter(query);
  const sort: Record<string, 1 | -1> =
    query.sort === 'name-asc'
      ? { nameKey: 1, _id: 1 }
      : query.sort === 'name-desc'
        ? { nameKey: -1, _id: -1 }
        : query.sort === 'oldest'
          ? { createdAt: 1, _id: 1 }
          : { createdAt: -1, _id: -1 };
  const count = DoctorModel.countDocuments(filter).maxTimeMS(3000);
  if (!Object.keys(filter).length) count.hint('_id_');
  const [items, totalItems] = await Promise.all([
    DoctorModel.find(filter)
      .select(projection)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .maxTimeMS(3000)
      .lean(),
    count,
  ]);
  const totalPages = Math.ceil(totalItems / query.limit);
  return {
    items: items.map(present),
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
export async function getDoctor(admin: AdminIdentity, id: string) {
  authorize(admin);
  const record = await DoctorModel.findById(id).select(projection).maxTimeMS(3000).lean();
  if (!record)
    throw new AppError(404, 'DOCTOR_NOT_FOUND', 'This doctor record could not be found.');
  return { doctor: present(record) };
}
export async function doctorOptions(
  admin: AdminIdentity,
  field: 'specialization' | 'hospital',
  q: string,
) {
  authorize(admin);
  const key = `${field}Key`;
  // distinct() has no result limit: this bounded, indexed-prefix aggregation avoids an unbounded response.
  const rows = await DoctorModel.aggregate<{ _id: string; label: string }>([
    { $match: { [key]: literalPrefix(doctorKey(q)) } },
    { $group: { _id: `$${key}`, label: { $min: `$${field}` } } },
    { $sort: { _id: 1 } },
    { $limit: 21 },
  ]).option({ maxTimeMS: 3000 });
  return { values: rows.slice(0, 20).map((row) => row.label), hasMore: rows.length > 20 };
}
