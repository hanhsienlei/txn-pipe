import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EntryForm from '@/components/EntryForm'
import type { Entry } from '@/types/transaction'

const expenseEntry: Entry = {
  type: 'expense',
  expense: 'Coffee shop',
  amount: 12.5,
  date: '2026/5/16',
  account: 'NAB AUD',
  category: 'Food & Dining',
  currency: 'AUD',
}

const incomeEntry: Entry = {
  type: 'income',
  income: 'Rent payment',
  amount: 500,
  currency: 'AUD',
  date: '2026/05/14',
  source: 'Rent',
  accounts: 'NAB AUD',
  tax: 'no tax',
}

describe('EntryForm', () => {
  it('renders expense fields correctly', () => {
    render(
      <EntryForm
        initial={expenseEntry}
        onSubmit={vi.fn()}
        onRetake={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('Coffee shop')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument()
  })

  it('renders income fields correctly', () => {
    render(
      <EntryForm
        initial={incomeEntry}
        onSubmit={vi.fn()}
        onRetake={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('Rent payment')).toBeInTheDocument()
    expect(screen.getByDisplayValue('500')).toBeInTheDocument()
  })

  it('calls onSubmit with current entry when Approve & Save is clicked', () => {
    const onSubmit = vi.fn()
    render(
      <EntryForm initial={expenseEntry} onSubmit={onSubmit} onRetake={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Approve & Save'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: 'expense' }))
  })

  it('calls onRetake when Retake is clicked', () => {
    const onRetake = vi.fn()
    render(
      <EntryForm initial={expenseEntry} onSubmit={vi.fn()} onRetake={onRetake} />
    )
    fireEvent.click(screen.getByText('Retake'))
    expect(onRetake).toHaveBeenCalled()
  })

  it('updates description field on change', () => {
    render(
      <EntryForm initial={expenseEntry} onSubmit={vi.fn()} onRetake={vi.fn()} />
    )
    const input = screen.getByDisplayValue('Coffee shop') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New description' } })
    expect(input.value).toBe('New description')
  })

  it('shows tax field for income entries', () => {
    render(
      <EntryForm initial={incomeEntry} onSubmit={vi.fn()} onRetake={vi.fn()} />
    )
    expect(screen.getByText('Tax')).toBeInTheDocument()
  })

  it('does not show tax field for expense entries', () => {
    render(
      <EntryForm initial={expenseEntry} onSubmit={vi.fn()} onRetake={vi.fn()} />
    )
    expect(screen.queryByText('Tax')).not.toBeInTheDocument()
  })

  it('disables buttons when submitting=true', () => {
    render(
      <EntryForm initial={expenseEntry} onSubmit={vi.fn()} onRetake={vi.fn()} submitting />
    )
    expect(screen.getByText('Saving...')).toBeDisabled()
  })
})
