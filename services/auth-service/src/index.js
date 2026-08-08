const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_here';
const OTP_SERVICE_URL = process.env.OTP_SERVICE_URL || 'http://otp-service:3000';
const OTP_INTERNAL_SECRET = process.env.OTP_INTERNAL_SECRET || 'cinemaseat-internal-otp';

const issueLogin = (user) => ({
  token: jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' }),
  user: { id: user.id, name: user.name, phone: user.phone }
});

// Register
app.post('/auth/register', async (req, res) => {
  const { phone, name, password } = req.body;
  if (!phone || !name || !password) return res.status(400).json({ error: 'Missing fields' });
  if (phone.length > 20) return res.status(400).json({ error: 'Phone number cannot exceed 20 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (phone, name, password_hash) VALUES ($1, $2, $3) RETURNING id, phone, name',
      [phone, name, hash]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Phone already registered' });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid phone or password' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid phone or password' });

    const challengeRef = `login_${crypto.randomBytes(16).toString('hex')}`;
    const otpResponse = await fetch(`${OTP_SERVICE_URL}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': OTP_INTERNAL_SECRET || '' },
      body: JSON.stringify({ phone: user.phone, ref: challengeRef, purpose: 'LOGIN' })
    });
    const otpData = await otpResponse.json();
    if (!otpResponse.ok) {
      return res.status(502).json({ error: otpData.error || 'Could not send login OTP' });
    }

    const visibleDigits = user.phone.slice(-3);
    res.status(202).json({
      success: true,
      requiresOtp: true,
      challengeRef,
      phoneMasked: `*******${visibleDigits}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/auth/login/verify-otp', async (req, res) => {
  const { challengeRef, code } = req.body;
  if (!challengeRef || !String(challengeRef).startsWith('login_') || !code) {
    return res.status(400).json({ error: 'Invalid login OTP challenge' });
  }

  try {
    const otpResponse = await fetch(`${OTP_SERVICE_URL}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': OTP_INTERNAL_SECRET || '' },
      body: JSON.stringify({ ref: challengeRef, code, purpose: 'LOGIN' })
    });
    const otpData = await otpResponse.json();
    if (!otpResponse.ok || otpData.purpose !== 'LOGIN') {
      return res.status(400).json({ error: otpData.error || 'Invalid login OTP' });
    }

    const result = await pool.query('SELECT id, phone, name FROM users WHERE phone = $1', [otpData.phone]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, ...issueLogin(result.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Auth Middleware
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Me
app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, phone, name, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth service listening on port ${PORT}`);
});
