import { spawn } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:3000';

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForServer(retries = 30) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/login`);
      if (res.status < 500) return;
    } catch {}
    await wait(1000);
  }
  throw new Error('Server did not become ready in time.');
}

async function check(path, expectStatus, expectLocationContains) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  if (res.status !== expectStatus) throw new Error(`${path} expected ${expectStatus}, got ${res.status}`);
  if (expectLocationContains) {
    const location = res.headers.get('location') || '';
    if (!location.includes(expectLocationContains)) throw new Error(`${path} expected location containing "${expectLocationContains}", got "${location}"`);
  }
}

const server = spawn('npm', ['run', 'dev'], { stdio: 'ignore' });

try {
  await waitForServer();
  await check('/login', 200);
  await check('/dashboard', 307, '/login');
  await check('/hot-leads', 307, '/login');
  await check('/deals', 307, '/login');
  await check('/deals/00000000-0000-0000-0000-000000000000', 307, '/login');
  console.log('Smoke checks passed.');
} finally {
  server.kill('SIGTERM');
}
