-- Seed Data for CinemaSeat

INSERT INTO users (id, phone, name)
VALUES 
    ('11111111-1111-1111-1111-111111111111', '01711111111', 'Zayan'),
    ('22222222-2222-2222-2222-222222222222', '01722222222', 'Test User 2')
ON CONFLICT (phone) DO NOTHING;

INSERT INTO movies (id, title, poster_url, duration_min, rating)
VALUES 
    ('aaaa0000-0000-0000-0000-000000000001', 'Spider-Man: Brand New Day', 'https://m.media-amazon.com/images/M/MV5BMjMwNDkxMTgzOF5BMl5BanBnXkFtZTgwNTkwNTQ3NjM@._V1_FMjpg_UX1000_.jpg', 140, 'PG-13'),
    ('aaaa0000-0000-0000-0000-000000000002', 'Dune: Part Two', 'https://m.media-amazon.com/images/M/MV5BODQ0ZWMxMTItMjE0Mi00ZjNiLWIxZWEtZTZiNThiN2JmMDZmXkEyXkFqcGc@._V1_.jpg', 166, 'PG-13')
ON CONFLICT DO NOTHING;

INSERT INTO theatres (id, name, city)
VALUES 
    ('bbbb0000-0000-0000-0000-000000000001', 'Star Cineplex - Bashundhara City', 'Dhaka'),
    ('bbbb0000-0000-0000-0000-000000000002', 'Blockbuster Cinemas', 'Dhaka')
ON CONFLICT DO NOTHING;

INSERT INTO screens (id, theatre_id, name)
VALUES 
    ('cccc0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'Screen 1'),
    ('cccc0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000002', 'IMAX')
ON CONFLICT DO NOTHING;

INSERT INTO shows (id, movie_id, screen_id, start_time, base_price)
VALUES 
    ('dddd0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001', '2026-08-08 23:59:00Z', 500.00),
    ('dddd0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000002', '2026-08-09 14:00:00Z', 600.00)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    row_char CHAR;
    seat_num INT;
BEGIN
    FOR row_char IN SELECT unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F']) LOOP
        FOR seat_num IN 1..20 LOOP
            INSERT INTO seats (screen_id, row_label, seat_number, tier, price_multiplier)
            VALUES ('cccc0000-0000-0000-0000-000000000001', row_char, seat_num, 'STANDARD', 1.0)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    FOR row_char IN SELECT unnest(ARRAY['A', 'B', 'C', 'D']) LOOP
        FOR seat_num IN 1..15 LOOP
            INSERT INTO seats (screen_id, row_label, seat_number, tier, price_multiplier)
            VALUES ('cccc0000-0000-0000-0000-000000000002', row_char, seat_num, 'PREMIUM', 1.5)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

INSERT INTO seat_status (seat_id, show_id, status)
SELECT s.id, sh.id, 'AVAILABLE'
FROM seats s
JOIN shows sh ON s.screen_id = sh.screen_id
ON CONFLICT (seat_id, show_id) DO NOTHING;
