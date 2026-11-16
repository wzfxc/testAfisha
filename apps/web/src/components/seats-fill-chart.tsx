'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface SeatHistoryPoint {
  timeLabel: string;
  occupiedSeats: number;
  availableSeats: number;
  fillRatePct: number;
}

export interface SeatsFillChartProps {
  history: SeatHistoryPoint[];
  capacity: number;
}

export default function SeatsFillChart({
  history,
  capacity,
}: SeatsFillChartProps) {
  return (
    <div className="h-56 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={history}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="timeLabel"
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="#cbd5e1"
          />
          <YAxis
            domain={[0, capacity]}
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="#cbd5e1"
            width={44}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              borderColor: '#e2e8f0',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#0f172a',
            }}
            formatter={(value: number, name: string) => [
              `${value.toLocaleString()} seats`,
              name === 'occupiedSeats' ? 'Booked seats' : 'Available seats',
            ]}
          />
          <Area
            type="monotone"
            dataKey="occupiedSeats"
            stroke="#2563eb"
            strokeWidth={2}
            fill="#dbeafe"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

