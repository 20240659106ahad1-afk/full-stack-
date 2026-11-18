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
  persons integer not null default 1 check(persons > 0),
  primary key(booking_id, day))`);
if (!has('booking_snack_selections', 'persons')) {
  db.exec('alter table booking_snack_selections add column persons integer not null default 1 check(persons > 0)');
  db.exec(`update booking_snack_selections set persons = coalesce(
    (select nullif(b.meal_persons, 0) from bookings b where b.id = booking_snack_selections.booking_id), 1)`);
}
if (!has('bookings', 'distance_km')) db.exec('alter table bookings add column distance_km real not null default 0');
if (!has('bookings', 'departure_time')) db.exec('alter table bookings add column departure_time text');
db.exec(`create table if not exists booking_seats(
  booking_id integer not null references bookings(id) on delete cascade,
  seat_number integer not null check(seat_number > 0),
  primary key(booking_id, seat_number))`);
const defaultMealPhotos = {
  breakfast: '/images/pexels-omelette-toast.jpg',
  lunch: '/images/pexels-chicken-curry-rice.jpg',
  dinner: '/images/pexels-chicken-curry-rice.jpg',
};
const updateMealPhoto = db.prepare("update meal_items set image_url = ? where meal_type = ? and image_url = ''");
for (const [type, image] of Object.entries(defaultMealPhotos)) updateMealPhoto.run(image, type);
const addSnack = db.prepare('insert or ignore into snack_items(name,price,image_url) values(?,?,?)');
for (const [name, price] of [
  ['Pizza', 180],
  ['Singara', 25],
  ['Vegetable Chop', 35],
  ['Chicken Roll', 80],
  ['Fuchka', 60],
  ['Chotpoti', 70],
]) {
  if (name === 'Pizza' && db.prepare("select 1 from snack_items where name = 'Samosa'").get()) continue;
  addSnack.run(name, price, '/images/pexels-pizza.jpg');
}
db.exec(`create table if not exists restaurants(
  id integer primary key autoincrement,
  package_stop_id integer not null references package_stops(id) on delete cascade,
  name text not null,
  description text not null default '',
  unique(package_stop_id, name));
create table if not exists restaurant_menu_items(
  id integer primary key autoincrement,
  restaurant_id integer not null references restaurants(id) on delete cascade,
  meal_type text not null check(meal_type in ('breakfast','lunch','dinner','snacks')),
  name text not null,
  price real not null check(price >= 0),
  image_url text not null default '');
create table if not exists booking_food_orders(
  booking_id integer not null references bookings(id) on delete cascade,
  day integer not null check(day between 1 and 7),
  meal_type text not null check(meal_type in ('breakfast','lunch','dinner','snacks')),
  person_number integer not null check(person_number > 0),
  restaurant_id integer not null references restaurants(id),
  menu_item_id integer not null references restaurant_menu_items(id),
  quantity integer not null default 1 check(quantity between 1 and 10),
  primary key(booking_id, day, meal_type, person_number));
create table if not exists user_food_preferences(
  user_id integer not null references users(id) on delete cascade,
  meal_type text not null check(meal_type in ('breakfast','lunch','dinner','snacks')),
  dish_name text not null,
  primary key(user_id, meal_type))`);
const restaurantsMigration = 'spot-restaurants-and-menus-2026-11-18';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(restaurantsMigration)) {
  db.transaction(() => {
    const stops = db.prepare('select id, stop_name from package_stops order by id').all();
    const addRestaurant = db.prepare('insert or ignore into restaurants(package_stop_id,name,description) values(?,?,?)');
    const getRestaurant = db.prepare('select id from restaurants where package_stop_id = ? and name = ?');
    const menus = [
      ...db.prepare('select meal_type, name, price, image_url from meal_items order by meal_type, id').all(),
      ...db.prepare('select ? as meal_type, name, price, image_url from snack_items order by id').all('snacks'),
    ];
    const addMenuItem = db.prepare(`insert into restaurant_menu_items(restaurant_id,meal_type,name,price,image_url)
      select ?,?,?,?,? where not exists(
        select 1 from restaurant_menu_items where restaurant_id=? and meal_type=? and name=?)`);
    stops.forEach((stop, index) => {
      for (const [suffix, description] of [
        ['Local Kitchen', 'Bangladeshi local favourites and fresh meals'],
        ['Family Restaurant', 'A comfortable stop for family meals and snacks'],
      ]) {
        const name = `${stop.stop_name} ${suffix}`;
        addRestaurant.run(stop.id, name, description);
        const restaurant = getRestaurant.get(stop.id, name);
        for (const type of ['breakfast', 'lunch', 'dinner', 'snacks']) {
          menus.filter(item => item.meal_type === type).forEach((item, itemIndex, categoryItems) => {
            if (suffix === 'Family Restaurant' && categoryItems.length > 1 && itemIndex % 2 !== index % 2) return;
            addMenuItem.run(restaurant.id, item.meal_type, item.name, item.price, item.image_url,
              restaurant.id, item.meal_type, item.name);
          });
        }
      }
    });
    db.prepare('insert into schema_migrations(name) values(?)').run(restaurantsMigration);
  })();
}
const mealPhotosMigration = 'dish-specific-meal-photos-2026-10-24';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(mealPhotosMigration)) {
  db.transaction(() => {
    const updateMeal = db.prepare('update meal_items set image_url = ? where meal_type = ? and name = ?');
    for (const [type, name, image] of [
      ['breakfast', 'Paratha with Egg', '/images/pexels-paratha.jpg'],
      ['breakfast', 'Luchi with Aloo Bhaji', '/images/pexels-halwa-puri.jpg'],
      ['breakfast', 'Khichuri with Egg', '/images/pexels-khichuri.jpg'],
      ['breakfast', 'Bhuna Khichuri with Beef', '/images/pexels-beef-khichuri.jpg'],
      ['breakfast', 'Naan with Chicken Curry', '/images/pexels-naan-curry.jpg'],
      ['breakfast', 'Toast Omelette with Tea', '/images/pexels-omelette-toast.jpg'],
      ['lunch', 'Rice with Chicken Curry', '/images/pexels-chicken-curry-rice.jpg'],
      ['lunch', 'Rice with Beef Bhuna', '/images/pexels-beef-bhuna.jpg'],
      ['lunch', 'Rice with Hilsa Fish', '/images/pexels-hilsa-rice.jpg'],
      ['lunch', 'Kacchi Biryani', '/images/pexels-kacchi-biryani.jpg'],
      ['lunch', 'Polao with Roast', '/images/pexels-polao-roast.jpg'],
      ['lunch', 'Vegetable Platter with Dal', '/images/pexels-vegetable-dal.jpg'],
      ['dinner', 'Rice with Chicken Curry', '/images/pexels-chicken-curry-rice.jpg'],
      ['dinner', 'Beef Tehari', '/images/pexels-beef-khichuri.jpg'],
      ['dinner', 'Mutton Rezala with Naan', '/images/pexels-mutton-rezala.jpg'],
      ['dinner', 'Grilled Fish with Rice', '/images/pexels-grilled-fish.jpg'],
      ['dinner', 'Fried Rice with Chicken', '/images/pexels-fried-rice.jpg'],
      ['dinner', 'Khichuri with Beef', '/images/pexels-beef-khichuri.jpg'],
    ]) {
      if (updateMeal.run(image, type, name).changes !== 1) throw new Error(`Could not set a photo for ${name}`);
    }
    const updateSnack = db.prepare('update snack_items set image_url = ? where name = ?');
    for (const [name, image] of [
      ['Samosa', '/images/pexels-pizza.jpg'],
      ['Singara', '/images/pexels-singara.jpg'],
      ['Vegetable Chop', '/images/pexels-vegetable-pakora.jpg'],
      ['Chicken Roll', '/images/pexels-chicken-roll.jpg'],
      ['Fuchka', '/images/pexels-fuchka.jpg'],
      ['Chotpoti', '/images/pexels-chotpoti.jpg'],
    ]) {
      const changes = updateSnack.run(image, name).changes;
      if (changes !== 1 && name !== 'Samosa') throw new Error(`Could not set a photo for ${name}`);
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(mealPhotosMigration);
  })();
}
const extraFoodMigration = 'extra-food-items-with-photos-2026-11-18';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(extraFoodMigration)) {
  db.transaction(() => {
    const addMeal = db.prepare('insert or ignore into meal_items(meal_type,name,price,image_url) values(?,?,?,?)');
    for (const [type, name, price, image] of [
      ['breakfast', 'Halwa Puri', 90, '/images/pexels-halwa-puri.jpg'],
      ['breakfast', 'Egg and Cheese Sandwich', 120, '/images/pexels-egg-cheese-sandwich.jpg'],
      ['lunch', 'Morog Polao', 280, '/images/pexels-morog-polao.jpg'],
      ['lunch', 'Beef Kala Bhuna with Rice', 320, '/images/pexels-kala-bhuna-rice.jpg'],
      ['dinner', 'Chicken Roast with Polao', 300, '/images/pexels-chicken-roast-polao.jpg'],
      ['dinner', 'Prawn Curry with Rice', 360, '/images/pexels-prawn-curry.jpg'],
    ]) addMeal.run(type, name, price, image);

    const addSnack = db.prepare('insert or ignore into snack_items(name,price,image_url) values(?,?,?)');
    for (const [name, price, image] of [
      ['Jilapi', 40, '/images/pexels-jilapi.jpg'],
      ['Vegetable Pakora', 50, '/images/pexels-vegetable-pakora.jpg'],
      ['Grilled Chicken Sandwich', 140, '/images/pexels-grilled-chicken-sandwich.jpg'],
      ['Lemon Tea', 30, '/images/pexels-lemon-tea.jpg'],
    ]) addSnack.run(name, price, image);

    const updateExistingMealPhotos = db.prepare(`update restaurant_menu_items set image_url = (
      select image_url from meal_items where meal_items.meal_type = restaurant_menu_items.meal_type
        and meal_items.name = restaurant_menu_items.name)
      where meal_type in ('breakfast','lunch','dinner') and image_url = ''
        and exists(select 1 from meal_items where meal_items.meal_type = restaurant_menu_items.meal_type
          and meal_items.name = restaurant_menu_items.name)`);
    const updateExistingSnackPhotos = db.prepare(`update restaurant_menu_items set image_url = (
      select image_url from snack_items where snack_items.name = restaurant_menu_items.name)
      where meal_type = 'snacks' and image_url = ''
        and exists(select 1 from snack_items where snack_items.name = restaurant_menu_items.name)`);
    updateExistingMealPhotos.run();
    updateExistingSnackPhotos.run();

    const restaurants = db.prepare('select id from restaurants').all();
    const addMenuItem = db.prepare(`insert into restaurant_menu_items(restaurant_id,meal_type,name,price,image_url)
      select ?,?,?,?,? where not exists(
        select 1 from restaurant_menu_items where restaurant_id=? and meal_type=? and name=?)`);
    const meals = db.prepare(`select meal_type,name,price,image_url from meal_items
      where name in ('Halwa Puri','Egg and Cheese Sandwich','Morog Polao','Beef Kala Bhuna with Rice',
        'Chicken Roast with Polao','Prawn Curry with Rice')`).all();
    const snacks = db.prepare(`select name,price,image_url from snack_items
      where name in ('Jilapi','Vegetable Pakora','Grilled Chicken Sandwich','Lemon Tea')`).all();
    for (const restaurant of restaurants) {
      for (const item of meals) {
        addMenuItem.run(restaurant.id, item.meal_type, item.name, item.price, item.image_url,
          restaurant.id, item.meal_type, item.name);
      }
      for (const item of snacks) {
        addMenuItem.run(restaurant.id, 'snacks', item.name, item.price, item.image_url,
          restaurant.id, 'snacks', item.name);
      }
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(extraFoodMigration);
  })();
}
const pexelsFoodPhotosMigration = 'pexels-food-photos-2026-11-18';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(pexelsFoodPhotosMigration)) {
  db.transaction(() => {
    const updateMeal = db.prepare('update meal_items set image_url = ? where meal_type = ? and name = ?');
    const updateSnack = db.prepare('update snack_items set image_url = ? where name = ?');
    const updateMenu = db.prepare('update restaurant_menu_items set image_url = ? where meal_type = ? and name = ?');
    for (const [type, name, image] of [
      ['breakfast', 'Halwa Puri', '/images/pexels-halwa-puri.jpg'],
      ['breakfast', 'Egg and Cheese Sandwich', '/images/pexels-egg-cheese-sandwich.jpg'],
      ['lunch', 'Morog Polao', '/images/pexels-morog-polao.jpg'],
      ['lunch', 'Beef Kala Bhuna with Rice', '/images/pexels-kala-bhuna-rice.jpg'],
      ['dinner', 'Chicken Roast with Polao', '/images/pexels-chicken-roast-polao.jpg'],
      ['dinner', 'Prawn Curry with Rice', '/images/pexels-prawn-curry.jpg'],
    ]) {
      if (updateMeal.run(image, type, name).changes !== 1) throw new Error(`Could not set a Pexels photo for ${name}`);
      updateMenu.run(image, type, name);
    }
    for (const [name, image] of [
      ['Jilapi', '/images/pexels-jilapi.jpg'],
      ['Vegetable Pakora', '/images/pexels-vegetable-pakora.jpg'],
      ['Grilled Chicken Sandwich', '/images/pexels-grilled-chicken-sandwich.jpg'],
      ['Lemon Tea', '/images/pexels-lemon-tea.jpg'],
    ]) {
      if (updateSnack.run(image, name).changes !== 1) throw new Error(`Could not set a Pexels photo for ${name}`);
      updateMenu.run(image, 'snacks', name);
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(pexelsFoodPhotosMigration);
  })();
}
const existingFoodPhotosMigration = 'pexels-existing-food-photos-2026-11-18';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(existingFoodPhotosMigration)) {
  db.transaction(() => {
    const updateMeal = db.prepare('update meal_items set image_url = ? where meal_type = ? and name = ?');
    const updateSnack = db.prepare('update snack_items set image_url = ? where name = ?');
    const updateMenu = db.prepare('update restaurant_menu_items set image_url = ? where meal_type = ? and name = ?');
    for (const [type, name, image] of [
      ['breakfast', 'Paratha with Egg', '/images/pexels-paratha.jpg'],
      ['breakfast', 'Luchi with Aloo Bhaji', '/images/pexels-halwa-puri.jpg'],
      ['breakfast', 'Khichuri with Egg', '/images/pexels-khichuri.jpg'],
      ['breakfast', 'Bhuna Khichuri with Beef', '/images/pexels-beef-khichuri.jpg'],
      ['breakfast', 'Naan with Chicken Curry', '/images/pexels-naan-curry.jpg'],
      ['breakfast', 'Toast Omelette with Tea', '/images/pexels-omelette-toast.jpg'],
      ['lunch', 'Rice with Chicken Curry', '/images/pexels-chicken-curry-rice.jpg'],
      ['lunch', 'Rice with Beef Bhuna', '/images/pexels-beef-bhuna.jpg'],
      ['lunch', 'Rice with Hilsa Fish', '/images/pexels-hilsa-rice.jpg'],
      ['lunch', 'Kacchi Biryani', '/images/pexels-kacchi-biryani.jpg'],
      ['lunch', 'Polao with Roast', '/images/pexels-polao-roast.jpg'],
      ['lunch', 'Vegetable Platter with Dal', '/images/pexels-vegetable-dal.jpg'],
      ['dinner', 'Rice with Chicken Curry', '/images/pexels-chicken-curry-rice.jpg'],
      ['dinner', 'Beef Tehari', '/images/pexels-beef-khichuri.jpg'],
      ['dinner', 'Mutton Rezala with Naan', '/images/pexels-mutton-rezala.jpg'],
      ['dinner', 'Grilled Fish with Rice', '/images/pexels-grilled-fish.jpg'],
      ['dinner', 'Fried Rice with Chicken', '/images/pexels-fried-rice.jpg'],
      ['dinner', 'Khichuri with Beef', '/images/pexels-beef-khichuri.jpg'],
    ]) {
      if (updateMeal.run(image, type, name).changes !== 1) throw new Error(`Could not set a Pexels photo for ${name}`);
      updateMenu.run(image, type, name);
    }
    for (const [name, image] of [
      ['Singara', '/images/pexels-singara.jpg'],
      ['Vegetable Chop', '/images/pexels-vegetable-pakora.jpg'],
      ['Chicken Roll', '/images/pexels-chicken-roll.jpg'],
      ['Fuchka', '/images/pexels-fuchka.jpg'],
      ['Chotpoti', '/images/pexels-chotpoti.jpg'],
    ]) {
      const changes = updateSnack.run(image, name).changes;
      if (changes !== 1 && name !== 'Samosa') throw new Error(`Could not set a Pexels photo for ${name}`);
      updateMenu.run(image, 'snacks', name);
    }
    db.prepare('insert into schema_migrations(name) values(?)').run(existingFoodPhotosMigration);
  })();
}
const pizzaSnackMigration = 'replace-samosa-with-pizza-2026-11-18';
if (!db.prepare('select 1 from schema_migrations where name = ?').get(pizzaSnackMigration)) {
  db.transaction(() => {
    const samosa = db.prepare("select id from snack_items where name = 'Samosa'").get();
    const pizza = db.prepare("select id from snack_items where name = 'Pizza'").get();
    if (samosa && pizza && samosa.id !== pizza.id) {
      db.prepare(`delete from booking_snack_selections where snack_item_id = ?
        and exists(select 1 from booking_snack_selections existing
          where existing.booking_id = booking_snack_selections.booking_id
            and existing.day = booking_snack_selections.day and existing.snack_item_id = ?)`)
        .run(pizza.id, samosa.id);
      db.prepare('update booking_snack_selections set snack_item_id = ? where snack_item_id = ?')
        .run(samosa.id, pizza.id);
      db.prepare('delete from snack_items where id = ?').run(pizza.id);
    }
    if (samosa) {
      db.prepare("update snack_items set name = 'Pizza', price = 180, image_url = '/images/pexels-pizza.jpg' where id = ?")
        .run(samosa.id);
    } else {
      db.prepare(`insert or ignore into snack_items(name, price, image_url)
        values('Pizza', 180, '/images/pexels-pizza.jpg')`).run();
      db.prepare("update snack_items set price = 180, image_url = '/images/pexels-pizza.jpg' where name = 'Pizza'").run();
    }
    const samosaMenuItems = db.prepare(`select id, restaurant_id from restaurant_menu_items
      where meal_type = 'snacks' and name = 'Samosa'`).all();
    const findPizzaMenuItem = db.prepare(`select id from restaurant_menu_items
      where restaurant_id = ? and meal_type = 'snacks' and name = 'Pizza'`);
    const updateFoodOrders = db.prepare('update booking_food_orders set menu_item_id = ? where menu_item_id = ?');
    for (const item of samosaMenuItems) {
      const existingPizza = findPizzaMenuItem.get(item.restaurant_id);
      if (existingPizza) {
        updateFoodOrders.run(existingPizza.id, item.id);
        db.prepare('delete from restaurant_menu_items where id = ?').run(item.id);
      } else {
        db.prepare(`update restaurant_menu_items
          set name = 'Pizza', price = 180, image_url = '/images/pexels-pizza.jpg' where id = ?`).run(item.id);
      }
    }
    db.prepare(`update user_food_preferences set dish_name = 'Pizza'
      where meal_type = 'snacks' and dish_name = 'Samosa'`).run();
    db.prepare('insert into schema_migrations(name) values(?)').run(pizzaSnackMigration);
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
  persons integer not null default 1 check (persons > 0),
  primary key (booking_id, day, meal_type))`);
if (!has('booking_meal_selections', 'persons')) {
  db.exec('alter table booking_meal_selections add column persons integer not null default 1 check (persons > 0)');
  db.exec(`update booking_meal_selections set persons = coalesce(
    (select nullif(b.meal_persons, 0) from bookings b where b.id = booking_meal_selections.booking_id), 1)`);
}
db.exec(`create table if not exists feedback(id integer primary key autoincrement, user_id integer not null references users(id),
  booking_id integer references bookings(id) on delete set null, rating integer not null check (rating between 1 and 5),
  comment text not null, created_at text not null default current_timestamp);
create unique index if not exists idx_feedback_booking on feedback(booking_id) where booking_id is not null`);
if (!db.prepare("select 1 from users where role='admin'").get()) {
  db.prepare("insert into users(username,age,mobile,password_hash,role,email) values('admin',30,'01700000000',?,'admin',?)")
    .run(bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10), process.env.ADMIN_EMAIL || null);
}
module.exports = db;
