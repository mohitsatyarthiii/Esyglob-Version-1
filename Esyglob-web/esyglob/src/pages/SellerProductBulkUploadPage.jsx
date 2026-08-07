import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  PackagePlus,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  bulkSellerProductTemplateUrl,
  executeBulkSellerProducts,
  fetchBulkSellerProductHistory,
  previewBulkSellerProducts,
} from '../api/account'
import AppShell from '../components/AppShell'

const requiredFields = [
  ['Product Name', 'The customer-facing product name.'],
  ['Category', 'Must exactly match an active marketplace category name.'],
  ['Subcategory', 'Must belong to the selected category and match its active name.'],
  ['MOQ', 'Whole number of at least 1.'],
  ['Price', 'A non-negative number without a currency symbol.'],
]

const optionalFields = [
  ['Description', 'Up to 2,000 characters'],
  ['Unit', 'piece, kg, gram, metric_ton, litre, millilitre, meter, centimeter, roll, pack, box, bottle, carton, bag, or set'],
  ['Currency', 'ISO code such as INR or USD; defaults to INR'],
  ['Product Type', 'For example, Finished Product'],
  ['Brand / Country Of Origin', 'Plain text'],
  ['Stock Quantity', 'Non-negative number; defaults to 0'],
  ['Lead Time / Delivery Time', 'Number of days'],
  ['Specifications / Product Attributes', 'Key:Value pairs separated with |, or a JSON object'],
  ['Certifications', 'Values separated with |'],
  ['Product Images / Product Videos', 'Public HTTPS URLs separated with |; up to 8 images are processed'],
  ['Tags / SEO Keywords', 'Values separated with |'],
  ['Payment Terms', 'prepayment, partial_prepayment, bank_transfer, credit, or negotiable'],
  ['Order Type', 'inquiry_only, rfq_only, or direct_order_enabled'],
  ['Visibility', 'public, private, or unlisted'],
  ['Sample Available / Shipping Available', 'yes/no or true/false'],
  ['Sample Price', 'Number; used when Sample Available is yes'],
  ['Origin Port / Shipping Estimate', 'Plain text'],
  ['Shipping Methods / Shipping Countries', 'Values separated with |'],
  ['Warranty / Warranty Period', 'Plain text'],
  ['SEO Title', 'Up to 160 characters'],
  ['SEO Description', 'Up to 180 characters'],
]

export default function SellerProductBulkUploadPage() {
  const picker = useRef(null)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('draft')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    fetchBulkSellerProductHistory().then(setHistory).catch(() => {})
  }, [])

  function choose(nextFile) {
    if (!nextFile) return
    const extension = nextFile.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx', 'xls', 'json'].includes(extension)) {
      setError('Choose a CSV, XLSX, XLS, or JSON file.')
      return
    }
    if (nextFile.size > 15 * 1024 * 1024) {
      setError('The upload must be 15 MB or smaller.')
      return
    }
    setFile(nextFile)
    setPreview(null)
    setResult(null)
    setError('')
  }

  async function validateFile() {
    if (!file) return setError('Choose a product file first.')
    setBusy('preview')
    setError('')
    try {
      setPreview(await previewBulkSellerProducts(file, status))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function importProducts() {
    if (!preview?.importId) return
    setBusy('import')
    setError('')
    try {
      const completed = await executeBulkSellerProducts(preview.importId)
      setResult(completed)
      setHistory(await fetchBulkSellerProductHistory())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return <AppShell><main className="container module-page bulk-product-page">
    <Link className="back-link" to="/seller/products"><ArrowLeft />Back to products</Link>
    <header className="product-form-head">
      <div><span className="eyebrow">Seller catalog</span><h1>Bulk add products</h1><p>Validate a spreadsheet or JSON file before creating any listings.</p></div>
      <div className="product-create-switch">
        <Link className="button button--secondary" to="/seller/products/new"><PackagePlus />Add product</Link>
        <Link className="button button--primary" to="/seller/products/bulk"><UploadCloud />Bulk add products</Link>
      </div>
    </header>

    <section className="module-panel bulk-template-panel">
      <div><h2>1. Download a template</h2><p>Keep the column headings unchanged. One spreadsheet row or JSON object creates one product.</p></div>
      <div className="bulk-template-actions">
        <a className="button button--secondary" href={bulkSellerProductTemplateUrl('xlsx')}><FileSpreadsheet />XLSX template</a>
        <a className="button button--secondary" href={bulkSellerProductTemplateUrl('csv')}><Download />CSV template</a>
        <a className="button button--secondary" href={bulkSellerProductTemplateUrl('json')}><FileJson />JSON template</a>
      </div>
    </section>

    <section className="module-panel bulk-upload-panel">
      <div className="bulk-section-title"><div><h2>2. Upload and validate</h2><p>No product is created until you review the validation result and confirm import.</p></div>
        <label>New product status<select value={status} onChange={(event) => { setStatus(event.target.value); setPreview(null) }}><option value="draft">Draft (recommended)</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
      </div>
      <button
        type="button"
        className={`bulk-drop-zone${dragging ? ' is-dragging' : ''}`}
        onClick={() => picker.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]) }}
      >
        <UploadCloud /><strong>{file ? file.name : 'Drop your product file here'}</strong>
        <span>{file ? `${(file.size / 1024).toFixed(1)} KB · Click to replace` : 'or click to browse · CSV, XLSX, XLS, JSON · maximum 15 MB'}</span>
      </button>
      <input ref={picker} hidden type="file" accept=".csv,.xlsx,.xls,.json,application/json,text/csv" onChange={(event) => choose(event.target.files?.[0])} />
      {error && <p className="action-error"><AlertCircle />{error}</p>}
      <div className="bulk-upload-actions"><button className="button button--primary" disabled={!file || Boolean(busy)} onClick={validateFile}>{busy === 'preview' ? 'Validating…' : 'Validate and preview'}</button></div>
    </section>

    {preview && <section className="module-panel bulk-preview-panel">
      <div className="bulk-section-title"><div><h2>3. Review import</h2><p>Invalid rows will be skipped. Fix the source file and upload again if needed.</p></div></div>
      <div className="bulk-summary-grid">
        <Summary label="Total rows" value={preview.totals?.totalRows} />
        <Summary label="Ready" value={preview.totals?.validRows} tone="success" />
        <Summary label="Invalid" value={preview.totals?.invalidRows} tone="danger" />
        <Summary label="Warnings" value={preview.totals?.warningRows} tone="warning" />
      </div>
      <div className="bulk-preview-table"><table><thead><tr><th>Row</th><th>Product</th><th>Category</th><th>Price</th><th>MOQ</th><th>Validation</th></tr></thead><tbody>
        {(preview.rows || []).map((row) => <tr key={row.rowNumber} className={row.status === 'invalid' ? 'is-invalid' : ''}>
          <td>{row.rowNumber}</td><td><b>{row.data?.name || 'Unnamed product'}</b></td><td>{row.data?.category || '—'}<small>{row.data?.subcategory || ''}</small></td><td>{row.data?.currency} {row.data?.price ?? '—'}</td><td>{row.data?.minimumOrderQuantity ?? '—'} {row.data?.unit}</td>
          <td>{row.errors?.length ? <span className="bulk-row-errors"><AlertCircle />{row.errors.join(' · ')}</span> : <span className="bulk-row-valid"><CheckCircle2 />Ready{row.warnings?.length ? ` · ${row.warnings.join(' · ')}` : ''}</span>}</td>
        </tr>)}
      </tbody></table></div>
      {preview.truncated && <p className="bulk-note">Showing the first 200 rows. All rows will still be imported.</p>}
      <div className="bulk-upload-actions"><button className="button button--primary" disabled={!preview.totals?.validRows || Boolean(busy) || Boolean(result)} onClick={importProducts}>{busy === 'import' ? 'Importing products…' : `Import ${preview.totals?.validRows || 0} valid products`}</button></div>
    </section>}

    {result && <section className="module-panel bulk-result-panel"><CheckCircle2 /><div><h2>Bulk import complete</h2><p>{result.importedCount || 0} products were created. {result.totals?.failedRows || 0} rows failed during import.</p><Link className="button button--primary" to="/seller/products">View products</Link></div></section>}

    <section className="module-panel bulk-format-guide">
      <h2>File format and columns</h2>
      <p>The first CSV/Excel row must contain headings. JSON can be an array or <code>{'{"products": [...]}'}</code>. The template includes a valid example.</p>
      <h3>Required fields</h3><div className="bulk-field-grid">{requiredFields.map(([name, detail]) => <article key={name}><b>{name}<em>Required</em></b><span>{detail}</span></article>)}</div>
      <details><summary>Show all optional fields</summary><div className="bulk-field-grid">{optionalFields.map(([name, detail]) => <article key={name}><b>{name}</b><span>{detail}</span></article>)}</div></details>
    </section>

    {history.length > 0 && <section className="module-panel bulk-history"><h2>Recent uploads</h2>{history.slice(0, 5).map((item) => <article key={item._id || item.id}><div><b>{item.fileName}</b><span>{new Date(item.createdAt).toLocaleString()}</span></div><strong>{item.importStatus?.replaceAll('_', ' ')}</strong><span>{item.totals?.importedRows || 0} imported / {item.totals?.totalRows || 0} rows</span></article>)}</section>}
  </main></AppShell>
}

function Summary({ label, value = 0, tone = '' }) {
  return <article className={tone ? `is-${tone}` : ''}><span>{label}</span><b>{value}</b></article>
}
