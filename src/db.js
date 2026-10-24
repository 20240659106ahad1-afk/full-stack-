const { DatabaseSync } = require('node:sqlite'), bcrypt = require('bcryptjs'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'travel.db'));
db.exec('PRAGMA foreign_keys = ON');
// Node's built-in SQLite has no transaction helper, so add a tiny one.
db.transaction = fn => (...args) => {
  db.exec('BEGIN');
  try { const out = fn(...args); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};
const fresh = !db.prepare("select 1 from sqlite_master where name='users'").get();
db.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
if (fresh) db.exec(fs.readFileSync(path.join(root, 'seed.sql'), 'utf8'));
// Safe upgrades for databases created by an earlier version
const has = (t, c) => db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c);
db.exec('create table if not exists schema_migrations(name text primary key, applied_at text not null default current_timestamp)');
db.exec(`create table if not exists route_distances(
  id integer primary key autoincrement,
  start_district_id integer not null references districts(id),
  package_id integer not null references packages(id) on delete cascade,
  distance_km real not null check(distance_km > 0),
  unique(start_district_id, package_id))`);
const routeDistancesMigration = 'catalog-route-distances-2026-10-24-v2';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(routeDistancesMigration)) {
  const districtNames = ['Dhaka', 'Chattogram', 'Khulna', 'Rajshahi', 'Rangpur', 'Sylhet', 'Mymensingh'];
  const packageDistances = {
    'Bagerhat Heritage Tour': [335, 439, 60, 468, 317, 478, 367],
    'Dinajpur Temple Trail': [335, 507, 468, 114, 10, 469, 367],
    'Durga Sagar and Bhola Trip': [277, 151, 195, 457, 312, 323, 367],
    'Floating Market Tour': [270, 210, 195, 468, 317, 323, 367],
    'Garo Hills Border Trip': [193, 372, 367, 241, 335, 282, 10],
    'Haor Adventure': [240, 373, 478, 457, 335, 10, 282],
    'Heritage and Art Tour': [126, 372, 367, 241, 335, 282, 10],
    'Hill Tracts Explorer': [264, 90, 439, 507, 317, 302, 372],
    'Island Escape': [480, 120, 469, 507, 317, 302, 372],
    'Modern Dhaka City Tour': [10, 264, 335, 270, 335, 346, 193],
    'Old Dhaka Heritage Walk': [10, 264, 335, 270, 335, 346, 193],
    'Padma Riverside Tour': [270, 507, 468, 10, 114, 457, 241],
    'Paharpur and Mahasthangarh Tour': [270, 507, 468, 110, 114, 457, 241],
    'Rangpur Heritage Tour': [335, 507, 468, 114, 15, 469, 367],
    'River and Village Tour': [193, 372, 367, 241, 335, 282, 37],
    'Sea and Beach Getaway': [480, 150, 469, 507, 317, 302, 372],
    'Sonargaon Day Trip': [25, 264, 335, 270, 335, 346, 193],
    'Southern Delta Escape': [277, 151, 195, 457, 312, 323, 367],
    'Sundarbans Adventure': [335, 439, 90, 468, 317, 478, 367],
    'Sylhet Highlights': [346, 373, 478, 457, 335, 10, 282],
    'Tagore Literary Trail': [270, 507, 468, 30, 114, 457, 241],
    'Tea Garden Tour': [240, 373, 478, 457, 335, 10, 282],
    'Tea Garden and Border Trip': [335, 507, 468, 114, 10, 469, 367],
    'Varendra Heritage Trail': [270, 507, 468, 10, 114, 457, 241],
  };
  db.transaction(() => {
    const getDistrict = db.prepare('select id from districts where name = ?');
    const getPackage = db.prepare('select id from packages where name = ?');
    const addDistance = db.prepare('insert or ignore into route_distances(start_district_id, package_id, distance_km) values(?,?,?)');
    for (const [packageName, distances] of Object.entries(packageDistances)) {
      const tourPackage = getPackage.get(packageName);
      if (!tourPackage) throw new Error(`Could not find package for route distances: ${packageName}`);
      for (const [index, districtName] of districtNames.entries()) {
        const district = getDistrict.get(districtName);
        if (!district) throw new Error(`Could not find district for route distances: ${districtName}`);
        addDistance.run(district.id, tourPackage.id, distances[index]);
      }
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(routeDistancesMigration);
  })();
}
const allDistrictRouteDistancesMigration = 'catalog-all-district-route-estimates-2026-10-24-v2';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(allDistrictRouteDistancesMigration)) {
  db.transaction(() => {
    const capitalByDivision = {
      Barishal: null,
      Chattogram: 'Chattogram',
      Dhaka: 'Dhaka',
      Khulna: 'Khulna',
      Mymensingh: 'Mymensingh',
      Rajshahi: 'Rajshahi',
      Rangpur: 'Rangpur',
      Sylhet: 'Sylhet',
    };
    const districts = db.prepare(`select d.id, v.name as division_name from districts d
      join divisions v on v.id = d.division_id`).all();
    const packages = db.prepare('select id, name from packages').all();
    const capitalId = db.prepare('select id from districts where name = ?');
    const getDistance = db.prepare('select distance_km from route_distances where start_district_id = ? and package_id = ?');
    const addDistance = db.prepare('insert or ignore into route_distances(start_district_id, package_id, distance_km) values(?,?,?)');
    for (const tourPackage of packages) {
      for (const district of districts) {
        let distance;
        if (district.division_name === 'Barishal') {
          const dhaka = capitalId.get('Dhaka'), khulna = capitalId.get('Khulna');
          if (!dhaka || !khulna) throw new Error('Could not find Dhaka or Khulna district for Barishal route estimates');
          const dhakaDistance = getDistance.get(dhaka.id, tourPackage.id);
          const khulnaDistance = getDistance.get(khulna.id, tourPackage.id);
          if (!dhakaDistance || !khulnaDistance) throw new Error(`Could not estimate Barishal routes for ${tourPackage.name}`);
          distance = Math.round((dhakaDistance.distance_km + khulnaDistance.distance_km) / 2);
        } else {
          const capitalName = capitalByDivision[district.division_name];
          const capital = capitalName && capitalId.get(capitalName);
          if (!capital) throw new Error(`Could not find a distance reference for ${district.division_name}`);
          const capitalDistance = getDistance.get(capital.id, tourPackage.id);
          if (!capitalDistance) throw new Error(`Could not find the reference distance for ${tourPackage.name} from ${capitalName}`);
          distance = capitalDistance.distance_km;
        }
        addDistance.run(district.id, tourPackage.id, distance);
      }
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(allDistrictRouteDistancesMigration);
  })();
}
if (!has('meal_items', 'image_url')) db.exec("alter table meal_items add column image_url text not null default ''");
if (!has('hotel_rooms', 'bed_count')) db.exec('alter table hotel_rooms add column bed_count integer not null default 1 check (bed_count > 0)');
db.exec(`create table if not exists snack_items(
  id integer primary key autoincrement,
  name text not null unique,
  price real not null check(price >= 0),
  image_url text not null default '')`);
db.exec(`create table if not exists booking_snack_selections(
  booking_id integer not null references bookings(id) on delete cascade,
  day integer not null check(day between 1 and 7),
  snack_item_id integer not null references snack_items(id),
  primary key(booking_id, day))`);
if (!has('bookings', 'distance_km')) db.exec('alter table bookings add column distance_km real not null default 0');
const defaultMealPhotos = {
  breakfast: '/images/meal-breakfast.jpg',
  lunch: '/images/meal-lunch.jpg',
  dinner: '/images/meal-dinner.jpg',
};
const updateMealPhoto = db.prepare("update meal_items set image_url = ? where meal_type = ? and image_url = ''");
for (const [type, image] of Object.entries(defaultMealPhotos)) updateMealPhoto.run(image, type);
const addSnack = db.prepare('insert or ignore into snack_items(name,price,image_url) values(?,?,?)');
for (const [name, price] of [
  ['Samosa', 30],
  ['Singara', 25],
  ['Vegetable Chop', 35],
  ['Chicken Roll', 80],
  ['Fuchka', 60],
  ['Chotpoti', 70],
]) addSnack.run(name, price, '/images/meal-snacks.jpg');
const mealPhotosMigration = 'dish-specific-meal-photos-2026-10-24';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(mealPhotosMigration)) {
  db.transaction(() => {
    const updateMeal = db.prepare('update meal_items set image_url = ? where meal_type = ? and name = ?');
    for (const [type, name, image] of [
      ['breakfast', 'Paratha with Egg', '/images/meal-paratha.jpg'],
      ['breakfast', 'Luchi with Aloo Bhaji', '/images/meal-paratha.jpg'],
      ['breakfast', 'Khichuri with Egg', '/images/meal-khichuri.jpg'],
      ['breakfast', 'Bhuna Khichuri with Beef', '/images/meal-khichuri.jpg'],
      ['breakfast', 'Naan with Chicken Curry', '/images/meal-chicken-naan.jpg'],
      ['breakfast', 'Toast Omelette with Tea', '/images/meal-breakfast.jpg'],
      ['lunch', 'Rice with Chicken Curry', '/images/meal-chicken-naan.jpg'],
      ['lunch', 'Rice with Beef Bhuna', '/images/meal-beef-bhuna.jpg'],
      ['lunch', 'Rice with Hilsa Fish', '/images/meal-hilsa.jpg'],
      ['lunch', 'Kacchi Biryani', '/images/meal-biryani.jpg'],
      ['lunch', 'Polao with Roast', '/images/meal-polao.jpg'],
      ['lunch', 'Vegetable Platter with Dal', '/images/meal-lunch.jpg'],
      ['dinner', 'Rice with Chicken Curry', '/images/meal-chicken-naan.jpg'],
      ['dinner', 'Beef Tehari', '/images/meal-beef-bhuna.jpg'],
      ['dinner', 'Mutton Rezala with Naan', '/images/meal-chicken-naan.jpg'],
      ['dinner', 'Grilled Fish with Rice', '/images/meal-hilsa.jpg'],
      ['dinner', 'Fried Rice with Chicken', '/images/meal-lunch.jpg'],
      ['dinner', 'Khichuri with Beef', '/images/meal-khichuri.jpg'],
    ]) {
      if (updateMeal.run(image, type, name).changes !== 1) throw new Error(`Could not set a photo for ${name}`);
    }
    const updateSnack = db.prepare('update snack_items set image_url = ? where name = ?');
    for (const [name, image] of [
      ['Samosa', '/images/meal-samosa-singara.jpg'],
      ['Singara', '/images/meal-samosa-singara.jpg'],
      ['Vegetable Chop', '/images/meal-pakora.jpg'],
      ['Chicken Roll', '/images/meal-chicken-roll.jpg'],
      ['Fuchka', '/images/meal-fuchka.jpg'],
      ['Chotpoti', '/images/meal-chotpoti.jpg'],
    ]) {
      if (updateSnack.run(image, name).changes !== 1) throw new Error(`Could not set a photo for ${name}`);
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(mealPhotosMigration);
  })();
}
const priceMigration = 'catalog-prices-2026-10-24';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(priceMigration)) {
  db.transaction(() => {
    const updateRoom = db.prepare('update hotel_rooms set price_per_night = ? where room_type = ?');
    for (const [type, price] of [
      ['Single Room', 800],
      ['Double Room', 1800],
      ['Deluxe Room', 3000],
      ['Suite', 4000],
      ['Presidential Suite', 5000],
    ]) {
      if (updateRoom.run(price, type).changes !== 1) throw new Error(`Could not update seeded price for ${type}`);
    }
    const updateMeal = db.prepare('update meal_items set price = ? where meal_type = ? and name = ?');
    for (const [type, name, price] of [
      ['breakfast', 'Paratha with Egg', 30],
      ['breakfast', 'Luchi with Aloo Bhaji', 50],
      ['breakfast', 'Khichuri with Egg', 70],
      ['breakfast', 'Toast Omelette with Tea', 60],
      ['lunch', 'Kacchi Biryani', 300],
      ['lunch', 'Polao with Roast', 270],
      ['lunch', 'Vegetable Platter with Dal', 130],
      ['dinner', 'Rice with Chicken Curry', 220],
    ]) {
      if (updateMeal.run(price, type, name).changes !== 1) throw new Error(`Could not update seeded price for ${name}`);
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(priceMigration);
  })();
}
const roomBedsMigration = 'affordable-hotel-beds-2026-10-24';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(roomBedsMigration)) {
  db.transaction(() => {
    const updateRoom = db.prepare('update hotel_rooms set price_per_night = ?, bed_count = ? where room_type = ?');
    for (const [type, price, beds] of [
      ['Single Room', 600, 1],
      ['Double Room', 1300, 1],
      ['Deluxe Room', 2200, 2],
      ['Suite', 3000, 2],
      ['Presidential Suite', 3800, 3],
    ]) {
      if (updateRoom.run(price, beds, type).changes !== 1) throw new Error(`Could not update seeded room details for ${type}`);
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(roomBedsMigration);
  })();
}
if (!has('users', 'email')) db.exec('alter table users add column email text');
if (!has('bookings', 'refund_amount')) db.exec('alter table bookings add column refund_amount real not null default 0');
if (db.prepare("select 1 from pragma_index_list('payments') where origin = 'u'").get()) {
  db.exec(`create table payments_new(id integer primary key autoincrement,
    booking_id integer not null references bookings(id) on delete cascade, method text not null,
    transaction_id text not null, advance real not null, remaining real not null, paid_at text not null default current_timestamp);
  insert into payments_new select id, booking_id, method, transaction_id, advance, remaining, paid_at from payments;
  drop table payments; alter table payments_new rename to payments;`);
}
db.exec(`create unique index if not exists idx_users_email on users(email);
create table if not exists otps(key text primary key, code_hash text not null, expires_at integer not null,
  attempts integer not null default 0, created_at integer not null)`);
try { db.exec('create unique index if not exists idx_users_username_ci on users(lower(username))'); }
catch { console.warn('Some usernames differ only by letter case, so the case-insensitive rule was skipped'); }
db.exec(`create table if not exists meal_packages(id integer primary key autoincrement, name text not null unique, description text not null,
  breakfast_id integer not null references meal_items(id), lunch_id integer not null references meal_items(id), dinner_id integer not null references meal_items(id));
create table if not exists booking_meal_days(booking_id integer not null references bookings(id) on delete cascade,
  day integer not null check (day between 1 and 7), package_id integer not null references meal_packages(id), primary key (booking_id, day));
create table if not exists booking_meal_selections(
  booking_id integer not null references bookings(id) on delete cascade,
  day integer not null check (day between 1 and 7),
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner')),
  meal_item_id integer not null references meal_items(id),
  primary key (booking_id, day, meal_type))`);
db.exec(`create table if not exists feedback(id integer primary key autoincrement, user_id integer not null references users(id),
  booking_id integer references bookings(id) on delete set null, rating integer not null check (rating between 1 and 5),
  comment text not null, created_at text not null default current_timestamp);
create unique index if not exists idx_feedback_booking on feedback(booking_id) where booking_id is not null`);
if (!db.prepare("select 1 from users where role='admin'").get()) {
  db.prepare("insert into users(username,age,mobile,password_hash,role,email) values('admin',30,'01700000000',?,'admin',?)")
    .run(bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10), process.env.ADMIN_EMAIL || null);
}
module.exports = db;
