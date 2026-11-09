import type { PipelineStage } from 'mongoose';
import {
  dashboardDateRange,
  type AdminIdentity,
  type DashboardPeriod,
  type DashboardDistributionQuery,
  type DashboardOverview,
  type DashboardDistribution,
  type DashboardTrends,
} from '@doctor-tracker/shared';
import { DoctorModel } from '../models/doctor.js';
import { PatientModel } from '../models/patient.js';
import { AppError } from '../utils/errors.js';

const queryBudget = 3000;
function authorize(admin: AdminIdentity) {
  if (!admin || admin.role !== 'admin')
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
}
async function analytics<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    // Never include raw database errors, records or aggregate stages in responses/logs.
    throw new AppError(
      503,
      'DASHBOARD_UNAVAILABLE',
      'Dashboard data is temporarily unavailable. Please try again.',
    );
  }
}
export async function dashboardOverview(admin: AdminIdentity): Promise<DashboardOverview> {
  authorize(admin);
  return analytics(async () => {
    const [totalDoctors, totalPatients] = await Promise.all([
      DoctorModel.countDocuments({}).hint('_id_').maxTimeMS(queryBudget).exec(),
      PatientModel.countDocuments({}).hint('_id_').maxTimeMS(queryBudget).exec(),
    ]);
    return { totalDoctors, totalPatients, asOf: new Date().toISOString() };
  });
}
export function distributionPipeline(query: DashboardDistributionQuery): PipelineStage[] {
  return [
    { $project: { _id: 1, name: 1 } },
    // Count in the lookup, rather than materializing arrays of patient documents.
    // Starting from doctors retains zero-patient doctors. The doctorId index prefix covers the join.
    {
      $lookup: {
        from: PatientModel.collection.name,
        localField: '_id',
        foreignField: 'doctorId',
        pipeline: [{ $count: 'count' }],
        as: 'assignment',
      },
    },
    { $set: { patientCount: { $ifNull: [{ $arrayElemAt: ['$assignment.count', 0] }, 0] } } },
    { $project: { _id: 1, doctorId: { $toString: '$_id' }, doctorName: '$name', patientCount: 1 } },
    { $sort: { patientCount: -1, _id: 1 } },
    {
      $facet: {
        items: [
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          { $project: { _id: 0 } },
        ],
        total: [
          { $group: { _id: null, count: { $sum: 1 }, maxPatientCount: { $max: '$patientCount' } } },
        ],
      },
    },
  ];
}
export async function dashboardDistribution(
  admin: AdminIdentity,
  query: DashboardDistributionQuery,
): Promise<DashboardDistribution> {
  authorize(admin);
  return analytics(async () => {
    const [result] = await DoctorModel.aggregate<{
      items: DashboardDistribution['items'];
      total: { count: number; maxPatientCount: number }[];
    }>(distributionPipeline(query)).option({ maxTimeMS: queryBudget, allowDiskUse: false });
    const totalItems = result?.total[0]?.count ?? 0;
    const totalPages = Math.ceil(totalItems / query.limit);
    return {
      items: result?.items ?? [],
      maxPatientCount: result?.total[0]?.maxPatientCount ?? 0,
      pagination: {
        ...query,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPreviousPage: query.page > 1 && totalItems > 0,
      },
      asOf: new Date().toISOString(),
    };
  });
}
export function trendPipeline(start: Date, end: Date): PipelineStage[] {
  return [
    { $match: { createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', count: 1 } },
  ];
}
export async function dashboardTrends(
  admin: AdminIdentity,
  period: DashboardPeriod,
  now = new Date(),
): Promise<DashboardTrends> {
  authorize(admin);
  return analytics(async () => {
    const { start, end, days } = dashboardDateRange(period, now);
    const pipeline = trendPipeline(start, end);
    type Bucket = { date: string; count: number };
    const [doctors, patients] = await Promise.all([
      DoctorModel.aggregate<Bucket>(pipeline)
        .hint({ createdAt: -1, _id: -1 })
        .option({ maxTimeMS: queryBudget }),
      PatientModel.aggregate<Bucket>(pipeline)
        .hint({ createdAt: -1, _id: -1 })
        .option({ maxTimeMS: queryBudget }),
    ]);
    const doctorCounts = new Map(doctors.map((bucket) => [bucket.date, bucket.count]));
    const patientCounts = new Map(patients.map((bucket) => [bucket.date, bucket.count]));
    const points = Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() + index * 86400_000).toISOString().slice(0, 10);
      return { date, doctors: doctorCounts.get(date) ?? 0, patients: patientCounts.get(date) ?? 0 };
    });
    return {
      period,
      timezone: 'UTC',
      interval: 'day',
      from: points[0]!.date,
      through: points.at(-1)!.date,
      points,
      asOf: now.toISOString(),
    };
  });
}
