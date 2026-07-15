import { apiRequest } from './client';
import { unwrapData } from './normalizers';
export type BillingCycle='monthly'|'quarterly'|'yearly';
export type SubscriptionPlan={_id:string;key:string;role:'buyer'|'seller';name:string;description?:string;prices:Record<BillingCycle,number>;features:string[];aiCredits:number;storageLimitMb:number;limits:Record<string,number>;supportLevel:string;priorityRanking:number;verificationLevel:string;trustScoreBoost:number;aiProvider:string};
export type SubscriptionOverview={subscription:Record<string,any>;plan:SubscriptionPlan;usage:Record<string,any>};
export async function fetchSubscription(role:'buyer'|'seller'){return unwrapData<SubscriptionOverview>(await apiRequest('/subscription',{query:{role}}));}
export async function fetchSubscriptionPlans(role:'buyer'|'seller'){const data=unwrapData<{plans:SubscriptionPlan[]}>(await apiRequest('/subscription/plans',{query:{role}}));return data.plans||[];}
export async function createSubscriptionOrder(planType:string,duration:BillingCycle){return unwrapData<any>(await apiRequest('/subscription/create-order',{method:'POST',body:{planType,duration}}));}
export async function verifySubscriptionPayment(body:Record<string,unknown>){return unwrapData<any>(await apiRequest('/payments/verify/subscription',{method:'POST',body}));}
export async function setSubscriptionAutoRenew(autoRenew:boolean){return unwrapData<any>(await apiRequest('/subscription/auto-renew',{method:'PATCH',body:{autoRenew}}));}
