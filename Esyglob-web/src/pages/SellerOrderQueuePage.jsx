import { ArrowRight, FileSignature, FileText, PackageCheck, Search, ShoppingCart, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSellerOrderQueue } from '../api/trade'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { getRealtimeClient } from '../realtime/socket'
import { displayName, resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'

export default function SellerOrderQueuePage(){
  const [search,setSearch]=useState('')
  const query=useAsyncData(useCallback(()=>fetchSellerOrderQueue(),[]))
  const reloadQueue=query.reload
  useEffect(()=>{let socket;const refresh=()=>reloadQueue();getRealtimeClient().then(client=>{socket=client;client.on('quotation_updated',refresh);client.on('order_updated',refresh)}).catch(()=>{});return()=>{socket?.off('quotation_updated',refresh);socket?.off('order_updated',refresh)}},[reloadQueue])
  const items=(query.data||[]).filter(item=>!search||JSON.stringify(item).toLowerCase().includes(search.toLowerCase()))
  return <AppShell><main className="container seller-queue-page"><header className="verification-hero"><div><span className="eyebrow">Seller operations</span><h1>Trade workflow queue</h1><p>Review RFQs, revise quotations, prepare Final Quotations and operate active orders from one synchronized queue.</p></div><Link className="button button--secondary" to="/orders?role=seller"><ShoppingCart/>Active orders</Link></header><label className="admin-review-search"><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search buyer, product, RFQ or status"/></label>{query.loading?<TradeSkeleton/>:<div className="seller-queue-list">{items.map(item=>{const quotationId=item.quotationId||resolveId(item.quotation);const rfqId=item.rfqId||resolveId(item.rfq);const href=item.orderId?`/trade-workspace/order/${item.orderId}`:quotationId&&item.status==='final_quotation_signed'?`/trade-workspace/quotation/${quotationId}`:quotationId?`/quotations/${quotationId}?role=seller`:`/rfqs/${rfqId}?role=seller`;const action=item.orderId?'Manage workspace':quotationId&&item.status==='buyer_accepted'?'Prepare Final Quotation':quotationId&&item.status==='final_quotation_pending'?'Await Buyer signature':quotationId&&item.status==='final_quotation_signed'?'Start Order':quotationId?'Review quotation':'Review RFQ';return <article key={`${item.queueType}-${item.queueId}`}><i>{item.orderId?<PackageCheck/>:quotationId?<FileSignature/>:<FileText/>}</i><div><span className="eyebrow">{item.queueType}</span><h2>{item.product?.name||item.rfq?.title||'Trade request'}</h2><p><UserRound/> {displayName(item.buyer,'Buyer')} · Qty {item.quantity||'—'} {item.unit||''} · {item.documents||0} documents</p></div><div><Money value={item.totalAmount||item.unitPrice}/><StatusBadge status={item.negotiationStatus||item.status}/></div><Link to={href}>{action} <ArrowRight/></Link></article>})}</div>}{!query.loading&&!items.length&&<div className="empty-results"><PackageCheck/><h2>Queue is clear</h2><p>New RFQs, revision requests, Final Quotations and orders will appear here.</p></div>}</main></AppShell>
}
