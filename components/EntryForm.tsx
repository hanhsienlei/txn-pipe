'use client'

import { useState } from 'react'
import CategorySelect from './CategorySelect'
import {
  ACCOUNTS,
  TAX_OPTIONS,
  DEFAULT_CURRENCY,
  DEFAULT_ACCOUNT,
} from '@/lib/categories'
import type { Entry, IncomeEntry, ExpenseEntry } from '@/types/transaction'

interface Props {
  initial: Entry
  onSubmit: (entry: Entry) => void
  onRetake: () => void
  submitting?: boolean
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black'

export default function EntryForm({ initial, onSubmit, onRetake, submitting = false }: Props) {
  const [entry, setEntry] = useState<Entry>(initial)

  function setField<K extends keyof IncomeEntry>(key: K, value: IncomeEntry[K]): void
  function setField<K extends keyof ExpenseEntry>(key: K, value: ExpenseEntry[K]): void
  function setField(key: string, value: unknown) {
    setEntry((prev) => ({ ...prev, [key]: value }))
  }

  const isIncome = entry.type === 'income'

  function handleTypeToggle() {
    if (entry.type === 'expense') {
      const e = entry as ExpenseEntry
      const converted: IncomeEntry = {
        type: 'income',
        income: e.expense,
        amount: e.amount,
        currency: e.currency,
        date: e.date,
        source: 'Other',
        accounts: DEFAULT_ACCOUNT,
        tax: 'no tax',
      }
      setEntry(converted)
    } else {
      const i = entry as IncomeEntry
      const converted: ExpenseEntry = {
        type: 'expense',
        expense: i.income,
        amount: i.amount,
        date: i.date,
        account: DEFAULT_ACCOUNT,
        category: 'Other',
        currency: i.currency,
      }
      setEntry(converted)
    }
  }

  return (
    <form
      className="flex flex-col gap-4 w-full"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(entry)
      }}
    >
      {/* Type toggle */}
      <div className="flex rounded-xl overflow-hidden border border-neutral-300">
        <button
          type="button"
          onClick={() => entry.type === 'income' && handleTypeToggle()}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            !isIncome ? 'bg-black text-white' : 'bg-white text-neutral-600'
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => entry.type === 'expense' && handleTypeToggle()}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            isIncome ? 'bg-black text-white' : 'bg-white text-neutral-600'
          }`}
        >
          Income
        </button>
      </div>

      {/* Description */}
      <Field label={isIncome ? 'Income description' : 'Expense description'}>
        <input
          type="text"
          className={inputClass}
          value={isIncome ? (entry as IncomeEntry).income : (entry as ExpenseEntry).expense}
          onChange={(e) =>
            isIncome
              ? setField('income', e.target.value)
              : setField('expense', e.target.value)
          }
          required
        />
      </Field>

      {/* Amount + Currency */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              value={entry.amount}
              onChange={(e) => setField('amount', parseFloat(e.target.value) || 0)}
              required
            />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Currency">
            <input
              type="text"
              className={inputClass}
              value={entry.currency}
              onChange={(e) => setField('currency', e.target.value.toUpperCase())}
              maxLength={3}
              placeholder={DEFAULT_CURRENCY}
            />
          </Field>
        </div>
      </div>

      {/* Date */}
      <Field label="Date">
        <input
          type="date"
          className={inputClass}
          value={(() => {
            // Convert YYYY/M/D or YYYY/MM/DD to YYYY-MM-DD for input[type=date]
            const parts = entry.date.split('/')
            if (parts.length === 3) {
              return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
            }
            return entry.date
          })()}
          onChange={(e) => {
            // Convert back to YYYY/MM/DD
            const [y, m, d] = e.target.value.split('-')
            setField('date', `${y}/${m}/${d}`)
          }}
          required
        />
      </Field>

      {/* Account */}
      <Field label="Account">
        <select
          className={inputClass}
          value={isIncome ? (entry as IncomeEntry).accounts : (entry as ExpenseEntry).account}
          onChange={(e) =>
            isIncome
              ? setField('accounts', e.target.value)
              : setField('account', e.target.value)
          }
        >
          {ACCOUNTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </Field>

      {/* Category / Source */}
      <CategorySelect
        type={entry.type}
        value={isIncome ? (entry as IncomeEntry).source : (entry as ExpenseEntry).category}
        onChange={(val) =>
          isIncome ? setField('source', val) : setField('category', val)
        }
        label={isIncome ? 'Source' : 'Category'}
      />

      {/* Tax (income only) */}
      {isIncome && (
        <Field label="Tax">
          <select
            className={inputClass}
            value={(entry as IncomeEntry).tax}
            onChange={(e) => setField('tax', e.target.value)}
          >
            {TAX_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onRetake}
          className="flex-1 py-3 rounded-xl border border-neutral-300 font-medium text-sm"
        >
          Retake
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-3 rounded-xl bg-black text-white font-medium text-sm disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Approve & Save'}
        </button>
      </div>
    </form>
  )
}
