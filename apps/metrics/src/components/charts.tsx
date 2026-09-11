'use client';

import { fmtInt, fmtUsd } from '@/lib/format';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Recharts wrappers with the app's mark specs baked in: 2px lines, thin bars
// with a surface gap, recessive grid, crosshair tooltip, one y-axis only.

export const SERIES = ['#d9712b', '#2f6fed', '#1f9d6b', '#8b5cf6'] as const;

/**
 * Growth that someone brought in draws blue; growth that arrived on its own
 * draws orange. A campaign signup and a referred signup are the same idea
 * wearing two hats, so they must not be two colors — which is what index-based
 * coloring gave us, since the two pages list their series in opposite orders.
 *
 * Named rather than inlined so the two pages cannot drift apart again, and so a
 * later reorder of either series array is harmless.
 */
export const ATTRIBUTED_COLOR = SERIES[1];
export const BASELINE_COLOR = SERIES[0];

/**
 * `color` overrides the palette lookup for this one series.
 *
 * Without it a series' color is its position in the array, which means the same
 * concept draws differently on two pages that happen to list it in a different
 * order — referred signups were orange here and blue on Campaigns for exactly
 * that reason. Pass it wherever a color carries meaning across charts; omit it
 * and the palette cycles as before.
 */
export type SeriesDef = { key: string; label: string; kind?: 'count' | 'usd' | 'pct'; color?: string };

const colorOf = (s: SeriesDef, i: number) => s.color ?? SERIES[i % SERIES.length];

type Row = Record<string, string | number | null | undefined>;

const fmtBy = (kind: SeriesDef['kind']) =>
  kind === 'usd' ? fmtUsd : kind === 'pct' ? (v: number) => `${(v * 100).toFixed(1)}%` : fmtInt;

const axisFmt = (kind: SeriesDef['kind']) => (v: number) =>
  kind === 'usd'
    ? v >= 1000
      ? `$${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`
      : `$${v}`
    : kind === 'pct'
      ? `${Math.round(v * 100)}%`
      : fmtInt(v);

const legendText = (value: string) => <span style={{ color: '#262626' }}>{value}</span>;

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid #26262620', fontSize: 12 },
  labelStyle: { color: '#262626', fontWeight: 600 },
  itemStyle: { color: '#262626' },
};

export function TimeSeriesLine({
  rows,
  x = 'bucket',
  series,
  height = 240,
}: {
  rows: Row[];
  x?: string;
  series: SeriesDef[];
  height?: number;
}) {
  const kind = series[0]?.kind ?? 'count';
  // A line needs two points to draw a segment, so a series with a single value
  // renders nothing at all with dots off — the y-axis scales to the number and
  // the plot stays blank. That is not hypothetical: a metric sampled from now
  // on (vault TVL) has one filled bucket and a column of nulls behind it for
  // its first week. Show the dot in that case; keep lines clean once there is
  // an actual line.
  const plotted = (key: string) => rows.reduce((n, r) => (r[key] == null ? n : n + 1), 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#26262614" />
        <XAxis
          dataKey={x}
          tick={{ fontSize: 11, fill: '#26262699' }}
          tickLine={false}
          axisLine={{ stroke: '#26262633' }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#26262699' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={axisFmt(kind)}
          width={56}
          allowDecimals={kind !== 'count'}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v, name) => [fmtBy(series.find((s) => s.label === name)?.kind ?? kind)(Number(v)), String(name)]}
          cursor={{ stroke: '#26262640' }}
        />
        {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="linear"
            dataKey={s.key}
            name={s.label}
            stroke={colorOf(s, i)}
            strokeWidth={2}
            dot={plotted(s.key) < 2 ? { r: 3, fill: colorOf(s, i), strokeWidth: 0 } : false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TimeSeriesBars({
  rows,
  x = 'bucket',
  series,
  height = 240,
  stacked = false,
}: {
  rows: Row[];
  x?: string;
  series: SeriesDef[];
  height?: number;
  stacked?: boolean;
}) {
  const kind = series[0]?.kind ?? 'count';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={2}>
        <CartesianGrid vertical={false} stroke="#26262614" />
        <XAxis
          dataKey={x}
          tick={{ fontSize: 11, fill: '#26262699' }}
          tickLine={false}
          axisLine={{ stroke: '#26262633' }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#26262699' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={axisFmt(kind)}
          width={56}
          allowDecimals={kind !== 'count'}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v, name) => [fmtBy(series.find((s) => s.label === name)?.kind ?? kind)(Number(v)), String(name)]}
          cursor={{ fill: '#26262610' }}
        />
        {series.length > 1 && <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={colorOf(s, i)}
            stackId={stacked ? 'a' : undefined}
            radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
            stroke="#fff"
            strokeWidth={stacked ? 2 : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for a small categorical breakdown (lock periods, statuses). */
export function CategoryBars({
  rows,
  category,
  series,
  height,
}: {
  rows: Row[];
  category: string;
  series: SeriesDef;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, rows.length * 36 + 24)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke="#26262614" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#26262699' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={axisFmt(series.kind)}
          allowDecimals={series.kind !== 'count'}
        />
        <YAxis
          type="category"
          dataKey={category}
          tick={{ fontSize: 11, fill: '#262626' }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v) => [fmtBy(series.kind)(Number(v)), series.label]}
          cursor={{ fill: '#26262610' }}
        />
        <Bar
          dataKey={series.key}
          name={series.label}
          fill={colorOf(series, 0)}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
