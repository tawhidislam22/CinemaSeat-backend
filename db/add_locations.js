const { Client } = require('pg');
const crypto = require('crypto');

const url = 'postgresql://neondb_owner:npg_Jr7RTzfPH1jy@ep-billowing-bread-aytt03zt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function seed() {
    const client = new Client({ connectionString: url });
    await client.connect();

    try {
        console.log("Seeding new locations and screens...");
        
        // 1. Fetch all movies
        const moviesRes = await client.query('SELECT id FROM movies');
        const movies = moviesRes.rows.map(r => r.id);
        
        if (movies.length === 0) {
            console.log("No movies found. Please run the movie seed script first.");
            return;
        }

        // 2. Define new theatres
        const theatres = [
            { id: crypto.randomUUID(), name: 'Cineplex - Chittagong', city: 'Chittagong' },
            { id: crypto.randomUUID(), name: 'Grand Sylhet Cinema', city: 'Sylhet' },
            { id: crypto.randomUUID(), name: 'Coxs Bazar IMAX', city: 'Coxs Bazar' },
            { id: crypto.randomUUID(), name: 'Rajshahi Cineplex', city: 'Rajshahi' },
            { id: crypto.randomUUID(), name: 'Jamuna Future Park', city: 'Dhaka' }
        ];

        for (const t of theatres) {
            await client.query(`
                INSERT INTO theatres (id, name, city) VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING
            `, [t.id, t.name, t.city]);
        }
        
        // 3. Define screens for these theatres
        const screens = [];
        for (const t of theatres) {
            // Each theatre gets 2 screens
            screens.push({ id: crypto.randomUUID(), theatre_id: t.id, name: 'Standard Screen 1' });
            screens.push({ id: crypto.randomUUID(), theatre_id: t.id, name: 'VIP Screen' });
        }

        for (const s of screens) {
            await client.query(`
                INSERT INTO screens (id, theatre_id, name) VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING
            `, [s.id, s.theatre_id, s.name]);
        }

        // 4. Generate shows for each movie in these new screens
        console.log("Generating shows and seats...");
        let showCount = 0;
        
        const now = new Date();
        now.setUTCHours(18, 0, 0, 0); // Start at 6 PM UTC
        
        for (const movieId of movies) {
            // Randomly select 3 screens to show this movie
            const shuffledScreens = [...screens].sort(() => 0.5 - Math.random()).slice(0, 3);
            
            for (const screen of shuffledScreens) {
                const showId = crypto.randomUUID();
                
                // Show dates: randomly tomorrow or day after
                const showTime = new Date(now);
                showTime.setDate(now.getDate() + 1 + Math.floor(Math.random() * 2));
                
                const basePrice = screen.name.includes('VIP') ? 800.00 : 400.00;

                const showRes = await client.query(`
                    INSERT INTO shows (id, movie_id, screen_id, start_time, base_price)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT DO NOTHING
                    RETURNING id
                `, [showId, movieId, screen.id, showTime.toISOString(), basePrice]);
                
                if (showRes.rows.length === 0) continue; // Show was not inserted due to conflict
                showCount++;

                // Generate seats for this screen if not exist
                const seatRes = await client.query('SELECT COUNT(*) FROM seats WHERE screen_id = $1', [screen.id]);
                if (parseInt(seatRes.rows[0].count) === 0) {
                    const rows = ['A', 'B', 'C', 'D', 'E'];
                    const seatsPerRow = 10;
                    for (const r of rows) {
                        for (let n = 1; n <= seatsPerRow; n++) {
                            await client.query(`
                                INSERT INTO seats (screen_id, row_label, seat_number, tier, price_multiplier)
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT DO NOTHING
                            `, [screen.id, r, n, 'STANDARD', 1.0]);
                        }
                    }
                }

                // Generate seat status for this show
                await client.query(`
                    INSERT INTO seat_status (seat_id, show_id, status)
                    SELECT id, $1, 'AVAILABLE' FROM seats WHERE screen_id = $2
                    ON CONFLICT DO NOTHING
                `, [showId, screen.id]);
            }
        }
        
        console.log(`Successfully generated ${showCount} new shows with seats!`);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

seed();
