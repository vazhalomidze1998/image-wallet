import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { MonthlyTrendPoint } from '@/types/wallet'
import { formatMoney, formatMonth } from '@/utils/format'

// Categorical slots 1–2 of the validated reference palette (CVD-safe pair).
// Deliberately not green/red: those read as good/bad status, not as series identity.
export const SERIES = {
  income: { label: 'Income', color: '#2a78d6' },
  expense: { label: 'Expense', color: '#eb6834' },
} as const

const GRID = 'var(--color-slate-200)'
const AXIS_TEXT = 'var(--color-slate-500)'
const TEXT = 'var(--color-slate-900)'

function compactMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function ChartTooltip({ active, payload, label, currency }: TooltipContentProps<number, string> & { currency: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-medium text-slate-900">{String(label)}</p>}
      {payload.map((entry) => (
        <p key={String(entry.name)} className="flex items-center gap-2 text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color ?? entry.payload?.fill }} />
          <span>{entry.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">
            {formatMoney(Number(entry.value), currency)}
          </span>
        </p>
      ))}
    </div>
  )
}

/** Two bars: this month's income vs expense, each directly labelled with its value. */
export function IncomeExpenseChart({
  income,
  expense,
  currency,
}: {
  income: string
  expense: string
  currency: string
}) {
  const data = [
    { name: SERIES.income.label, value: Number(income), fill: SERIES.income.color },
    { name: SERIES.expense.label, value: Number(expense), fill: SERIES.expense.color },
  ]

  return (
    <div className="h-64" role="img" aria-label={`This month: income ${formatMoney(income, currency)}, expense ${formatMoney(expense, currency)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 8 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            tickFormatter={compactMoney}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-slate-100)' }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} currency={currency} />}
          />
          <Bar dataKey="value" name="Amount" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v) => formatMoney(Number(v), currency)}
              style={{ fill: TEXT, fontSize: 12, fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Income and expense per month (last 6 months) as two lines on one axis. */
export function MonthlyTrendChart({ data, currency }: { data: MonthlyTrendPoint[]; currency: string }) {
  const rows = data.map((d) => ({
    month: formatMonth(d.month),
    income: Number(d.income),
    expense: Number(d.expense),
  }))

  return (
    <div className="h-72" role="img" aria-label="Monthly income and expense for the last 6 months. See table below.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            tickFormatter={compactMoney}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-slate-400)', strokeWidth: 1 }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} currency={currency} />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={32}
            iconType="plainline"
            // Keep series order (Income, Expense) instead of sorting by name.
            itemSorter={null}
            formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
          />
          {(['income', 'expense'] as const).map((key) => (
            <Line
              key={key}
              type="linear"
              dataKey={key}
              name={SERIES[key].label}
              stroke={SERIES[key].color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: SERIES[key].color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
