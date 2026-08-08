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

app.get('/catalog/movies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM movies ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/catalog/shows/:movieId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sh.id, sh.start_time, sh.base_price, sc.name as screen_name, t.name as theatre_name, t.city as city
      FROM shows sh
      JOIN screens sc ON sh.screen_id = sc.id
      JOIN theatres t ON sc.theatre_id = t.id
      WHERE sh.movie_id = $1
      ORDER BY sh.start_time ASC
    `, [req.params.movieId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Catalog service listening on port ${PORT}`);
});
