import React from 'react'
import { screen, within } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { ResponsiveTable } from '@/components/ui'

type Row = { id: string; name: string; amount: string }
const rows: Row[] = [
  { id: '1', name: 'Factura A', amount: '10 €' },
  { id: '2', name: 'Factura B', amount: '20 €' },
]
const columns = [
  { key: 'name', header: 'Nombre', render: (r: Row) => r.name },
  { key: 'amount', header: 'Importe', render: (r: Row) => r.amount, align: 'right' as const },
  { key: 'x', header: '', srLabel: 'Acciones', render: () => <button>Ver</button> },
]
const ui = (extra: Partial<React.ComponentProps<typeof ResponsiveTable<Row>>> = {}) => (
  <ResponsiveTable
    columns={columns}
    rows={rows}
    rowKey={(r) => r.id}
    mobileRender={(r) => <div data-testid="card">{r.name} · {r.amount}</div>}
    {...extra}
  />
)

describe('ResponsiveTable', () => {
  it('renders cards via mobileRender and no <table> on mobile', () => {
    setMobile(true)
    const { container } = renderWithMantine(ui())
    expect(container.querySelector('table')).toBeNull()
    expect(screen.getAllByTestId('card')).toHaveLength(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Factura B · 20 €')).toBeInTheDocument()
  })

  it('renders a <table> with headers and cells on desktop', () => {
    setMobile(false)
    const { container } = renderWithMantine(ui())
    expect(container.querySelector('table')).not.toBeNull()
    expect(screen.queryAllByTestId('card')).toHaveLength(0)
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Importe' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })

  it('shows the empty state instead of either layout when there are no rows', () => {
    setMobile(true)
    const { container } = renderWithMantine(ui({ rows: [], empty: <p>Sin datos</p> }))
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(container.querySelector('table')).toBeNull()
  })
})
