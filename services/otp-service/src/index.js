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

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:9000';

app.post('/otp/send', async (req, res) => {
  const { phone, ref } = req.body;
  if (!phone || !ref) return res.status(400).json({ error: 'Missing parameters' });

  try {
    // Record intent
    await pool.query(`
      INSERT INTO otp_verifications (ref, phone)
      VALUES ($1, $2)
      ON CONFLICT (ref) DO NOTHING;
    `, [ref, phone]);

    // Send to gateway
    const gwRes = await fetch(`${GATEWAY_URL}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, ref })
    });

    if (gwRes.status === 202) {
      res.status(202).json({ success: true });
    } else {
      res.status(500).json({ error: 'Gateway failed to send OTP' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/otp/verify', async (req, res) => {
  const { ref, code } = req.body;
  
  try {
    const gatewayRes = await fetch(`${GATEWAY_URL}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, code })
    });

    if (gatewayRes.ok) {
      await pool.query(`UPDATE otp_verifications SET status = 'VERIFIED', verified_at = now() WHERE ref = $1`, [ref]);
      res.json({ success: true });
    } else {
      await pool.query(`UPDATE otp_verifications SET attempts = attempts + 1 WHERE ref = $1`, [ref]);
      res.status(400).json({ success: false, error: 'Invalid OTP' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OTP service listening on port ${PORT}`);
});
