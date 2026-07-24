import axios from 'axios';

const API_URL = 'https://api.razorpay.com/v1';

function credentials() {
  const keyId = process.env.RAZORPAYX_KEY_ID || process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAYX_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { username: keyId, password: keySecret } : null;
}

function client() {
  const auth = credentials();
  if (!auth) {
    throw Object.assign(new Error('RazorpayX account validation is not configured'), {
      statusCode: 503,
      providerCode: 'not_configured',
    });
  }
  return axios.create({
    baseURL: API_URL,
    auth,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });
}

function providerError(error, fallback) {
  const description = error?.response?.data?.error?.description;
  const next = new Error(description || fallback);
  next.statusCode = error?.response?.status === 400 ? 422 : 502;
  next.providerCode = error?.response?.data?.error?.code || 'provider_unavailable';
  return next;
}

export function isConfigured() {
  return Boolean(credentials());
}

export async function startValidation(method) {
  const fundAccount = method.type === 'bank_account'
    ? {
        account_type: 'bank_account',
        bank_account: {
          name: method.holderName,
          ifsc: method.ifsc,
          account_number: method.rawValue,
        },
      }
    : {
        account_type: 'vpa',
        vpa: { address: method.rawValue },
      };
  try {
    const { data } = await client().post('/fund_accounts/validations', {
      account_number: process.env.RAZORPAYX_SOURCE_ACCOUNT_NUMBER,
      fund_account: fundAccount,
      amount: 100,
      currency: 'INR',
      notes: { purpose: 'EsyGlob payout account verification' },
    });
    return data;
  } catch (error) {
    throw providerError(error, 'RazorpayX could not validate this payment account');
  }
}

export async function fetchValidation(validationId) {
  try {
    const { data } = await client().get(`/fund_accounts/validations/${validationId}`);
    return data;
  } catch (error) {
    throw providerError(error, 'RazorpayX validation status is unavailable');
  }
}

export function normalizeValidation(validation) {
  const providerStatus = String(validation?.status || '').toLowerCase();
  const accountStatus = String(
    validation?.results?.account_status || validation?.results?.status || ''
  ).toLowerCase();
  if (providerStatus === 'completed' && ['active', 'valid', 'verified'].includes(accountStatus)) {
    return {
      status: 'verified',
      message: validation?.results?.registered_name
        ? `Verified for ${validation.results.registered_name}`
        : 'Account ownership verified by RazorpayX',
    };
  }
  if (['failed', 'rejected'].includes(providerStatus)
    || ['invalid', 'inactive', 'failed'].includes(accountStatus)) {
    return {
      status: 'failed',
      message: validation?.failure_reason || 'RazorpayX could not verify this account',
    };
  }
  return {
    status: 'pending',
    message: 'Verification is processing with RazorpayX',
  };
}
