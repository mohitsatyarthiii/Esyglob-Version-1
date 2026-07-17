import 'dotenv/config';

const baseUrl = String(process.env.AI_PLATFORM_TEST_BASE_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
const email = process.env.AI_PLATFORM_TEST_EMAIL;
const password = process.env.AI_PLATFORM_TEST_PASSWORD;
if (!email || !password) throw new Error('Set AI_PLATFORM_TEST_EMAIL and AI_PLATFORM_TEST_PASSWORD.');

const login = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('No session cookie returned.');

const response = await fetch(`${baseUrl}/ai-chat/stream`, {
  method: 'POST',
  headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    role: 'admin',
    message: 'Compare the best matching solar products and verified sellers by price, MOQ, rating and trust. Also explain my membership options and give app actions to open each result.',
  }),
});
if (!response.ok || !response.body) throw new Error(`Chat failed: ${response.status} ${await response.text()}`);

let buffer = '';
let answer = '';
let done;
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
  const frames = buffer.split('\n\n');
  buffer = frames.pop() || '';
  for (const frame of frames) {
    const line = frame.split('\n').find(item => item.startsWith('data:'));
    if (!line) continue;
    const event = JSON.parse(line.replace(/^data:\s*/, ''));
    if (event.type === 'token') answer += event.content || '';
    if (event.type === 'done') done = event;
    if (event.type === 'error') throw new Error(event.message || 'Stream error');
  }
}

const snapshot = done?.marketplace || {};
const serialized = JSON.stringify(snapshot).toLowerCase();
const forbidden = ['password', 'providertoken', 'encryptedaccountnumber', 'authenticationtoken', 'cardexpirymonth'];
const leaked = forbidden.filter(field => serialized.includes(field));
const actions = Array.isArray(snapshot.navigationActions) ? snapshot.navigationActions : [];
const productActions = actions.filter(item => item.entityType === 'product');
const sellerActions = actions.filter(item => item.entityType === 'seller');
const planCount = Array.isArray(snapshot.plans) ? snapshot.plans.length : 0;
const assertions = {
  answer: answer.trim().length > 20,
  roleEscalationBlocked: snapshot.roleContext !== 'admin',
  plansReturned: planCount > 0,
  productActionsReturned: productActions.length > 0,
  sellerActionsReturned: sellerActions.length > 0,
  nativeRoutesValid: actions.every(item => item.route && !/^https?:/i.test(item.route)),
  sensitiveFieldsExcluded: leaked.length === 0,
  requestedModelCompleted: done?.model === 'qwen2.5:3b',
};
console.log(JSON.stringify({ assertions, timing: done?.timing, model: done?.model, planCount, actions: actions.length, productActions: productActions.length, sellerActions: sellerActions.length, leaked, answer: answer.slice(0, 500) }, null, 2));
if (Object.values(assertions).some(value => !value)) process.exitCode = 1;
