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

const HOLD_TTL_SECONDS = parseInt(process.env.HOLD_TTL_SECONDS || '120', 10);

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

  try {
    const updateResult = await pool.query(`
      UPDATE seat_status
      SET status = 'HELD', held_by = $1, held_until = now() + ($2 || ' seconds')::interval,
          version = version + 1
      WHERE seat_id = $3 AND show_id = $4 AND status = 'AVAILABLE'
      RETURNING seat_id, held_until;
    `, [userId, HOLD_TTL_SECONDS, seatId, showId]);

    if (updateResult.rows.length === 0) {
      return res.status(409).json({ error: 'Seat not available' });
    }
    
    // Also need to get seat price info for the orchestrator
    const showInfo = await pool.query('SELECT base_price FROM shows WHERE id = $1', [showId]);
    const seatInfo = await pool.query('SELECT price_multiplier FROM seats WHERE id = $1', [seatId]);
    const amount = parseFloat(showInfo.rows[0].base_price) * parseFloat(seatInfo.rows[0].price_multiplier);

    res.json({ success: true, heldUntil: updateResult.rows[0].held_until, amount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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

// Sweeper
setInterval(async () => {
  try {
    const result = await pool.query(`
      UPDATE seat_status
      SET status = 'AVAILABLE', held_by = NULL, held_until = NULL
      WHERE status = 'HELD' AND held_until < now()
      RETURNING seat_id, show_id;
    `);
    if (result.rowCount > 0) {
      console.log(`Swept ${result.rowCount} expired holds.`);
      // Note: Ideally, pub/sub to notify bookings-service to update booking status
      // We will do a direct DB update for bookings here just to simplify the sweeper's effect across bounded contexts, or orchestrator should listen.
      // The user's architecture suggests pub/sub: "Redis publish on state change"
    }
  } catch (err) {
    console.error('Sweeper error:', err);
  }
}, 10000);

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Seats service listening on port ${PORT}`);
});
