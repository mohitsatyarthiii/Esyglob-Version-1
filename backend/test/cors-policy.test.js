import assert from 'node:assert/strict';
import test from 'node:test';

const adminOrigin = 'https://esyglob-admin-panel.netlify.app';
process.env.CORS_ORIGIN = adminOrigin;

const { default: app } = await import('../src/app.js');

test('CORS preflight returns exactly one allowed origin and rejects unknown origins', async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const preflightHeaders = {
    'Access-Control-Request-Headers': 'content-type',
    'Access-Control-Request-Method': 'POST',
  };

  const allowed = await fetch(`http://127.0.0.1:${port}/api/auth/signin`, {
    method: 'OPTIONS',
    headers: { ...preflightHeaders, Origin: adminOrigin },
  });

  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), adminOrigin);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.doesNotMatch(allowed.headers.get('access-control-allow-origin'), /,/);

  const denied = await fetch(`http://127.0.0.1:${port}/api/auth/signin`, {
    method: 'OPTIONS',
    headers: { ...preflightHeaders, Origin: 'https://untrusted.example' },
  });

  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
