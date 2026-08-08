-- Users
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone         VARCHAR(20)  NOT NULL UNIQUE,
    name          VARCHAR(120),
    password_hash TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Catalog
CREATE TABLE movies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(200) NOT NULL,
    poster_url    TEXT,
    duration_min  INT NOT NULL CHECK (duration_min > 0),
    rating        VARCHAR(10),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE theatres (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(150) NOT NULL,
    city          VARCHAR(100) NOT NULL
);

CREATE TABLE screens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    theatre_id    UUID NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
    name          VARCHAR(50) NOT NULL,
    UNIQUE (theatre_id, name)
);

CREATE TABLE shows (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movie_id      UUID NOT NULL REFERENCES movies(id) ON DELETE RESTRICT,
    screen_id     UUID NOT NULL REFERENCES screens(id) ON DELETE RESTRICT,
    start_time    TIMESTAMPTZ NOT NULL,
    base_price    NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (screen_id, start_time)
);

CREATE INDEX idx_shows_movie_time ON shows (movie_id, start_time);

-- Seats
CREATE TABLE seats (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id     UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    row_label     VARCHAR(5)  NOT NULL,
    seat_number   INT         NOT NULL,
    tier          VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    price_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
    UNIQUE (screen_id, row_label, seat_number)
);

-- Seat Status (Contended Table)
CREATE TABLE seat_status (
    seat_id       UUID NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
    show_id       UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    status        VARCHAR(12) NOT NULL DEFAULT 'AVAILABLE'
                  CHECK (status IN ('AVAILABLE','HELD','BOOKED')),
    held_by       UUID REFERENCES users(id),
    held_until    TIMESTAMPTZ,
    version       INT NOT NULL DEFAULT 0,
    PRIMARY KEY (seat_id, show_id)
);

CREATE INDEX idx_seat_status_show ON seat_status (show_id, status);
CREATE INDEX idx_seat_status_held_until ON seat_status (held_until) WHERE status = 'HELD';

-- Bookings
CREATE TABLE bookings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref   VARCHAR(40) NOT NULL UNIQUE,
    show_id       UUID NOT NULL REFERENCES shows(id),
    seat_id       UUID NOT NULL REFERENCES seats(id),
    user_id       UUID NOT NULL REFERENCES users(id),
    status        VARCHAR(20) NOT NULL DEFAULT 'HELD'
                  CHECK (status IN ('HELD','PENDING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED')),
    amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_user ON bookings (user_id, created_at DESC);
CREATE INDEX idx_bookings_show_seat ON bookings (show_id, seat_id);

CREATE UNIQUE INDEX uq_bookings_active_seat
    ON bookings (show_id, seat_id)
    WHERE status IN ('HELD','PENDING_PAYMENT','CONFIRMED');

-- Payments
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id          UUID NOT NULL REFERENCES bookings(id),
    gateway_payment_id  VARCHAR(60) UNIQUE,
    idempotency_key     VARCHAR(80) NOT NULL UNIQUE,
    amount              NUMERIC(10,2) NOT NULL,
    currency            VARCHAR(10) NOT NULL DEFAULT 'BDT',
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SUCCEEDED','FAILED','REFUNDED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_booking ON payments (booking_id);

CREATE TABLE processed_events (
    event_id      VARCHAR(80) PRIMARY KEY,
    payment_id    VARCHAR(60),
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OTP
CREATE TABLE otp_verifications (
    ref           VARCHAR(40) PRIMARY KEY,
    phone         VARCHAR(20) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'SENT'
                  CHECK (status IN ('SENT','VERIFIED','FAILED','EXPIRED','LOCKED')),
    attempts      INT NOT NULL DEFAULT 0,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at   TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
