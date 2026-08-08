const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const url = 'postgresql://neondb_owner:npg_Jr7RTzfPH1jy@ep-billowing-bread-aytt03zt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function migrate() {
    console.log("Connecting to Neon DB...");
    const client = new Client({ connectionString: url });
    await client.connect();

    try {
        console.log("Running 00-schemas.sql...");
        const schemas = fs.readFileSync(path.join(__dirname, 'init', '00-schemas.sql'), 'utf8');
        await client.query(schemas);
        console.log("✅ Schemas applied successfully.");

        console.log("Running 01-extensions.sql...");
        const extensions = fs.readFileSync(path.join(__dirname, 'init', '01-extensions.sql'), 'utf8');
        await client.query(extensions);
        console.log("✅ Extensions applied successfully.");

        console.log("Running 02-seed.sql...");
        const seeds = fs.readFileSync(path.join(__dirname, 'init', '02-seed.sql'), 'utf8');
        await client.query(seeds);
        console.log("✅ Seed data inserted successfully.");

        console.log("🎉 Database initialization complete!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

migrate();
