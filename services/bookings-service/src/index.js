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

const SEATS_SERVICE_URL = process.env.SEATS_SERVICE_URL || 'http://seats-service:3000';
const OTP_SERVICE_URL = process.env.OTP_SERVICE_URL || 'http://otp-service:3000';
const PAYMENTS_SERVICE_URL = process.env.PAYMENTS_SERVICE_URL || 'http://payments-service:3000';

app.post('/bookings/hold', async (req, res) => {
  const { showId, seatId, userId, phone } = req.body;
  
  try {
    // 1. Call Seats Service to lock the seat atomically
    const seatsRes = await fetch(`${SEATS_SERVICE_URL}/seats/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId, seatId, userId })
    });

    const seatsData = await seatsRes.json();
    if (!seatsRes.ok) {
      return res.status(seatsRes.status).json(seatsData); // Proxy 409 error
    }

    // 2. Create Booking in DB
    const bookingRef = `bk_${uuidv4().replace(/-/g, '')}`;
    const amount = seatsData.amount;
    
    const bookingResult = await pool.query(`
      INSERT INTO bookings (booking_ref, show_id, seat_id, user_id, status, amount)
      VALUES ($1, $2, $3, $4, 'HELD', $5)
      RETURNING id, booking_ref;
    `, [bookingRef, showId, seatId, userId, amount]);

    // 3. Trigger OTP (async, don't wait for success to return 200)
    fetch(`${OTP_SERVICE_URL}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, ref: bookingRef })
    }).catch(err => console.error('Failed to trigger OTP:', err));

    res.json({ success: true, bookingRef, heldUntil: seatsData.heldUntil, amount });
  } catch (err) {
    console.error('Bookings service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Used by payments-service webhook to update booking status and seat
app.post('/internal/bookings/status', async (req, res) => {
  const { booking_ref, status } = req.body; // status = CONFIRMED or CANCELLED

  try {
    const bookingRes = await pool.query('SELECT * FROM bookings WHERE booking_ref = $1', [booking_ref]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];

    await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', [status, booking.id]);

    if (status === 'CONFIRMED') {
      await fetch(`${SEATS_SERVICE_URL}/seats/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId: booking.show_id, seatId: booking.seat_id })
      });
    } else if (status === 'CANCELLED' || status === 'EXPIRED') {
      await fetch(`${SEATS_SERVICE_URL}/seats/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId: booking.show_id, seatId: booking.seat_id })
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Internal update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bookings service listening on port ${PORT}`);
});
