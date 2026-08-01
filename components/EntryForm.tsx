'use client'

import { useState } from 'react'
import { ACCOUNTS, TAX_OPTIONS, DEFAULT_ACCOUNT } from '@/lib/categories'
import { countLow, type ConfidenceField, type FieldConfidence } from '@/lib/confidence'
import { toDateInputValue } from '@/lib/format'
import type { Entry, IncomeEntry, ExpenseEntry } from '@/types/transaction'

interface Props {
  entry: Entry
  confidence: FieldConfidence
  imageUrl?: string
  onChange: (entry: Entry) => void
  /** Touching a flagged field is the check — the warning comes off once you've looked. */
  onChecked: (field: ConfidenceField) => void
  /** Category gets its own step so the chips have room. */
  onEditCategory: () => void
  onViewImage: () => void
}

/** An eyebrow that turns magenta and grows a dot when the field wants checking. */
function FieldLabel({ label, low }: { label: string; low?: boolean }) {
  if (!low) return <span className="eyebrow">{label}</span>
  return (
    <span className="flex items-center gap-[7px]">
      <span className="w-[7px] h-[7px] rounded-full bg-accent-2" aria-hidden />
      <span className="eyebrow text-accent-2-700">{label} · check this</span>
    </span>
  )
}

/**
 * One extracted transaction, filling the screen.
 *
 * Amount is the headline because it is what you scan for. Date and category — the two
 * fields that are wrong most often — sit directly under it, marked when the extraction
 * was unsure. Account, type and tax are rarely wrong and usually inherited, so they sit
 * at the bottom at reduced prominence.
 */
export default function EntryForm({
  entry,
  confidence,
  imageUrl,
  onChange,
  onChecked,
  onEditCategory,
  onViewImage,
}: Props) {
  // The raw string the amount field is showing. Held locally so a half-typed "12." isn't
  // round-tripped through Number and rewritten under the cursor.
  const [amountText, setAmountText] = useState(entry.amount.toFixed(2))

  const isIncome = entry.type === 'income'
  const unsure = countLow(confidence)

  function setField(patch: Partial<IncomeEntry> & Partial<ExpenseEntry>) {
    onChange({ ...entry, ...patch } as Entry)
  }

  function handleTypeChange(next: Entry['type']) {
    if (next === entry.type) return
    if (entry.type === 'expense') {
      const e = entry as ExpenseEntry
      onChange({
        type: 'income',
        income: e.expense,
        amount: e.amount,
        currency: e.currency,
        date: e.date,
        source: 'Other',
        accounts: e.account || DEFAULT_ACCOUNT,
        tax: 'no tax',
      })
    } else {
      const i = entry as IncomeEntry
      onChange({
        type: 'expense',
        expense: i.income,
        amount: i.amount,
        date: i.date,
        account: i.accounts || DEFAULT_ACCOUNT,
        category: 'Other',
        currency: i.currency,
      })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3.5">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt=""
            className="w-[72px] h-[72px] object-cover rounded-sharp shrink-0 bg-surface"
          />
        ) : (
          <div className="w-[72px] h-[72px] rounded-sharp bg-surface shrink-0" />
        )}
        <div className="flex flex-col items-start gap-[3px] min-w-0">
          <button type="button" onClick={onViewImage} className="text-[15px] text-accent">
            View full image
          </button>
          {unsure > 0 && (
            <span className="text-sm text-accent-2">
              {unsure} field{unsure === 1 ? '' : 's'}{' '}
              I wasn&rsquo;t sure about
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 border-b border-ink-30 pb-2">
        <label className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="eyebrow">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value)
              const parsed = parseFloat(e.target.value)
              if (Number.isFinite(parsed)) setField({ amount: parsed })
            }}
            onBlur={() => setAmountText(entry.amount.toFixed(2))}
            className="field-input text-[42px] font-semibold leading-none tracking-[-0.02em] tabular-nums"
            aria-label="Amount"
          />
        </label>
        <label className="flex flex-col gap-0.5 items-end shrink-0">
          <span className="eyebrow">Currency</span>
          <input
            type="text"
            value={entry.currency}
            maxLength={3}
            onChange={(e) => setField({ currency: e.target.value.toUpperCase() })}
            className="field-input text-xl text-right w-14"
            aria-label="Currency"
          />
        </label>
      </div>

      <label className="flex flex-col gap-[3px]">
        <span className="eyebrow">Description</span>
        <div className="flex items-center justify-between gap-2.5 min-h-11 border-b border-ink-20">
          <input
            type="text"
            value={isIncome ? (entry as IncomeEntry).income : (entry as ExpenseEntry).expense}
            onChange={(e) =>
              setField(isIncome ? { income: e.target.value } : { expense: e.target.value })
            }
            className="field-input text-[19px]"
          />
          <i className="ph-duotone ph-pencil-simple text-[18px] text-ink-45 shrink-0" aria-hidden />
        </div>
      </label>

      <label className="flex flex-col gap-[3px]">
        <FieldLabel label="Date" low={confidence.date === 'low'} />
        <div
          className={`flex items-center justify-between gap-2.5 min-h-11 ${
            confidence.date === 'low' ? 'border-b-2 border-accent-2' : 'border-b border-ink-20'
          }`}
        >
          <input
            type="date"
            value={toDateInputValue(entry.date)}
            onChange={(e) => {
              if (!e.target.value) return
              setField({ date: e.target.value })
              onChecked('date')
            }}
            className="field-input text-[19px]"
          />
        </div>
      </label>

      <div className="flex flex-col gap-[3px]">
        <FieldLabel label={isIncome ? 'Source' : 'Category'} low={confidence.category === 'low'} />
        <button
          type="button"
          onClick={onEditCategory}
          className={`flex items-center justify-between gap-2.5 min-h-11 text-left ${
            confidence.category === 'low' ? 'border-b-2 border-accent-2' : 'border-b border-ink-20'
          }`}
        >
          <span className="text-[19px]">
            {isIncome ? (entry as IncomeEntry).source : (entry as ExpenseEntry).category}
          </span>
          <i
            className={`ph-duotone ph-caret-down text-[18px] shrink-0 ${
              confidence.category === 'low' ? 'text-accent-2' : 'text-ink-45'
            }`}
            aria-hidden
          />
        </button>
      </div>

      <div className="flex gap-5">
        <label className="flex-1 flex flex-col gap-[3px] min-w-0">
          <span className="eyebrow">Account</span>
          <select
            value={isIncome ? (entry as IncomeEntry).accounts : (entry as ExpenseEntry).account}
            onChange={(e) =>
              setField(isIncome ? { accounts: e.target.value } : { account: e.target.value })
            }
            className="field-input appearance-none min-h-10 text-[17px] border-b border-ink-20 rounded-none"
          >
            {ACCOUNTS.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
        </label>

        <label className="flex-1 flex flex-col gap-[3px] min-w-0">
          <span className="eyebrow">Type</span>
          <select
            value={entry.type}
            onChange={(e) => handleTypeChange(e.target.value as Entry['type'])}
            className="field-input appearance-none min-h-10 text-[17px] border-b border-ink-20 rounded-none"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        {isIncome && (
          <label className="flex-1 flex flex-col gap-[3px] min-w-0">
            <span className="eyebrow">Tax</span>
            <select
              value={(entry as IncomeEntry).tax}
              onChange={(e) => setField({ tax: e.target.value })}
              className="field-input appearance-none min-h-10 text-[17px] border-b border-ink-20 rounded-none"
            >
              {TAX_OPTIONS.map((tax) => (
                <option key={tax} value={tax}>
                  {tax}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}
