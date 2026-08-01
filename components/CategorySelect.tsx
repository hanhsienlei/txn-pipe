'use client'

import { EXPENSE_CATEGORIES, INCOME_SOURCES } from '@/lib/categories'

interface Props {
  type: 'expense' | 'income'
  value: string
  onChange: (value: string) => void
}

/**
 * Tappable chips rather than a native `<select>` — one tap instead of spinning a picker
 * wheel to land on one of eight fixed options.
 *
 * The vocabulary is `lib/categories.ts` and nothing else, so a chip can never introduce a
 * value the schema would reject.
 */
export default function CategorySelect({ type, value, onChange }: Props) {
  const options = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_SOURCES

  return (
    <div className="flex flex-wrap gap-2.5" role="radiogroup">
      {options.map((option) => {
        const selected = option === value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={`min-h-12 px-[18px] rounded-sharp text-[17px] ${
              selected
                ? 'bg-accent text-white font-semibold'
                : 'border border-ink-30 text-text'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
