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
      {label && <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
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
