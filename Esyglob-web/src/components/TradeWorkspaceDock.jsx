import { BriefcaseBusiness, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import TradeWorkspace from './TradeWorkspace'

export default function TradeWorkspaceDock(){const {pathname}=useLocation(),[open,setOpen]=useState(false);const context=useMemo(()=>{const match=pathname.match(/^\/(rfqs|quotations)\/([^/]+)$/);if(!match||['new','compare'].includes(match[2]))return null;return {entityType:match[1]==='rfqs'?'rfq':'quotation',entityId:match[2]}},[pathname]);if(!context)return null;return <><button className="trade-workspace-dock" onClick={()=>setOpen(true)}><BriefcaseBusiness/><span>Notes, documents & e-sign</span></button>{open&&<div className="modal-backdrop trade-workspace-modal" onMouseDown={()=>setOpen(false)}><div onMouseDown={event=>event.stopPropagation()}><button className="trade-workspace-close" onClick={()=>setOpen(false)}><X/></button><TradeWorkspace {...context}/></div></div>}</>}
