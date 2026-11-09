'use client';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardTrends } from '@doctor-tracker/shared';
import { number, day } from './helpers';
export default function RegistrationPlot({ points }: { points: DashboardTrends['points'] }) {
  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      minWidth={0}
      initialDimension={{ width: 300, height: 270 }}
    >
      <LineChart
        data={points}
        margin={{ top: 12, right: 18, left: -12, bottom: 8 }}
        accessibilityLayer
        aria-label="Doctor and patient registrations by UTC day"
      >
        <CartesianGrid stroke="#d9e6ef" vertical={false} strokeDasharray="3 4" />
        <XAxis
          dataKey="date"
          tickFormatter={(date: string) => day(date)}
          minTickGap={44}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#627587', fontSize: 14 }}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          width={45}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#627587', fontSize: 14 }}
          domain={[0, (maximum: number) => Math.max(1, maximum)]}
        />
        <Tooltip
          labelFormatter={(value) => day(String(value), true) + ' · UTC'}
          contentStyle={{ border: '1px solid #d9e6ef', borderRadius: 6, fontSize: 14 }}
          formatter={(value, name) => [number.format(Number(value)), name]}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="doctors"
          name="Doctors"
          stroke="#1979b3"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="patients"
          name="Patients"
          stroke="#277969"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
