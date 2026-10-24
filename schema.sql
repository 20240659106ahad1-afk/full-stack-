PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    age           INTEGER,
    mobile        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','moderator','admin'))
);

CREATE TABLE IF NOT EXISTS divisions (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS districts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id INTEGER NOT NULL REFERENCES divisions(id),
    name        TEXT NOT NULL,
    UNIQUE (division_id, name)
);

CREATE TABLE IF NOT EXISTS packages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id INTEGER NOT NULL REFERENCES divisions(id),
    name        TEXT NOT NULL UNIQUE,
    best_for    TEXT
);

CREATE TABLE IF NOT EXISTS package_stops (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    stop_order INTEGER NOT NULL,
    stop_name  TEXT NOT NULL,
    UNIQUE (package_id, stop_order)
);

CREATE TABLE IF NOT EXISTS route_distances (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    start_district_id INTEGER NOT NULL REFERENCES districts(id),
    package_id        INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    distance_km       REAL NOT NULL CHECK (distance_km > 0),
    UNIQUE (start_district_id, package_id)
);

CREATE TABLE IF NOT EXISTS transports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    route           TEXT NOT NULL,
    capacity        INTEGER NOT NULL CHECK (capacity > 0),
    cost_per_person REAL NOT NULL CHECK (cost_per_person >= 0)
);

CREATE TABLE IF NOT EXISTS hotel_rooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    room_type       TEXT NOT NULL UNIQUE,
    price_per_night REAL NOT NULL CHECK (price_per_night >= 0),
    capacity        INTEGER NOT NULL CHECK (capacity > 0),
    bed_count       INTEGER NOT NULL DEFAULT 1 CHECK (bed_count > 0)
);

CREATE TABLE IF NOT EXISTS meal_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner')),
    name      TEXT NOT NULL,
    price     REAL NOT NULL CHECK (price >= 0),
    image_url TEXT NOT NULL DEFAULT '',
    UNIQUE (meal_type, name)
);

CREATE TABLE IF NOT EXISTS snack_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    price     REAL NOT NULL CHECK (price >= 0),
    image_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code           TEXT NOT NULL UNIQUE,
    user_id                 INTEGER NOT NULL REFERENCES users(id),
    start_district_id       INTEGER REFERENCES districts(id),
    destination_division_id INTEGER REFERENCES divisions(id),
    package_id              INTEGER REFERENCES packages(id),
    transport_id            INTEGER REFERENCES transports(id),
    transport_persons       INTEGER,
    room_id                 INTEGER REFERENCES hotel_rooms(id),
    hotel_persons           INTEGER,
    nights                  INTEGER,
    meal_persons            INTEGER,
    meal_days               INTEGER,
    distance_km             REAL NOT NULL DEFAULT 0,
    transport_cost          REAL NOT NULL DEFAULT 0,
    hotel_cost              REAL NOT NULL DEFAULT 0,
    meal_cost               REAL NOT NULL DEFAULT 0,
    total                   REAL NOT NULL DEFAULT 0,
    discount                REAL NOT NULL DEFAULT 0,
    final_total             REAL NOT NULL DEFAULT 0,
    travel_date             TEXT,
    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','confirmed','cancelled')),
    created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_meals (
    booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    meal_item_id INTEGER NOT NULL REFERENCES meal_items(id),
    PRIMARY KEY (booking_id, meal_item_id)
);

CREATE TABLE IF NOT EXISTS booking_snack_selections (
    booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    day          INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
    snack_item_id INTEGER NOT NULL REFERENCES snack_items(id),
    PRIMARY KEY (booking_id, day)
);

CREATE TABLE IF NOT EXISTS payments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id     INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    method         TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    advance        REAL NOT NULL,
    remaining      REAL NOT NULL,
    paid_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
