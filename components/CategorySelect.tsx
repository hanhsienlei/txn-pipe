'use client'

import { EXPENSE_CATEGORIES, INCOME_SOURCES } from '@/lib/categories'

interface Props {
  type: 'expense' | 'income'
  value: string
  onChange: (value: string) => void
  label?: string
}

export default function CategorySelect({ type, value, onChange, label }: Props) {
  const options = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_SOURCES

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-neutral-700">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
