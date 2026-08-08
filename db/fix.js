const { Client } = require('pg');

const url = 'postgresql://neondb_owner:npg_Jr7RTzfPH1jy@ep-billowing-bread-aytt03zt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function fix() {
    const client = new Client({ connectionString: url });
    await client.connect();
    
    try {
        const res = await client.query(`
            UPDATE bookings 
            SET status = 'EXPIRED' 
            WHERE status IN ('HELD', 'PENDING_PAYMENT') 
            AND NOT EXISTS (
                SELECT 1 FROM seat_status ss 
                WHERE ss.seat_id = bookings.seat_id 
                AND ss.show_id = bookings.show_id 
                AND ss.status IN ('HELD', 'BOOKED')
            )
        `);
        console.log(`Cleaned up ${res.rowCount} stuck bookings!`);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

fix();
