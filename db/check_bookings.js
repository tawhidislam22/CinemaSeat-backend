const { Client } = require('pg');

const url = 'postgresql://neondb_owner:npg_Jr7RTzfPH1jy@ep-billowing-bread-aytt03zt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function check() {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
        await client.query("UPDATE bookings SET status = 'CONFIRMED' WHERE status = 'PENDING_PAYMENT'");
        const res = await client.query('SELECT id, booking_ref, status, user_id, amount FROM bookings WHERE status = \'CONFIRMED\' ORDER BY created_at DESC LIMIT 5');
        console.log("Fixed and Confirmed Bookings:", res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
check();
