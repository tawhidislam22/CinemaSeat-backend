const { Client } = require('pg');

const url = 'postgresql://neondb_owner:npg_Jr7RTzfPH1jy@ep-billowing-bread-aytt03zt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const movies = [
    { title: "The Dark Knight", poster_url: "https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_.jpg", duration_min: 152, rating: "PG-13" },
    { title: "Inception", poster_url: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_.jpg", duration_min: 148, rating: "PG-13" },
    { title: "Interstellar", poster_url: "https://m.media-amazon.com/images/M/MV5BZjdkOTU3MDktN2IxOS00OGEyLWFmMjktY2FiMmZkNWIyODZiXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_.jpg", duration_min: 169, rating: "PG-13" },
    { title: "The Matrix", poster_url: "https://m.media-amazon.com/images/M/MV5BNzQzOTk3OTAtNDQ0Zi00ZTVkLWI0MTEtMDllZjNkYzNjNTc4L2ltYWdlXkEyXkFqcGdeQXVyNjU0OTQ0OTY@._V1_.jpg", duration_min: 136, rating: "R" },
    { title: "Avengers: Endgame", poster_url: "https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_.jpg", duration_min: 181, rating: "PG-13" },
    { title: "Avatar", poster_url: "https://m.media-amazon.com/images/M/MV5BZDA0OGQxNTItMDZkMC00N2UyLTg3MzMtYTJmNjg3Nzk5MzRiXkEyXkFqcGdeQXVyNDUzOTQ5MjY@._V1_.jpg", duration_min: 162, rating: "PG-13" },
    { title: "Titanic", poster_url: "https://m.media-amazon.com/images/M/MV5BMDdmZGU3NDPhODk5My00NmI1LWIzOTktZTUyY2E3MTI2ZjljXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_.jpg", duration_min: 194, rating: "PG-13" },
    { title: "Jurassic Park", poster_url: "https://m.media-amazon.com/images/M/MV5BMjM2MDgxMDg0Nl5BMl5BanBnXkFtZTgwNTM2OTM5NDE@._V1_.jpg", duration_min: 127, rating: "PG-13" },
    { title: "The Lion King", poster_url: "https://m.media-amazon.com/images/M/MV5BYTYxNGMyZTYtMjE3MS00MzNjLWFjNmYtMDk3N2FmM2JiM2M1XkEyXkFqcGdeQXVyNjY5NDU4NzI@._V1_.jpg", duration_min: 88, rating: "G" },
    { title: "Gladiator", poster_url: "https://m.media-amazon.com/images/M/MV5BMDliMmNhNDEtODUyOS00MzRlLTExNWYtMTQ5NGNlYWEwYTFhXkEyXkFqcGdeQXVyNDM3ODU2NDM@._V1_.jpg", duration_min: 155, rating: "R" }
];

async function run() {
    const client = new Client({ connectionString: url });
    await client.connect();
    
    try {
        console.log("Inserting movies...");
        for (const m of movies) {
            // Insert movie
            const movieRes = await client.query(`
                INSERT INTO movies (title, poster_url, duration_min, rating)
                VALUES ($1, $2, $3, $4)
                RETURNING id;
            `, [m.title, m.poster_url, m.duration_min, m.rating]);
            const movieId = movieRes.rows[0].id;

            // Create a show for this movie in Screen 1 (cccc0000-0000-0000-0000-000000000001)
            // Stagger start times so they don't violate unique constraint (screen_id, start_time)
            const hourOffset = Math.floor(Math.random() * 24);
            const dayOffset = Math.floor(Math.random() * 5);
            
            await client.query(`
                INSERT INTO shows (movie_id, screen_id, start_time, base_price)
                VALUES ($1, 'cccc0000-0000-0000-0000-000000000001', now() + interval '${dayOffset} days' + interval '${hourOffset} hours', 500.00)
            `, [movieId]);
        }

        console.log("Generating seat_status for new shows...");
        await client.query(`
            INSERT INTO seat_status (seat_id, show_id, status)
            SELECT s.id, sh.id, 'AVAILABLE'
            FROM seats s
            JOIN shows sh ON s.screen_id = sh.screen_id
            ON CONFLICT (seat_id, show_id) DO NOTHING;
        `);

        console.log("✅ 10 movies successfully added with shows and seats!");
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
