import { ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, MoreHorizontal, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

export default function DataTable({
  config, data, loading, error, page, pages, total, search, setSearch, status, setStatus, sort, setSort,
  onPage, onOpen, onDelete, onBulkDelete, onBulkStatus, onCreate,
}) {
  const [selected, setSelected] = useState([])
  const [visibility, setVisibility] = useState(() => Object.fromEntries(config.columns.map((_, index) => [index, true])))
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('')
  const rows = data || []
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row._id))
  const visibleColumns = config.columns.map((column, index) => ({ column, index })).filter(({ index }) => visibility[index])
  const exportCsv = () => {
    const content = [
      visibleColumns.map(({ column }) => csv(column[0])).join(','),
      ...rows.map((row) => visibleColumns.map(({ column }) => csv(displayValue(row, column[1]))).join(',')),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${config.title.toLowerCase().replaceAll(' ', '-')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const empty = useMemo(() => !loading && !error && rows.length === 0, [error, loading, rows.length])
  const toggleAll = () => setSelected(allSelected
    ? selected.filter((id) => !rows.some((row) => row._id === id))
    : [...new Set([...selected, ...rows.map((row) => row._id)])])
  return <section className="data-table-shell">
    <header className="table-toolbar">
      <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={config.search} /></label>
      <div>
        <select className="table-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statusOptions(config).map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select>
        {!config.readOnly && selected.length > 0 && <button className="bulk-danger" onClick={() => onBulkDelete(selected).then(() => setSelected([]))}><Trash2 /> Delete {selected.length}</button>}
        {selected.length > 0 && config.bulkStatuses && <><select className="table-filter" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}><option value="">Bulk status…</option>{config.bulkStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><button disabled={!bulkStatus} onClick={() => onBulkStatus(selected, bulkStatus).then(() => { setSelected([]); setBulkStatus('') })}>Apply</button></>}
        <button onClick={exportCsv}><Download /> Export</button>
        <div className="columns-menu"><button onClick={() => setColumnsOpen((value) => !value)}><Columns3 /> Columns <ChevronDown /></button>{columnsOpen && <section>{config.columns.map(([label], index) => <label key={label}><input type="checkbox" checked={visibility[index]} onChange={() => setVisibility((current) => ({ ...current, [index]: !current[index] }))} />{label}</label>)}</section>}</div>
        {config.canCreate && <button className="primary" onClick={onCreate}>Create {config.title.slice(0, -1)}</button>}
      </div>
    </header>
    <div className="table-scroll"><table>
      <thead><tr>{!config.readOnly && <th className="check-cell"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>}{visibleColumns.map(({ column: [label], index }) => { const sortField = config.columns[index][2] || fieldName(config.columns[index][1]); return <th key={label}><button onClick={() => setSort({ sortBy: sortField, sortOrder: sort.sortBy === sortField && sort.sortOrder === 'asc' ? 'desc' : 'asc' })}>{label}{sort.sortBy === sortField && <ChevronDown className={sort.sortOrder === 'asc' ? 'ascending' : ''} />}</button></th> })}<th /></tr></thead>
      <tbody>{loading ? <SkeletonRows columns={visibleColumns.length + (config.readOnly ? 1 : 2)} /> : rows.map((row) => <tr key={row._id} onDoubleClick={() => onOpen(row)}>
        {!config.readOnly && <td className="check-cell"><input type="checkbox" checked={selected.includes(row._id)} onChange={() => setSelected((current) => current.includes(row._id) ? current.filter((id) => id !== row._id) : [...current, row._id])} /></td>}
        {visibleColumns.map(({ column, index }) => <td key={index}>{renderCell(row, column[1], index)}</td>)}
        <td className="row-actions"><button aria-label="Actions" onClick={() => onOpen(row)}><MoreHorizontal /></button><div><button onClick={() => onOpen(row)}>View{config.readOnly ? '' : ' / edit'}</button>{!config.readOnly && <button className="danger-text" onClick={() => onDelete(row)}>Delete</button>}</div></td>
      </tr>)}</tbody>
    </table></div>
    {error && <div className="table-state error"><b>Unable to load {config.title.toLowerCase()}</b><p>{error.message}</p></div>}
    {empty && <div className="table-state"><config.icon /><b>No {config.title.toLowerCase()} found</b><p>Try changing the search or filters.</p></div>}
    <footer className="table-pagination"><p><b>{total.toLocaleString()}</b> total records</p><div><button disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></button></div></footer>
  </section>
}

function renderCell(row, accessor, index) {
  const value = displayValue(row, accessor)
  if (index === 0) return <div className="primary-cell"><span>{initial(value)}</span><div><b>{String(value || 'Untitled')}</b>{row.email && accessor !== 'email' && <small>{row.email}</small>}</div></div>
  if (isDate(value)) return <time>{new Date(value).toLocaleDateString([], { dateStyle: 'medium' })}</time>
  if (isStatus(value)) return <em className={`status status--${String(value).toLowerCase().replaceAll('_', '-')}`}>{String(value).replaceAll('_', ' ')}</em>
  return <span>{value === null || value === undefined || value === '' ? '—' : String(value)}</span>
}
function displayValue(row, accessor) { return typeof accessor === 'function' ? accessor(row) : String(accessor).split('.').reduce((value, key) => value?.[key], row) }
function SkeletonRows({ columns }) { return Array.from({ length: 7 }, (_, row) => <tr className="skeleton-row" key={row}>{Array.from({ length: columns }, (_, cell) => <td key={cell}><i style={{ width: `${55 + ((row + cell) * 13) % 40}%` }} /></td>)}</tr>) }
function fieldName(accessor) { return typeof accessor === 'string' ? accessor : 'createdAt' }
function initial(value) { return String(value || '?').slice(0, 1).toUpperCase() }
function isDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) }
function isStatus(value) { return ['active', 'inactive', 'pending', 'completed', 'failed', 'approved', 'rejected', 'suspended', 'verified', 'under_review', 'draft', 'published', 'processing', 'refunded', 'cancelled', 'revision_requested'].includes(String(value).toLowerCase()) }
function csv(value) { return `"${String(value ?? '').replaceAll('"', '""')}"` }
function statusOptions(config) {
  const field = config.fields.find(([name]) => name === 'status')
  if (field?.[3]) return field[3]
  if (config.title === 'Users') return ['active', 'inactive', 'suspended']
  return []
}
