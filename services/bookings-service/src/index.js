const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SEATS_SERVICE_URL = process.env.SEATS_SERVICE_URL || 'http://seats-service:3000';
const OTP_SERVICE_URL = process.env.OTP_SERVICE_URL || 'http://otp-service:3000';
const PAYMENTS_SERVICE_URL = process.env.PAYMENTS_SERVICE_URL || 'http://payments-service:3000';
const OTP_INTERNAL_SECRET = process.env.OTP_INTERNAL_SECRET || 'cinemaseat-internal-otp';

app.get('/bookings/active-hold', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const result = await pool.query(`
      SELECT b.booking_ref, b.show_id, b.seat_id, b.amount,
             ss.held_until, sh.movie_id,
             s.row_label, s.seat_number
      FROM bookings b
      JOIN seat_status ss ON ss.show_id = b.show_id AND ss.seat_id = b.seat_id
      JOIN shows sh ON sh.id = b.show_id
      JOIN seats s ON s.id = b.seat_id
      WHERE b.user_id = $1
        AND b.status IN ('HELD', 'PENDING_PAYMENT')
        AND ss.status = 'HELD' AND ss.held_by = $1 AND ss.held_until > now()
      ORDER BY b.created_at DESC
      LIMIT 1
    `, [userId]);

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Failed to fetch active hold:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/bookings/hold', async (req, res) => {
  const { showId, seatId, userId, phone } = req.body;
  if (!showId || !seatId || !userId || !phone) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  
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

    // 2. Create the booking, or return the existing booking when the same
    // seat-click request is retried (for example after a network timeout).
    let bookingRef;
    let bookingCreated = false;
    const amount = seatsData.amount;
    const existingBooking = await pool.query(`
      SELECT booking_ref
      FROM bookings
      WHERE show_id = $1 AND seat_id = $2 AND user_id = $3
        AND status IN ('HELD', 'PENDING_PAYMENT')
      ORDER BY created_at DESC
      LIMIT 1
    `, [showId, seatId, userId]);

    if (existingBooking.rows.length > 0) {
      bookingRef = existingBooking.rows[0].booking_ref;
    } else {
      bookingRef = `bk_${uuidv4().replace(/-/g, '')}`;
      const insertResult = await pool.query(`
        INSERT INTO bookings (booking_ref, show_id, seat_id, user_id, status, amount)
        VALUES ($1, $2, $3, $4, 'HELD', $5)
        ON CONFLICT (show_id, seat_id)
          WHERE status IN ('HELD', 'PENDING_PAYMENT', 'CONFIRMED')
        DO NOTHING
        RETURNING booking_ref
      `, [bookingRef, showId, seatId, userId, amount]);
      if (insertResult.rows.length === 0) {
        const concurrentBooking = await pool.query(`
          SELECT booking_ref FROM bookings
          WHERE show_id = $1 AND seat_id = $2 AND user_id = $3
            AND status IN ('HELD', 'PENDING_PAYMENT')
          ORDER BY created_at DESC LIMIT 1
        `, [showId, seatId, userId]);
        if (concurrentBooking.rows.length === 0) {
          return res.status(409).json({ error: 'Seat not available' });
        }
        bookingRef = concurrentBooking.rows[0].booking_ref;
      } else {
        bookingCreated = true;
      }
    }

    // 3. Confirm the payment OTP was accepted by the SMS provider before the
    // client is told to display the OTP form.
    if (bookingCreated) {
      const otpResponse = await fetch(`${OTP_SERVICE_URL}/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': OTP_INTERNAL_SECRET },
        body: JSON.stringify({ phone, ref: bookingRef, purpose: 'PAYMENT' })
      });
      if (!otpResponse.ok) {
        const otpData = await otpResponse.json().catch(() => ({}));
        return res.json({
          success: true,
          bookingRef,
          heldUntil: seatsData.heldUntil,
          amount,
          otpSent: false,
          warning: otpData.error || 'OTP is delayed; use resend while the seat hold is active'
        });
      }
    }

    res.json({ success: true, bookingRef, heldUntil: seatsData.heldUntil, amount, otpSent: true });
  } catch (err) {
    console.error('Bookings service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/bookings/:bookingRef/resend-otp', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const result = await pool.query(`
      SELECT b.booking_ref, u.phone
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      JOIN seat_status ss ON ss.show_id = b.show_id AND ss.seat_id = b.seat_id
      WHERE b.booking_ref = $1 AND b.user_id = $2
        AND b.status = 'HELD'
        AND ss.status = 'HELD' AND ss.held_by = b.user_id AND ss.held_until > now()
    `, [req.params.bookingRef, userId]);
    if (result.rows.length === 0) {
      return res.status(410).json({ error: 'Booking hold is missing or expired' });
    }

    const booking = result.rows[0];
    const otpResponse = await fetch(`${OTP_SERVICE_URL}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': OTP_INTERNAL_SECRET },
      body: JSON.stringify({ phone: booking.phone, ref: booking.booking_ref, purpose: 'PAYMENT' })
    });
    const otpData = await otpResponse.json().catch(() => ({}));
    return res.status(otpResponse.status).json(otpResponse.ok
      ? { success: true, message: 'A new payment OTP was requested' }
      : { error: otpData.error || 'Could not resend OTP', retryAfter: otpData.retryAfter });
  } catch (err) {
    console.error('Payment OTP resend error:', err);
    res.status(503).json({ error: 'OTP gateway is temporarily unavailable' });
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

// Get user tickets
app.get('/bookings/my-tickets', async (req, res) => {
  const { userId } = req.query; // In a real app, this should come from a verified JWT token middleware
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const result = await pool.query(`
      SELECT b.id, b.booking_ref, b.status, b.amount, b.created_at,
             sh.start_time, m.title as movie_title, m.poster_url,
             s.row_label, s.seat_number, s.tier,
             t.name as theatre_name, sc.name as screen_name
      FROM bookings b
      JOIN shows sh ON b.show_id = sh.id
      JOIN movies m ON sh.movie_id = m.id
      JOIN seats s ON b.seat_id = s.id
      JOIN screens sc ON s.screen_id = sc.id
      JOIN theatres t ON sc.theatre_id = t.id
      WHERE b.user_id = $1 AND b.status = 'CONFIRMED'
      ORDER BY b.created_at DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch tickets:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bookings service listening on port ${PORT}`);
});
