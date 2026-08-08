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

app.get('/auth/me', async (req, res) => {
  // Stubbed for hackathon: return dummy user
  res.json({ id: '11111111-1111-1111-1111-111111111111', phone: '01711111111', name: 'Zayan' });
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth service listening on port ${PORT}`);
});
