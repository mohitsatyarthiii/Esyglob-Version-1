import { apiRequest } from './client';
import { normalizeList, unwrapData } from './normalizers';

export type DisputeEvidence={type:'photo'|'document'|'other';title:string;url:string;description?:string;submittedAt?:string};
export type DisputeCase={_id:string;disputeNumber?:string;transactionType:'order'|'escrow'|'shipping'|'quality'|'payment';transactionId:string;type:string;title?:string;description:string;desiredResolution?:string;claimAmount?:number;currency?:string;status:string;mediatorName?:string;evidence?:DisputeEvidence[];timeline?:Array<{action?:string;description?:string;performedAt?:string}>;messages?:Array<{message?:string;attachments?:string[];createdAt?:string;senderId?:unknown}>;resolution?:Record<string,unknown>;refundAmount?:number;filedAt?:string;resolvedAt?:string;closedAt?:string;createdAt?:string;updatedAt?:string};
export type EscrowSummary={_id:string;transactionNumber?:string;status?:string;amount?:number;currency?:string;sellerId?:any;userId?:any;orderId?:any;updatedAt?:string};
export type CreateDisputeInput={respondentId:string;transactionType:'order'|'escrow';transactionId:string;type:'quality'|'delivery'|'payment'|'contract'|'other';title?:string;description:string;desiredResolution?:string;claimAmount?:number;currency?:string;evidence?:DisputeEvidence[]};

export async function fetchDisputes(){return normalizeList<DisputeCase>(await apiRequest('/disputes',{query:{limit:50}}),['disputes','items']);}
export async function fetchDispute(id:string){const data=unwrapData<{dispute?:DisputeCase}|DisputeCase>(await apiRequest(`/disputes/${id}`));return (data&&typeof data==='object'&&'dispute' in data?data.dispute:data) as DisputeCase;}
export async function createDispute(input:CreateDisputeInput){const data=unwrapData<{dispute?:DisputeCase}|DisputeCase>(await apiRequest('/disputes',{method:'POST',body:input}));return (data&&typeof data==='object'&&'dispute' in data?data.dispute:data) as DisputeCase;}
export async function fetchEscrows(){return normalizeList<EscrowSummary>(await apiRequest('/escrow',{query:{limit:50}}),['transactions','escrows','items']);}
