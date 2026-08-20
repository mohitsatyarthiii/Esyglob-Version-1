import { ArrowLeft, CheckCircle2, ClipboardCheck, CreditCard, Factory, FileText, MapPin, PackageCheck, ShieldCheck, Truck, XCircle } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addProductionUpdate, buyerOrderAction, fetchOrder, initiatePayment, retryOrderShippingBooking, updateOrder, verifyPayment } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import TradeWorkspace from '../components/TradeWorkspace'
import { DetailItem, Money, StatusBadge } from '../components/TradeUI'
import { resolveId } from '../utils/trade'
import useAsyncData from '../hooks/useAsyncData'
import { TradeSkeleton } from './RfqsPage'

const productionStages=['raw_material_procured','manufacturing_started','manufacturing','quality_inspection','packaging','production_completed']
const label=value=>String(value||'').replaceAll('_',' ')
export default function OrderDetailsPage(){
  const {orderId}=useParams(),navigate=useNavigate(),{user}=useAuth(),query=useAsyncData(useCallback(()=>fetchOrder(orderId),[orderId]));const [payment,setPayment]=useState({busy:false,data:null,error:''}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[notes,setNotes]=useState(''),[productionStage,setProductionStage]=useState('raw_material_procured'),[tracking,setTracking]=useState('')
  const sellerView=user?.primaryRole==='seller'
async function pay() {
  setPayment({ busy: true, data: null, error: '' })
  try {
    const session = await initiatePayment(orderId)
    console.log('Payment session:', session) // Debug log
    
    await loadRazorpay()
    
    // Check all required fields
    if (!session.keyId || !session.razorpayOrderId || !session.paymentId) {
      throw new Error('Payment gateway did not return a complete checkout session. Please try again.')
    }
    
    const options = {
      key: session.keyId,
      amount: session.amount,
      currency: session.currency || 'INR',
      name: 'EsyGlob',
      description: `Payment for ${session.orderNumber || 'order'}`,
      order_id: session.razorpayOrderId,
      handler: async function(result) {
        try {
          await verifyPayment({
            paymentId: session.paymentId,
            razorpayPaymentId: result.razorpay_payment_id,
            razorpayOrderId: result.razorpay_order_id,
            razorpaySignature: result.razorpay_signature
          })
          navigate('/payment/success', {
            state: {
              kind: 'order',
              reference: orderId,
              amount: Number(session.amount || 0) / 100,
              currency: session.currency || 'INR',
              returnTo: `/orders/${orderId}`
            }
          })
        } catch (error) {
          navigate('/payment/failure', {
            state: {
              kind: 'order',
              reference: orderId,
              returnTo: `/orders/${orderId}`,
              retryTo: `/orders/${orderId}`,
              message: error.message
            }
          })
        }
      },
      modal: {
        ondismiss: function() {
          navigate('/payment/failure', {
            state: {
              kind: 'order',
              reference: orderId,
              returnTo: `/orders/${orderId}`,
              retryTo: `/orders/${orderId}`,
              cancelled: true,
              message: 'Payment was cancelled.'
            }
          })
        }
      },
      theme: {
        color: '#2563EB'
      }
    }
    
    const gateway = new window.Razorpay(options)
    gateway.on('payment.failed', function(result) {
      navigate('/payment/failure', {
        state: {
          kind: 'order',
          reference: orderId,
          returnTo: `/orders/${orderId}`,
          retryTo: `/orders/${orderId}`,
          message: result.error?.description || 'Payment failed.'
        }
      })
    })
    gateway.open()
    
  } catch (error) {
    console.error('Payment error:', error)
    navigate('/payment/failure', {
      state: {
        kind: 'order',
        reference: orderId,
        returnTo: `/orders/${orderId}`,
        retryTo: `/orders/${orderId}`,
        cancelled: error.code === 'PAYMENT_CANCELLED',
        message: error.message
      }
    })
  } finally {
    setPayment({ busy: false, data: null, error: '' })
  }
}
  async function perform(fn,success){setBusy(true);setError('');try{await fn();setMessage(success);setNotes('');await query.reload()}catch(e){setError(e.message)}finally{setBusy(false)}}
  if(query.loading)return <AppShell><div className="listing-page container"><TradeSkeleton/></div></AppShell>;if(query.error)return <AppShell><div className="listing-page container"><div className="inline-error">{query.error.message}</div></div></AppShell>
  const order=query.data||{},product=typeof order.productId==='object'?order.productId:order.products?.[0]||{},timeline=order.timeline||order.statusHistory||[],workflow=order.workflowSnapshot||{},allowed=workflow.allowedNextStages||[]
  const agreement=(order.tradeDocuments||[]).find(doc=>resolveId(doc)===resolveId(order.agreement?.documentId));const signatureProgress=agreement?{buyer:agreement.signatures?.some(x=>x.signerRole==='buyer'),seller:agreement.signatures?.some(x=>x.signerRole==='seller'),status:agreement.status}:null
  return <AppShell><main className="detail-page container trade-page order-operations"><button className="back-link" onClick={()=>navigate(-1)}><ArrowLeft/>Back to orders</button><section className="order-hero"><i><PackageCheck/></i><div><div className="trade-heading-line"><span className="eyebrow">{order.orderNumber||'Trade order'}</span><StatusBadge status={order.status||'pending'}/></div><h1>{product.name||order.rfqId?.title||'Marketplace order'}</h1><p>Created {order.createdAt?new Date(order.createdAt).toLocaleDateString():''} · Responsible: {label(workflow.responsibleParty||'platform')}</p></div><div><small>Order total</small><b><Money value={order.totalAmount} currency={order.currency}/></b><StatusBadge status={order.paymentStatus||'payment_pending'}/></div></section>{error&&<p className="action-error">{error}</p>}{message&&<p className="action-success">{message}</p>}{payment.error&&<p className="action-error">{payment.error}</p>}
  {signatureProgress&&<section className="agreement-progress"><FileText/><div><b>Purchase agreement · {label(signatureProgress.status)}</b><p><span className={signatureProgress.seller?'done':''}>Seller signature</span><span className={signatureProgress.buyer?'done':''}>Buyer signature</span><span className={signatureProgress.status==='completed'?'done':''}>Agreement complete</span></p></div></section>}
  {order.paymentStatus==='paid'&&!order.trackingNumber&&<section className="agreement-progress"><Truck/><div><b>EsyGlob Shipping booking pending</b><p>The selected paid shipping service can be retried without changing the order total.</p></div><button className="button button--secondary" disabled={busy} onClick={()=>perform(()=>retryOrderShippingBooking(orderId),'EsyGlob Shipping booking retried.')}>Retry booking</button></section>}
  <div className="detail-columns"><div><section className="detail-card"><h2>Final commercial terms</h2><dl className="trade-detail-grid"><DetailItem label="Product">{product.name}</DetailItem><DetailItem label="Quantity">{order.quantity||order.products?.[0]?.quantity} {order.unit||product.unit}</DetailItem><DetailItem label="Unit price"><Money value={order.pricePerUnit} currency={order.currency}/></DetailItem><DetailItem label="Shipping"><Money value={order.shippingCost} currency={order.currency}/></DetailItem><DetailItem label="Taxes"><Money value={order.taxAmount} currency={order.currency}/></DetailItem><DetailItem label="Discount"><Money value={order.discount} currency={order.currency}/></DetailItem><DetailItem label="Payment terms">{order.tradeInformation?.paymentTerms}</DetailItem><DetailItem label="Delivery terms">{order.tradeInformation?.deliveryTerms}</DetailItem><DetailItem label="Lead time">{order.tradeInformation?.leadTime}</DetailItem><DetailItem label="Tracking number">{order.trackingNumber}</DetailItem></dl></section><section className="detail-card"><h2><Truck/>End-to-end timeline</h2><div className="order-timeline">{timeline.map((entry,index)=><span key={entry._id||index}><i/><div><b>{label(entry.status||entry.stage||'update')}</b><p>{entry.note||entry.message}</p><small>{entry.createdAt||entry.timestamp?new Date(entry.createdAt||entry.timestamp).toLocaleString():''}</small></div></span>)}</div></section><TradeWorkspace entityType="order" entityId={orderId}/></div>
  <aside><section className="detail-card order-control-panel"><h2><ClipboardCheck/>{sellerView?'Seller controls':'Buyer controls'}</h2><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add an operational note"/>{sellerView?<><div className="order-next-actions">{allowed.map(status=><button disabled={busy} key={status} onClick={()=>perform(()=>updateOrder(orderId,{status,notes,trackingNumber:tracking||undefined}),`Order updated to ${label(status)}.`)}>{label(status)}</button>)}</div>{['confirmed','processing','production'].includes(order.status)&&<><label>Production milestone<select value={productionStage} onChange={e=>setProductionStage(e.target.value)}>{productionStages.map(stage=><option key={stage} value={stage}>{label(stage)}</option>)}</select></label><button className="button button--secondary button--full" disabled={busy} onClick={()=>perform(()=>addProductionUpdate(orderId,{stage:productionStage,note:notes}),`Production updated: ${label(productionStage)}.`)}><Factory/>Add production update</button></>}<label>Tracking number<input value={tracking} onChange={e=>setTracking(e.target.value)} placeholder={order.trackingNumber||'Enter tracking number'}/></label></>:<div className="buyer-order-actions"><BuyerCheckoutControls order={order} busy={busy} onAction={perform}/>{order.status==='pending_approval'&&order.tradeInformation?.initiatedBy!=='buyer'&&<><button className="button button--primary" disabled={busy||(order.agreement?.required&&order.agreement.status!=='completed')||!order.checkout?.logisticsSelected||!order.checkout?.termsAccepted} onClick={()=>perform(()=>buyerOrderAction(orderId,{action:'approve',notes}),'Final terms approved. Proceed to payment.')}><CheckCircle2/>Approve terms</button><button className="button button--secondary" disabled={busy} onClick={()=>perform(()=>buyerOrderAction(orderId,{action:'request_revision',notes}),'Revision requested.')}><ClipboardCheck/>Request revision</button><button className="button danger-button" disabled={busy} onClick={()=>perform(()=>buyerOrderAction(orderId,{action:'reject_changes',notes}),'Changes rejected.')}><XCircle/>Reject changes</button></>}{order.status==='delivered'&&<button className="button button--primary" onClick={()=>perform(()=>buyerOrderAction(orderId,{action:'confirm_delivery',notes}),'Delivery confirmed.')}><CheckCircle2/>Confirm delivery</button>}{['pending','pending_approval','awaiting_payment','pending_payment','confirmed'].includes(order.status)&&<button className="button danger-button" onClick={()=>perform(()=>buyerOrderAction(orderId,{action:'cancel',notes}),'Order cancelled.')}><XCircle/>Cancel order</button>}</div>}</section><section className="detail-card"><h2><ShieldCheck/>Linked trade</h2>{resolveId(order.rfqId)&&<Link to={`/rfqs/${resolveId(order.rfqId)}`}><FileText/>View RFQ</Link>}{resolveId(order.quotationId)&&<Link to={`/quotations/${resolveId(order.quotationId)}`}><FileText/>View quotation</Link>}</section><section className="detail-card"><h2><MapPin/>Delivery</h2><p>{order.shippingAddress?.formatted||[order.shippingAddress?.address,order.shippingAddress?.city,order.shippingAddress?.country].filter(Boolean).join(', ')||'Delivery address is completed during checkout.'}</p></section>{!sellerView&&String(order.paymentStatus).toLowerCase()!=='paid'&&['pending_payment','awaiting_payment'].includes(order.status)&&<button className="button button--primary button--full" onClick={pay} disabled={payment.busy}><CreditCard/>{payment.busy?'Starting payment…':'Proceed to payment'}</button>}</aside></div></main></AppShell>
}
function BuyerCheckoutControls({ order, busy, onAction }) {
  const [logistics, setLogistics] = useState(order.checkout?.logisticsOption || '')
  const [acknowledgement, setAcknowledgement] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [address, setAddress] = useState({
    fullName: order.shippingAddress?.fullName || order.shippingAddress?.name || '',
    company: order.shippingAddress?.company || '',
    email: order.shippingAddress?.email || '',
    phone: order.shippingAddress?.phone || '',
    address: order.shippingAddress?.address || '',
    city: order.shippingAddress?.city || '',
    state: order.shippingAddress?.state || '',
    country: order.shippingAddress?.country || '',
    postalCode: order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || ''
  })
  
  const [localBusy, setLocalBusy] = useState('')
  const addressComplete = ['fullName', 'phone', 'address', 'city', 'state', 'country', 'postalCode'].every(field => String(address[field] || '').trim())
  const updateAddress = (field, value) => setAddress(current => ({ ...current, [field]: value }))
  
  // Calculate amounts
  const subtotal = Number(order.pricePerUnit || 0) * Number(order.quantity || order.products?.[0]?.quantity || 0)
  const shippingCost = Number(order.shippingCost || 0)
  const taxRate = Number(order.taxes?.taxRate || order.taxRate || 18)
  const taxAmount = Number(order.taxAmount || (subtotal * taxRate / 100))
  const platformFee = Math.round((subtotal + shippingCost + taxAmount) * 0.02)
  const discount = Number(order.discount || 0)
  const totalAmount = subtotal + shippingCost + taxAmount + platformFee - discount
  
  const logisticsSelected = Boolean(order.checkout?.logisticsSelected || order.checkout?.logisticsOption)
  const addressProvided = Boolean(order.checkout?.shippingAddressProvided || order.shippingAddress?.address)
  const termsAccepted = Boolean(order.checkout?.termsAccepted)
  
  // Define steps array here
  const steps = [
    { label: 'Shipping', done: addressProvided },
    { label: 'Logistics', done: logisticsSelected },
    { label: 'Terms', done: termsAccepted }
  ]
  
  const handleLocalAction = async (actionFn, successMsg, actionKey) => {
    setLocalBusy(actionKey)
    try {
      await actionFn()
      setLocalBusy('')
    } catch {
      setLocalBusy('')
    }
  }

  if (!['pending_approval', 'pending_payment', 'awaiting_payment'].includes(order.status)) return null
  
  return (
    <div className="w-full max-w-3xl mx-auto py-6">
      {/* Checkout Steps */}
      <div className="flex items-center justify-center gap-0 mb-8">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                step.done ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
              }`}>
                {step.done ? '✓' : index + 1}
              </div>
              <span className={`text-xs mt-1 ${step.done ? 'text-green-600' : 'text-gray-600'}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-20 h-0.5 mx-2 ${steps[index + 1].done ? 'bg-green-500' : 'bg-gray-300'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Shipping Address Section */}
      {!addressProvided && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Shipping Address</h3>
              <p className="text-sm text-gray-500">Where should we deliver your order?</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input 
                value={address.fullName} 
                onChange={e => updateAddress('fullName', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Company (Optional)</label>
              <input 
                value={address.company} 
                onChange={e => updateAddress('company', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
              <input 
                value={address.email} 
                onChange={e => updateAddress('email', e.target.value)} 
                type="email"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone *</label>
              <input 
                value={address.phone} 
                onChange={e => updateAddress('phone', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="+91 XXXXX XXXXX"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Street Address *</label>
              <input 
                value={address.address} 
                onChange={e => updateAddress('address', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="House no, street, area"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">City *</label>
              <input 
                value={address.city} 
                onChange={e => updateAddress('city', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="City"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">State *</label>
              <input 
                value={address.state} 
                onChange={e => updateAddress('state', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="State"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Country *</label>
              <input 
                value={address.country} 
                onChange={e => updateAddress('country', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Country"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Postal Code *</label>
              <input 
                value={address.postalCode} 
                onChange={e => updateAddress('postalCode', e.target.value)} 
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Postal code"
              />
            </div>
          </div>
          
          <button 
            className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={busy || localBusy === 'address' || !addressComplete} 
            onClick={() => handleLocalAction(
              () => onAction(() => buyerOrderAction(resolveId(order), { action: 'update_shipping_address', shippingAddress: address }), 'Delivery address confirmed.'),
              'address'
            )}
          >
            {localBusy === 'address' ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      )}

      {/* Logistics Section */}
      {addressProvided && !logisticsSelected && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
              <Truck className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Select Logistics</h3>
              <p className="text-sm text-gray-500">Choose your preferred shipping method</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {(order.logisticsOptions || []).map(option => (
              <button 
                type="button" 
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                  logistics === option.key 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50/50'
                }`} 
                key={option.key} 
                onClick={() => setLogistics(option.key)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    logistics === option.key ? 'border-purple-500' : 'border-gray-300'
                  }`}>
                    {logistics === option.key && <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />}
                  </div>
                  <div className="text-left">
                    <b className="text-sm text-gray-900">{option.label}</b>
                    <small className="block text-xs text-gray-500 mt-0.5">{option.eta} · {option.features?.join(' · ')}</small>
                  </div>
                </div>
                <strong className="text-sm text-gray-900">
                  <Money value={option.price} currency={option.currency} />
                </strong>
              </button>
            ))}
          </div>
          
          <button 
            className="mt-5 w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={busy || localBusy === 'logistics' || !logistics} 
            onClick={() => handleLocalAction(
              () => onAction(() => buyerOrderAction(resolveId(order), { action: 'select_logistics', logisticsOption: logistics }), 'Logistics plan selected.'),
              'logistics'
            )}
          >
            {localBusy === 'logistics' ? 'Saving...' : 'Save Logistics'}
          </button>
        </div>
      )}

      {/* Order Summary */}
      {addressProvided && logisticsSelected && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">
                <Money value={subtotal} currency={order.currency} />
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Shipping</span>
              <span className="font-medium text-gray-900">
                <Money value={shippingCost} currency={order.currency} />
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax ({taxRate}%)</span>
              <span className="font-medium text-gray-900">
                <Money value={taxAmount} currency={order.currency} />
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Platform Fee (2%)</span>
              <span className="font-medium text-gray-900">
                <Money value={platformFee} currency={order.currency} />
              </span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="font-medium text-green-600">-<Money value={discount} currency={order.currency} /></span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
              <span className="font-semibold text-gray-900">Total Amount</span>
              <span className="text-xl font-bold text-gray-900">
                <Money value={totalAmount} currency={order.currency} />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Terms & Payment */}
      {addressProvided && logisticsSelected && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <input 
              type="checkbox" 
              checked={termsChecked || termsAccepted} 
              onChange={e => setTermsChecked(e.target.checked)}
              disabled={termsAccepted}
              className="mt-1 w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-900">I agree to the Trade Terms</label>
              <p className="text-xs text-gray-500 mt-1">
                By checking this box, you agree to EsyGlob's trade terms, platform policies, and the specific terms of this order including pricing, delivery, and quality standards.
              </p>
            </div>
          </div>
          
          {!termsAccepted && termsChecked && (
            <textarea 
              value={acknowledgement} 
              onChange={e => setAcknowledgement(e.target.value)} 
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all mb-4"
              rows="2"
              placeholder="Type your full name to acknowledge and accept the trade terms"
            />
          )}
          
          {!termsAccepted && (
            <button 
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              disabled={busy || localBusy === 'terms' || !termsChecked || !acknowledgement.trim()} 
              onClick={() => handleLocalAction(
                () => onAction(() => buyerOrderAction(resolveId(order), { action: 'accept_terms', accepted: true, termsVersion: 'trade-terms-v1', acknowledgement }), 'Trade terms acknowledged.'),
                'terms'
              )}
            >
              <ShieldCheck className="inline w-4 h-4 mr-2" />
              {localBusy === 'terms' ? 'Accepting...' : 'Accept Terms'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
function loadRazorpay(){if(window.Razorpay)return Promise.resolve();return new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-esyglob-razorpay]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('Payment checkout could not be loaded.')),{once:true});return}const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;script.dataset.esyglobRazorpay='true';script.onload=resolve;script.onerror=()=>reject(new Error('Payment checkout could not be loaded.'));document.body.appendChild(script)})}
