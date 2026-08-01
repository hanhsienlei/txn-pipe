import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EntryForm from '@/components/EntryForm'
import type { Entry } from '@/types/transaction'
import type { FieldConfidence } from '@/lib/confidence'

const expenseEntry: Entry = {
  type: 'expense',
  expense: 'Coffee shop',
  amount: 12.5,
  date: '2026-05-16',
  account: 'NAB AUD',
  category: 'Food & Dining',
  currency: 'AUD',
}

const incomeEntry: Entry = {
  type: 'income',
  income: 'Rent payment',
  amount: 500,
  currency: 'AUD',
  date: '2026-05-14',
  source: 'Rent',
  accounts: 'NAB AUD',
  tax: 'no tax',
}

function renderForm(entry: Entry, confidence: FieldConfidence = {}, overrides = {}) {
  const props = {
    entry,
    confidence,
    onChange: vi.fn(),
    onChecked: vi.fn(),
    onEditCategory: vi.fn(),
    onViewImage: vi.fn(),
    ...overrides,
  }
  render(<EntryForm {...props} />)
  return props
}

describe('EntryForm', () => {
  it('renders expense fields', () => {
    renderForm(expenseEntry)
    expect(screen.getByDisplayValue('Coffee shop')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12.50')).toBeInTheDocument()
    expect(screen.getByText('Food & Dining')).toBeInTheDocument()
  })

  it('renders income fields, including tax', () => {
    renderForm(incomeEntry)
    expect(screen.getByDisplayValue('Rent payment')).toBeInTheDocument()
    expect(screen.getByDisplayValue('500.00')).toBeInTheDocument()
    expect(screen.getByText('Tax')).toBeInTheDocument()
    expect(screen.getByText('Source')).toBeInTheDocument()
  })

  it('does not show tax for expense entries', () => {
    renderForm(expenseEntry)
    expect(screen.queryByText('Tax')).not.toBeInTheDocument()
  })

  it('reports description edits through onChange', () => {
    const { onChange } = renderForm(expenseEntry)
    fireEvent.change(screen.getByDisplayValue('Coffee shop'), {
      target: { value: 'Tea shop' },
    })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ expense: 'Tea shop' }))
  })

  it('reports amount edits as a number', () => {
    const { onChange } = renderForm(expenseEntry)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '19.99' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ amount: 19.99 }))
  })

  it('does not emit a change for a half-typed amount', () => {
    const { onChange } = renderForm(expenseEntry)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('marks low-confidence fields for checking', () => {
    renderForm(expenseEntry, { date: 'low', category: 'low' })
    expect(screen.getByText('Date · check this')).toBeInTheDocument()
    expect(screen.getByText('Category · check this')).toBeInTheDocument()
    expect(screen.getByText(/2 fields I wasn.t sure about/)).toBeInTheDocument()
  })

  it('leaves confident fields unmarked', () => {
    renderForm(expenseEntry)
    expect(screen.queryByText(/check this/)).not.toBeInTheDocument()
    expect(screen.queryByText(/sure about/)).not.toBeInTheDocument()
  })

  it('reports a date edit as checked', () => {
    const { onChange, onChecked } = renderForm(expenseEntry, { date: 'low' })
    fireEvent.change(screen.getByDisplayValue('2026-05-16'), {
      target: { value: '2026-05-12' },
    })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-05-12' }))
    expect(onChecked).toHaveBeenCalledWith('date')
  })

  it('hands the category off to its own step', () => {
    const { onEditCategory } = renderForm(expenseEntry)
    fireEvent.click(screen.getByText('Food & Dining'))
    expect(onEditCategory).toHaveBeenCalled()
  })

  it('converts an expense to an income entry, keeping the description and amount', () => {
    const { onChange } = renderForm(expenseEntry)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'income' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'income',
        income: 'Coffee shop',
        amount: 12.5,
        accounts: 'NAB AUD',
      }),
    )
  })
})
