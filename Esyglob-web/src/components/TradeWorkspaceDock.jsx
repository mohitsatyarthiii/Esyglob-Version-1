import { BriefcaseBusiness, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import TradeWorkspace from './TradeWorkspace'

export default function TradeWorkspaceDock(){const {pathname}=useLocation(),[open,setOpen]=useState(false);const context=useMemo(()=>{const match=pathname.match(/^\/(rfqs|quotations|orders)\/([^/]+)$/);if(!match||['new','compare'].includes(match[2]))return null;return {entityType:match[1]==='rfqs'?'rfq':match[1]==='orders'?'order':'quotation',entityId:match[2]}},[pathname]);if(!context)return null;return <><div className="trade-workspace-dock"><Link to={`/trade-workspace/${context.entityType}/${context.entityId}`}><BriefcaseBusiness/><span>Open Trade Workspace</span></Link><button onClick={()=>setOpen(true)}>Quick notes</button></div>{open&&<div className="modal-backdrop trade-workspace-modal" onMouseDown={()=>setOpen(false)}><div onMouseDown={event=>event.stopPropagation()}><button className="trade-workspace-close" onClick={()=>setOpen(false)}><X/></button><TradeWorkspace {...context}/></div></div>}</>}
