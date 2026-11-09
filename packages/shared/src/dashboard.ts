import { z } from 'zod';

export const DASHBOARD_PERIODS = ['7d', '30d', '90d'] as const;
export const dashboardTrendQuerySchema = z.strictObject({
  period: z.enum(DASHBOARD_PERIODS).default('30d'),
});
const pageNumber = (max: number, fallback: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(max));
export const dashboardDistributionQuerySchema = z.strictObject({
  page: pageNumber(10000, '1'),
  limit: pageNumber(20, '5'),
});
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime();
export const dashboardOverviewSchema = z.strictObject({
  totalDoctors: count,
  totalPatients: count,
  asOf: timestamp,
});
export const dashboardDistributionSchema = z
  .strictObject({
    maxPatientCount: count,
    items: z
      .array(
        z.strictObject({
          doctorId: z.string().regex(/^[a-f\d]{24}$/),
          doctorName: z.string().min(1).max(120),
          patientCount: count,
        }),
      )
      .max(20),
    pagination: z.strictObject({
      page: count.min(1).max(10000),
      limit: count.min(1).max(20),
      totalItems: count,
      totalPages: count,
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean(),
    }),
    asOf: timestamp,
  })
  .refine(
    (value) =>
      value.items.length <= value.pagination.limit &&
      value.items.every((item) => item.patientCount <= value.maxPatientCount),
    'Invalid patient distribution.',
  );
export const dashboardTrendsSchema = z
  .strictObject({
    period: z.enum(DASHBOARD_PERIODS),
    timezone: z.literal('UTC'),
    interval: z.literal('day'),
    from: z.iso.date(),
    through: z.iso.date(),
    points: z
      .array(z.strictObject({ date: z.iso.date(), doctors: count, patients: count }))
      .min(7)
      .max(90),
    asOf: timestamp,
  })
  .superRefine((value, context) => {
    const expected = Number(value.period.slice(0, -1));
    const start = Date.parse(value.from);
    if (!Number.isFinite(start)) {
      context.addIssue({ code: 'custom', message: 'Invalid start date.' });
      return;
    }
    if (
      value.points.length !== expected ||
      value.through !== new Date(start + (expected - 1) * 86400_000).toISOString().slice(0, 10) ||
      value.points.some(
        (point, index) =>
          point.date !== new Date(start + index * 86400_000).toISOString().slice(0, 10),
      )
    )
      context.addIssue({ code: 'custom', message: 'Invalid daily registration series.' });
  });

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export type DashboardDistributionQuery = z.infer<typeof dashboardDistributionQuerySchema>;
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
export type DashboardDistribution = z.infer<typeof dashboardDistributionSchema>;
export type DashboardTrends = z.infer<typeof dashboardTrendsSchema>;

// Inclusive UTC calendar days, including today; the database upper bound is exclusive.
export function dashboardDateRange(period: DashboardPeriod, now = new Date()) {
  const days = Number(period.slice(0, -1));
  const end = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end.getTime() - days * 86400_000);
  return { start, end, days };
}
