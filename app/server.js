/**
 * Zero to Production, Phase 2 (CinemaSeat)
 * Mock Payment + OTP Gateway
 *
 * Behaves like a real payment provider: slow, occasionally wrong,
 * and prone to telling you the same thing twice.
 *
 * IEEE Computer Society, CUET Student Branch Chapter
 * In partnership with Poridhi.io
 */

'use strict';

const express = require('express');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));

const CFG = {
  PORT: num(process.env.PORT, 9000),

  // Callback timing
  MIN_DELAY_MS: num(process.env.MIN_DELAY_MS, 2000),
  MAX_DELAY_MS: num(process.env.MAX_DELAY_MS, 15000),

  // Misbehaviour rates
  FAILURE_RATE: num(process.env.FAILURE_RATE, 0.10),
  DUPLICATE_RATE: num(process.env.DUPLICATE_RATE, 0.08),
  CHARGE_ERROR_RATE: num(process.env.CHARGE_ERROR_RATE, 0.02),
  RACE_RATE: num(process.env.RACE_RATE, 0), // force-header only by default

  // OTP
  OTP_FAILURE_RATE: num(process.env.OTP_FAILURE_RATE, 0.10),
  OTP_MIN_DELAY_MS: num(process.env.OTP_MIN_DELAY_MS, 1000),
  OTP_MAX_DELAY_MS: num(process.env.OTP_MAX_DELAY_MS, 8000),
  OTP_TTL_MS: num(process.env.OTP_TTL_MS, 300000),

  // Delivery mechanics
  DUPLICATE_GAP_MS: num(process.env.DUPLICATE_GAP_MS, 3000),
  MAX_CALLBACK_ATTEMPTS: num(process.env.MAX_CALLBACK_ATTEMPTS, 8),
  CALLBACK_TIMEOUT_MS: num(process.env.CALLBACK_TIMEOUT_MS, 5000),
  TIMEOUT_HANG_MS: num(process.env.TIMEOUT_HANG_MS, 30000),

  // Signature
  GATEWAY_SECRET: process.env.GATEWAY_SECRET || 'z2p-2026-secret',
};

// ---------------------------------------------------------------------------
// In-memory state. Restarting the container wipes everything, by design.
// ---------------------------------------------------------------------------

const payments = new Map();     // payment_id -> payment
const idempotency = new Map();  // Idempotency-Key -> response body
const otps = new Map();         // ref -> otp record
const deliveries = [];          // callback attempt log (most recent last)

const MAX_LOG = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const newId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = (min, max) => Math.floor(min + Math.random() * Math.max(0, max - min));
const chance = (rate) => Math.random() < rate;

const sign = (raw) =>
  crypto.createHmac('sha256', CFG.GATEWAY_SECRET).update(raw).digest('hex');

const now = () => new Date().toISOString();

function log(...args) {
  console.log(`[${now()}]`, ...args);
}

function record(entry) {
  deliveries.push({ at: now(), ...entry });
  if (deliveries.length > MAX_LOG) deliveries.shift();
}

/**
 * Common cause of "the gateway never called me back": the team passes
 * http://localhost:3000, which from inside this container means this
 * container. Warn loudly rather than failing silently.
 */
function warnIfUnreachable(callbackUrl) {
  try {
    const host = new URL(callbackUrl).hostname;
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) {
      log(
        `WARNING  callback_url points at "${host}". From inside this container that is the ` +
        `gateway itself, not your app. Use your compose service name, for example ` +
        `http://api:3000/webhooks/payment`
      );
    }
  } catch (_) {
    /* validated elsewhere */
  }
}

// ---------------------------------------------------------------------------
// Callback delivery (at-least-once, with retries)
// ---------------------------------------------------------------------------

async function deliverOnce(url, body) {
  const raw = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CFG.CALLBACK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': sign(raw),
        'X-Gateway-Event': body.event_id,
      },
      body: raw,
      signal: controller.signal,
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver with bounded retries and exponential backoff.
 *
 * A real gateway retries more or less forever when it does not get a 2xx.
 * We cap it so a misbehaving submission cannot be hammered all day, but the
 * lesson is identical: return 200 from your webhook handler, even for a
 * duplicate, or you will be retried.
 */
async function deliver(url, body, { label = 'callback' } = {}) {
  for (let attempt = 1; attempt <= CFG.MAX_CALLBACK_ATTEMPTS; attempt++) {
    const result = await deliverOnce(url, body);
    record({
      type: label,
      event_id: body.event_id,
      payment_id: body.payment_id,
      booking_ref: body.booking_ref,
      status: body.status,
      attempt,
      url,
      http_status: result.status,
      ok: result.ok,
      error: result.error,
    });

    if (result.ok) {
      log(`OK       ${label} ${body.status} ${body.booking_ref} event=${body.event_id} attempt=${attempt}`);
      return true;
    }

    log(
      `RETRY    ${label} ${body.booking_ref} event=${body.event_id} attempt=${attempt} ` +
      `http=${result.status}${result.error ? ' err=' + result.error : ''}`
    );

    if (attempt < CFG.MAX_CALLBACK_ATTEMPTS) {
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 30000));
    }
  }
  log(`GIVEUP   ${label} ${body.booking_ref} event=${body.event_id} after ${CFG.MAX_CALLBACK_ATTEMPTS} attempts`);
  return false;
}

function buildEvent(payment, status, eventId) {
  return {
    event_id: eventId || newId('evt'),
    payment_id: payment.payment_id,
    booking_ref: payment.booking_ref,
    status,
    amount: payment.amount,
    currency: payment.currency,
    timestamp: now(),
  };
}

/**
 * Schedule the outcome of a charge: wait, then call back, then possibly
 * call back a second time with the identical event_id.
 */
async function scheduleOutcome(payment, { delayMs, status, duplicate }) {
  await sleep(delayMs);

  payment.status = status;
  payment.settled_at = now();

  const event = buildEvent(payment, status);
  payment.events.push(event.event_id);

  await deliver(payment.callback_url, event, { label: 'payment' });

  if (duplicate) {
    await sleep(CFG.DUPLICATE_GAP_MS);
    log(`DUPE     resending event=${event.event_id} for ${payment.booking_ref}`);
    await deliver(payment.callback_url, event, { label: 'payment-duplicate' });
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '256kb' }));

app.use((req, _res, next) => {
  if (!req.path.startsWith('/debug') && req.path !== '/health') {
    log(`${req.method} ${req.path}`);
  }
  next();
});

const mode = (req) => (req.get('X-Mock-Mode') || '').toLowerCase();
const forced = (req) => (req.get('X-Mock-Force') || '').toLowerCase();

// --- Health ----------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-gateway',
    version: 'z2p-2026',
    uptime_s: Math.round(process.uptime()),
    payments_seen: payments.size,
  });
});

// --- Charge ----------------------------------------------------------------

app.post('/charge', async (req, res) => {
  const { amount, currency = 'BDT', booking_ref, callback_url } = req.body || {};
  const m = mode(req);
  const force = forced(req);
  const deterministic = m === 'deterministic';

  // Validation
  const problems = [];
  if (typeof amount !== 'number' || !(amount > 0)) problems.push('amount must be a positive number');
  if (!booking_ref || typeof booking_ref !== 'string') problems.push('booking_ref is required');
  if (!callback_url || typeof callback_url !== 'string') problems.push('callback_url is required');
  else {
    try {
      new URL(callback_url);
    } catch {
      problems.push('callback_url must be an absolute URL');
    }
  }
  if (problems.length) {
    return res.status(400).json({ error: 'INVALID_REQUEST', details: problems });
  }

  warnIfUnreachable(callback_url);

  // Idempotency-Key support. Real gateways honour this. Teams that send one
  // are protected from double charging on retry. Teams that do not, are not.
  const key = req.get('Idempotency-Key');
  if (key && idempotency.has(key)) {
    log(`IDEMP    replaying stored response for key=${key}`);
    return res.status(202).json(idempotency.get(key));
  }

  // Forced timeout: hang, then drop the connection.
  if (force === 'timeout') {
    log(`FORCE    timeout on ${booking_ref}, hanging ${CFG.TIMEOUT_HANG_MS}ms`);
    await sleep(CFG.TIMEOUT_HANG_MS);
    return req.socket.destroy();
  }

  // Random transport error on the charge call itself.
  if (!deterministic && !force && chance(CFG.CHARGE_ERROR_RATE)) {
    log(`CHAOS    500 on /charge for ${booking_ref}`);
    return res.status(500).json({ error: 'GATEWAY_ERROR', message: 'Upstream processor unavailable' });
  }

  const payment = {
    payment_id: newId('pay'),
    booking_ref,
    amount,
    currency,
    callback_url,
    status: 'PENDING',
    created_at: now(),
    settled_at: null,
    events: [],
    mode: deterministic ? 'deterministic' : force ? `force:${force}` : 'random',
  };
  payments.set(payment.payment_id, payment);

  // Decide the outcome
  let status = 'SUCCEEDED';
  let duplicate = false;
  let delayMs = between(CFG.MIN_DELAY_MS, CFG.MAX_DELAY_MS);

  if (deterministic) {
    delayMs = 2000;
  } else if (force === 'fail') {
    status = 'FAILED';
  } else if (force === 'duplicate') {
    duplicate = true;
  } else if (force === 'success' || force === 'race') {
    // status stays SUCCEEDED
  } else {
    if (chance(CFG.FAILURE_RATE)) status = 'FAILED';
    if (chance(CFG.DUPLICATE_RATE)) duplicate = true;
  }

  const body = { payment_id: payment.payment_id, status: 'PENDING' };
  if (key) idempotency.set(key, body);

  const raceRequested = force === 'race' || (!deterministic && !force && chance(CFG.RACE_RATE));

  if (raceRequested) {
    // The callback lands before this handler responds. Your /pay endpoint has
    // not written the payment_id anywhere yet. Good luck.
    log(`FORCE    race on ${booking_ref}, callback fires before response`);
    payment.status = status;
    payment.settled_at = now();
    const event = buildEvent(payment, status);
    payment.events.push(event.event_id);
    await deliverOnce(payment.callback_url, event);
    record({
      type: 'payment-race', event_id: event.event_id, payment_id: payment.payment_id,
      booking_ref, status, attempt: 1, url: payment.callback_url, ok: true,
    });
    return res.status(202).json(body);
  }

  res.status(202).json(body);
  scheduleOutcome(payment, { delayMs, status, duplicate }).catch((e) =>
    log('ERROR    scheduleOutcome', e.message)
  );
});

// --- Refund ----------------------------------------------------------------

app.post('/refund', async (req, res) => {
  const { payment_id } = req.body || {};
  if (!payment_id) return res.status(400).json({ error: 'INVALID_REQUEST', details: ['payment_id is required'] });

  const payment = payments.get(payment_id);
  if (!payment) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' });
  if (payment.status !== 'SUCCEEDED') {
    return res.status(409).json({ error: 'NOT_REFUNDABLE', current_status: payment.status });
  }

  const deterministic = mode(req) === 'deterministic';
  const delayMs = deterministic ? 1500 : between(CFG.MIN_DELAY_MS, CFG.MAX_DELAY_MS);

  res.status(202).json({ payment_id, status: 'PENDING' });

  (async () => {
    await sleep(delayMs);
    payment.status = 'REFUNDED';
    payment.refunded_at = now();
    const event = buildEvent(payment, 'REFUNDED');
    payment.events.push(event.event_id);
    await deliver(payment.callback_url, event, { label: 'refund' });
  })().catch((e) => log('ERROR    refund', e.message));
});

// --- OTP -------------------------------------------------------------------

app.post('/otp/send', async (req, res) => {
  const { phone, ref, callback_url } = req.body || {};
  if (!ref) return res.status(400).json({ error: 'INVALID_REQUEST', details: ['ref is required'] });

  const deterministic = mode(req) === 'deterministic';
  const force = forced(req);

  const code = deterministic ? '123456' : String(between(100000, 999999));
  const lost = force === 'fail' ? true : force ? false : !deterministic && chance(CFG.OTP_FAILURE_RATE);

  otps.set(ref, {
    ref, phone, code,
    delivered: false,
    lost,
    attempts: 0,
    created_at: now(),
    expires_at: new Date(Date.now() + CFG.OTP_TTL_MS).toISOString(),
  });

  res.status(202).json({ ref, status: 'PENDING' });

  (async () => {
    const delayMs = deterministic ? 800 : between(CFG.OTP_MIN_DELAY_MS, CFG.OTP_MAX_DELAY_MS);
    await sleep(delayMs);
    const rec = otps.get(ref);
    if (!rec) return;

    if (rec.lost) {
      log(`CHAOS    OTP for ref=${ref} never delivered`);
      record({ type: 'otp', ref, ok: false, error: 'never_delivered' });
      return;
    }

    rec.delivered = true;
    log(`OTP      ref=${ref} code=${rec.code} delivered`);

    if (callback_url) {
      const body = { event_id: newId('evt'), ref, code: rec.code, type: 'OTP', timestamp: now() };
      await deliver(callback_url, body, { label: 'otp' });
    }
  })().catch((e) => log('ERROR    otp/send', e.message));
});

app.post('/otp/verify', (req, res) => {
  const { ref, code } = req.body || {};
  if (!ref || !code) {
    return res.status(400).json({ error: 'INVALID_REQUEST', details: ['ref and code are required'] });
  }
  const rec = otps.get(ref);
  if (!rec) return res.status(404).json({ error: 'OTP_NOT_FOUND' });

  rec.attempts += 1;
  if (new Date(rec.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ verified: false, error: 'OTP_EXPIRED' });
  }
  if (rec.attempts > 5) {
    return res.status(429).json({ verified: false, error: 'TOO_MANY_ATTEMPTS' });
  }
  if (String(code) !== rec.code) {
    return res.status(400).json({ verified: false, error: 'OTP_INVALID' });
  }
  rec.verified = true;
  return res.json({ verified: true, ref });
});

// --- Debug -----------------------------------------------------------------
// Not part of a real gateway. Provided so you can see what we did to you.

app.get('/debug/payments', (_req, res) => {
  res.json({ count: payments.size, payments: [...payments.values()].slice(-100) });
});

app.get('/debug/payments/:id', (req, res) => {
  const p = payments.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' });
  res.json(p);
});

app.get('/debug/deliveries', (req, res) => {
  const ref = req.query.booking_ref;
  const rows = ref ? deliveries.filter((d) => d.booking_ref === ref) : deliveries;
  res.json({ count: rows.length, deliveries: rows.slice(-100) });
});

app.get('/debug/otp/:ref', (req, res) => {
  const rec = otps.get(req.params.ref);
  if (!rec) return res.status(404).json({ error: 'OTP_NOT_FOUND' });
  res.json(rec);
});

app.get('/debug/config', (_req, res) => {
  res.json({ ...CFG, GATEWAY_SECRET: '***' });
});

app.post('/debug/reset', (_req, res) => {
  payments.clear();
  idempotency.clear();
  otps.clear();
  deliveries.length = 0;
  log('RESET    all state cleared');
  res.json({ reset: true });
});

// --- Fallthrough -----------------------------------------------------------

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', path: req.path }));

app.use((err, _req, res, _next) => {
  log('ERROR   ', err.message);
  res.status(500).json({ error: 'INTERNAL', message: err.message });
});

// ---------------------------------------------------------------------------

const server = app.listen(CFG.PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  CinemaSeat Mock Gateway  (Zero to Production, Phase 2)');
  console.log('  ---------------------------------------------------------');
  console.log(`  listening            :${CFG.PORT}`);
  console.log(`  callback delay       ${CFG.MIN_DELAY_MS}ms to ${CFG.MAX_DELAY_MS}ms`);
  console.log(`  failure rate         ${(CFG.FAILURE_RATE * 100).toFixed(0)}%`);
  console.log(`  duplicate rate       ${(CFG.DUPLICATE_RATE * 100).toFixed(0)}%`);
  console.log(`  charge error rate    ${(CFG.CHARGE_ERROR_RATE * 100).toFixed(0)}%`);
  console.log(`  otp failure rate     ${(CFG.OTP_FAILURE_RATE * 100).toFixed(0)}%`);
  console.log(`  max callback tries   ${CFG.MAX_CALLBACK_ATTEMPTS}`);
  console.log('');
  console.log('  Your callback_url must be reachable FROM THIS CONTAINER.');
  console.log('  Use your compose service name, not localhost.');
  console.log('');
});

const shutdown = () => { log('shutting down'); server.close(() => process.exit(0)); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
