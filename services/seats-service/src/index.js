const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../../.env') }); // load root .env

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
});

// Idle PostgreSQL connections can be closed by the network or a managed
// database pooler. pg removes that client automatically; handling the event
// prevents an otherwise unhandled pool error from terminating this process.
pool.on('error', (err) => {
  console.error('Unexpected idle database connection error:', err.message);
});

const HOLD_TTL_SECONDS = parseInt(process.env.HOLD_TTL_SECONDS || '120', 10);

app.get('/', (req, res) => {
  res.send('CinemaSeat Seats Service API is running.');
});

app.get('/seats/:showId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id as seat_id, s.row_label, s.seat_number, s.tier, s.price_multiplier,
             ss.status, ss.held_by, ss.held_until
      FROM seat_status ss
      JOIN seats s ON ss.seat_id = s.id
      WHERE ss.show_id = $1
      ORDER BY s.row_label, s.seat_number
    `, [req.params.showId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/seats/hold', async (req, res) => {
  const { showId, seatId, userId } = req.body;
  if (!showId || !seatId || !userId) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Serialize hold attempts for this user. This prevents two tabs (or two
    // simultaneous requests) from holding different seats for the same user.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    const expiredResult = await client.query(`
      UPDATE seat_status
      SET status = 'AVAILABLE', held_by = NULL, held_until = NULL,
          version = version + 1
      WHERE status = 'HELD' AND held_until <= now()
      RETURNING seat_id, show_id
    `);
    for (const expired of expiredResult.rows) {
      await client.query(`
        UPDATE bookings SET status = 'EXPIRED'
        WHERE seat_id = $1 AND show_id = $2
          AND status IN ('HELD', 'PENDING_PAYMENT')
      `, [expired.seat_id, expired.show_id]);
    }

    const activeHold = await client.query(`
      SELECT seat_id, show_id, held_until
      FROM seat_status
      WHERE held_by = $1 AND status = 'HELD' AND held_until > now()
      LIMIT 1
      FOR UPDATE
    `, [userId]);

    if (activeHold.rows.length > 0) {
      const hold = activeHold.rows[0];
      if (String(hold.seat_id) !== String(seatId) || String(hold.show_id) !== String(showId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'You already have a seat on hold. Complete that booking or wait for the timer to expire.',
          code: 'USER_ALREADY_HAS_HOLD',
          seatId: hold.seat_id,
          showId: hold.show_id,
          heldUntil: hold.held_until
        });
      }
    }

    let heldUntil = activeHold.rows[0]?.held_until;
    let alreadyHeld = activeHold.rows.length > 0;
    if (!alreadyHeld) {
      const updateResult = await client.query(`
      UPDATE seat_status
      SET status = 'HELD', held_by = $1, held_until = now() + ($2 || ' seconds')::interval,
          version = version + 1
      WHERE seat_id = $3 AND show_id = $4 AND status = 'AVAILABLE'
      RETURNING seat_id, held_until;
    `, [userId, HOLD_TTL_SECONDS, seatId, showId]);

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Seat not available', code: 'SEAT_NOT_AVAILABLE' });
      }
      heldUntil = updateResult.rows[0].held_until;
    }
    
    // Also need to get seat price info for the orchestrator
    const showInfo = await client.query('SELECT base_price FROM shows WHERE id = $1', [showId]);
    const seatInfo = await client.query('SELECT price_multiplier FROM seats WHERE id = $1', [seatId]);
    if (showInfo.rows.length === 0 || seatInfo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Show or seat not found' });
    }
    const amount = parseFloat(showInfo.rows[0].base_price) * parseFloat(seatInfo.rows[0].price_multiplier);

    await client.query('COMMIT');
    res.json({ success: true, heldUntil, amount, alreadyHeld });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client?.release();
  }
});

app.post('/seats/release', async (req, res) => {
  const { showId, seatId } = req.body;
  try {
    await pool.query(`
      UPDATE seat_status 
      SET status = 'AVAILABLE', held_by = NULL, held_until = NULL 
      WHERE seat_id = $1 AND show_id = $2 AND status = 'HELD'
    `, [seatId, showId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/seats/confirm', async (req, res) => {
  const { showId, seatId } = req.body;
  try {
    await pool.query(`
      UPDATE seat_status 
      SET status = 'BOOKED' 
      WHERE seat_id = $1 AND show_id = $2
    `, [seatId, showId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Run one sweep at a time. setTimeout is scheduled only after the previous
// sweep finishes, so a slow/reconnecting database cannot create overlapping
// cleanup jobs.
const SWEEP_INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_MS || '10000', 10);

async function sweepExpiredHolds() {
  try {
    const result = await pool.query(`
      WITH expired_holds AS (
        UPDATE seat_status
        SET status = 'AVAILABLE', held_by = NULL, held_until = NULL,
            version = version + 1
        WHERE status = 'HELD' AND held_until <= now()
        RETURNING seat_id, show_id
      ), expired_bookings AS (
        UPDATE bookings b
        SET status = 'EXPIRED'
        FROM expired_holds h
        WHERE b.seat_id = h.seat_id
          AND b.show_id = h.show_id
          AND b.status IN ('HELD', 'PENDING_PAYMENT')
        RETURNING b.id
      )
      SELECT
        (SELECT count(*)::int FROM expired_holds) AS expired_holds,
        (SELECT count(*)::int FROM expired_bookings) AS expired_bookings
    `);

    const counts = result.rows[0];
    if (counts.expired_holds > 0) {
      console.log(`Swept ${counts.expired_holds} expired holds and ${counts.expired_bookings} bookings.`);
    }
  } catch (err) {
    // A later run obtains a fresh client from the pool and retries cleanup.
    // Expiry remains safe because the UPDATE only targets currently HELD rows.
    console.error('Sweeper database error; will retry:', err.message);
  } finally {
    setTimeout(sweepExpiredHolds, SWEEP_INTERVAL_MS);
  }
}

setTimeout(sweepExpiredHolds, SWEEP_INTERVAL_MS);

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Seats service listening on port ${PORT}`);
});
