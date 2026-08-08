const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../../.env') }); // load root .env

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://mock-gateway:9000';
const OTP_INTERNAL_SECRET = process.env.OTP_INTERNAL_SECRET || 'cinemaseat-internal-otp';
const MOCK_GATEWAY_MODE = process.env.MOCK_GATEWAY_MODE || '';

const purposeForRef = (ref) => String(ref).startsWith('login_') ? 'LOGIN' : 'PAYMENT';

function requireInternal(req, res, next) {
  if (req.get('X-Internal-Secret') !== OTP_INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized OTP request' });
  }
  next();
}

function gatewayHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (MOCK_GATEWAY_MODE) headers['X-Mock-Mode'] = MOCK_GATEWAY_MODE;
  return headers;
}

app.post('/otp/send', requireInternal, async (req, res) => {
  const { phone, ref, purpose } = req.body;
  if (!phone || !ref) return res.status(400).json({ error: 'Missing parameters' });

  const expectedPurpose = purposeForRef(ref);
  if (purpose && purpose !== expectedPurpose) {
    return res.status(400).json({ error: 'OTP purpose does not match its reference' });
  }

  try {
    const recentSend = await pool.query(`
      SELECT CEIL(30 - EXTRACT(EPOCH FROM (now() - sent_at)))::int AS retry_after
      FROM otp_verifications
      WHERE ref = $1 AND sent_at > now() - interval '30 seconds'
    `, [ref]);
    if (recentSend.rows.length > 0) {
      return res.status(429).json({
        error: 'Please wait before requesting another OTP',
        retryAfter: Math.max(1, recentSend.rows[0].retry_after)
      });
    }

    const gatewayResponse = await fetch(`${GATEWAY_URL}/otp/send`, {
      method: 'POST',
      headers: gatewayHeaders(),
      body: JSON.stringify({ phone, ref })
    });
    const gatewayData = await gatewayResponse.json().catch(() => ({}));
    if (!gatewayResponse.ok) {
      return res.status(502).json({ error: gatewayData.error || 'Provided gateway failed to accept OTP' });
    }

    await pool.query(`
      INSERT INTO otp_verifications (ref, phone, status, attempts, sent_at, verified_at)
      VALUES ($1, $2, 'SENT', 0, now(), NULL)
      ON CONFLICT (ref) DO UPDATE
      SET phone = EXCLUDED.phone, status = 'SENT', attempts = 0,
          sent_at = now(), verified_at = NULL
    `, [ref, phone]);

    // A 202 means accepted, not delivered. The supplied gateway intentionally
    // loses some OTPs, so callers must support resend while their hold is valid.
    res.status(202).json({ success: true, purpose: expectedPurpose });
  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(503).json({ error: 'OTP gateway is temporarily unavailable' });
  }
});

app.post('/otp/verify', requireInternal, async (req, res) => {
  const { ref, code, purpose } = req.body;
  if (!ref || !code) return res.status(400).json({ error: 'Missing parameters' });

  const expectedPurpose = purposeForRef(ref);
  if (purpose && purpose !== expectedPurpose) {
    return res.status(400).json({ error: 'OTP purpose does not match its reference' });
  }

  try {
    const recordResult = await pool.query(
      'SELECT phone, status, attempts FROM otp_verifications WHERE ref = $1',
      [ref]
    );
    if (recordResult.rows.length === 0) return res.status(404).json({ error: 'OTP challenge not found' });

    const record = recordResult.rows[0];
    if (record.status === 'VERIFIED') return res.status(409).json({ error: 'OTP challenge already used' });
    if (record.attempts >= 5) return res.status(429).json({ error: 'Too many OTP attempts' });

    const gatewayResponse = await fetch(`${GATEWAY_URL}/otp/verify`, {
      method: 'POST',
      headers: gatewayHeaders(),
      body: JSON.stringify({ ref, code: String(code) })
    });

    if (!gatewayResponse.ok) {
      await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE ref = $1', [ref]);
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const updateResult = await pool.query(`
      UPDATE otp_verifications
      SET status = 'VERIFIED', verified_at = now()
      WHERE ref = $1 AND status = 'SENT'
      RETURNING phone
    `, [ref]);
    if (updateResult.rows.length === 0) return res.status(409).json({ error: 'OTP challenge already used' });

    res.json({ success: true, phone: updateResult.rows[0].phone, purpose: expectedPurpose });
  } catch (err) {
    console.error('OTP verify error:', err.message);
    res.status(503).json({ error: 'OTP gateway is temporarily unavailable' });
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OTP service listening on port ${PORT} (provided gateway)`));
