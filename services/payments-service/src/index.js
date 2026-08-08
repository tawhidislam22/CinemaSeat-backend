const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:9000';
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://gateway:80/webhooks/payment';
const BOOKINGS_SERVICE_URL = process.env.BOOKINGS_SERVICE_URL || 'http://bookings-service:3000';

app.post('/payments/charge', async (req, res) => {
  const { bookingRef } = req.body;
  if (!bookingRef) return res.status(400).json({ error: 'Missing bookingRef' });

  const client = await pool.connect();
  try {
    const bookingRes = await client.query('SELECT * FROM bookings WHERE booking_ref = $1', [bookingRef]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];

    if (booking.status !== 'HELD') return res.status(400).json({ error: 'Booking is not in HELD state' });

    await client.query('BEGIN');
    await client.query(`UPDATE bookings SET status = 'PENDING_PAYMENT' WHERE id = $1`, [booking.id]);
    
    const idempotencyKey = `idemp_${uuidv4()}`;
    const paymentRes = await client.query(`
      INSERT INTO payments (booking_id, idempotency_key, amount)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, [booking.id, idempotencyKey, booking.amount]);
    await client.query('COMMIT');

    const gatewayRes = await fetch(`${GATEWAY_URL}/payments/charge`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        amount: booking.amount,
        currency: 'BDT',
        booking_ref: bookingRef,
        callback_url: CALLBACK_URL
      })
    });

    if (gatewayRes.ok) {
      const data = await gatewayRes.json();
      await pool.query(`UPDATE payments SET gateway_payment_id = $1 WHERE id = $2`, [data.payment_id, paymentRes.rows[0].id]);
      res.status(202).json({ success: true, message: 'Payment initiated' });
    } else {
      res.status(500).json({ error: 'Gateway charge failed' });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Webhook for gateway
app.post('/webhooks/payment', async (req, res) => {
  const { event_id, payment_id, booking_ref, status, amount } = req.body;
  if (!event_id || !booking_ref || !status) {
    return res.status(400).json({ error: 'Missing webhook payload fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Idempotency guard
    try {
      await client.query(`INSERT INTO processed_events (event_id, payment_id) VALUES ($1, $2)`, [event_id, payment_id]);
    } catch (err) {
      if (err.constraint === 'processed_events_pkey') {
        await client.query('ROLLBACK');
        return res.status(200).json({ message: 'Duplicate callback ignored' });
      }
      throw err;
    }

    // Update payment
    const paymentRes = await client.query(`
      UPDATE payments SET status = $1, gateway_payment_id = $2 
      WHERE booking_id = (SELECT id FROM bookings WHERE booking_ref = $3)
    `, [status, payment_id, booking_ref]);

    await client.query('COMMIT');

    // Notify bookings service to coordinate DB updates and seats-service releases
    const internalStatus = status === 'SUCCEEDED' ? 'CONFIRMED' : 'CANCELLED';
    await fetch(`${BOOKINGS_SERVICE_URL}/internal/bookings/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_ref, status: internalStatus })
    });

    res.status(200).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Payments service listening on port ${PORT}`);
});
