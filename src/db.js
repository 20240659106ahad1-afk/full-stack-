const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});
const transactionStorage = new AsyncLocalStorage();

function placeholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function query(sql, params = []) {
  const client = transactionStorage.getStore() || pool;
  return client.query(params.length ? placeholders(sql) : sql, params);
}

const db = {
  prepare(sql) {
    return {
      all: async (...params) => (await query(sql, params)).rows,
      get: async (...params) => (await query(sql, params)).rows[0],
      run: async (...params) => {
        const result = await query(sql, params);
        return {
          changes: result.rowCount,
          lastInsertRowid: result.rows[0]?.id,
          rows: result.rows,
        };
      },
    };
  },
  lock: key => query('select pg_advisory_xact_lock(hashtext(?))', [key]),
  exec: sql => query(sql),
  execScript: async sql => {
    let result;
    for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) {
      result = await query(statement);
    }
    return result;
  },
  transaction: fn => async (...args) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await transactionStorage.run(client, () => fn(...args));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  close: () => pool.end(),
};

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

async function seedRoutes() {
  const districts = await db.prepare(`select d.id, d.name, v.name division_name
    from districts d join divisions v on v.id=d.division_id`).all();
  const packages = await db.prepare('select id, name from packages').all();
  const capitals = ['Dhaka', 'Chattogram', 'Khulna', 'Rajshahi', 'Rangpur', 'Sylhet', 'Mymensingh'];
  const divisionCapital = {
    Barishal: null, Chattogram: 'Chattogram', Dhaka: 'Dhaka', Khulna: 'Khulna',
    Mymensingh: 'Mymensingh', Rajshahi: 'Rajshahi', Rangpur: 'Rangpur', Sylhet: 'Sylhet',
  };
  const rows = [];
  for (const item of packages) {
    const distances = packageDistances[item.name];
    if (!distances) continue;
    for (const district of districts) {
      let distance;
      if (district.division_name === 'Barishal') {
        distance = Math.round((distances[0] + distances[2]) / 2);
      } else {
        const index = capitals.indexOf(divisionCapital[district.division_name]);
        if (index < 0) throw new Error(`Could not find route reference for ${district.division_name}`);
        distance = distances[index];
      }
      rows.push([district.id, item.id, distance]);
    }
  }
  if (!rows.length) throw new Error('No route distance data was generated');
  const values = [], params = [];
  for (const row of rows) {
    const offset = params.length;
    values.push(`($${offset + 1},$${offset + 2},$${offset + 3})`);
    params.push(...row);
  }
  await query(`insert into route_distances(start_district_id,package_id,distance_km)
    values ${values.join(',')} on conflict(start_district_id,package_id) do nothing`, params);
}

async function seedFood() {
  const extras = [
    ['breakfast', 'Halwa Puri', 90, '/images/pexels-halwa-puri.jpg'],
    ['breakfast', 'Egg and Cheese Sandwich', 120, '/images/pexels-egg-cheese-sandwich.jpg'],
    ['lunch', 'Morog Polao', 280, '/images/pexels-morog-polao.jpg'],
    ['lunch', 'Beef Kala Bhuna with Rice', 320, '/images/pexels-kala-bhuna-rice.jpg'],
    ['dinner', 'Chicken Roast with Polao', 300, '/images/pexels-chicken-roast-polao.jpg'],
    ['dinner', 'Prawn Curry with Rice', 360, '/images/pexels-prawn-curry.jpg'],
  ];
  for (const [type, name, price, image] of extras) {
    await db.prepare(`insert into meal_items(meal_type,name,price,image_url) values(?,?,?,?)
      on conflict(meal_type,name) do nothing`).run(type, name, price, image);
  }
  const snacks = [
    ['Pizza', 180], ['Singara', 25], ['Vegetable Chop', 35], ['Chicken Roll', 80],
    ['Fuchka', 60], ['Chotpoti', 70], ['Jilapi', 40], ['Vegetable Pakora', 50],
    ['Grilled Chicken Sandwich', 140], ['Lemon Tea', 30],
  ];
  for (const [name, price] of snacks) {
    await db.prepare('insert into snack_items(name,price,image_url) values(?,?,?) on conflict(name) do nothing')
      .run(name, price, '/images/pexels-pizza.jpg');
  }
  const defaultPhotos = {
    breakfast: '/images/pexels-omelette-toast.jpg',
    lunch: '/images/pexels-chicken-curry-rice.jpg',
    dinner: '/images/pexels-chicken-curry-rice.jpg',
  };
  for (const [type, image] of Object.entries(defaultPhotos)) {
    await db.prepare("update meal_items set image_url=? where meal_type=? and image_url=''").run(image, type);
  }
  await db.prepare(`insert into restaurants(package_stop_id,name,description)
    select id, stop_name || ' Local Kitchen', 'Bangladeshi local favourites and fresh meals' from package_stops
    union all
    select id, stop_name || ' Family Restaurant', 'A comfortable stop for family meals and snacks' from package_stops
    on conflict(package_stop_id,name) do nothing`).run();
  const [stops, restaurants, meals, snackItems] = await Promise.all([
    db.prepare('select id, stop_name from package_stops order by id').all(),
    db.prepare('select id, package_stop_id, name from restaurants order by id').all(),
    db.prepare('select meal_type,name,price,image_url from meal_items order by meal_type,id').all(),
    db.prepare('select name,price,image_url from snack_items order by id').all(),
  ]);
  const stopIndex = new Map(stops.map((stop, index) => [stop.id, index]));
  for (const restaurant of restaurants) {
    const index = stopIndex.get(restaurant.package_stop_id);
    for (const type of ['breakfast', 'lunch', 'dinner', 'snacks']) {
      const categoryItems = type === 'snacks' ? snackItems : meals.filter(item => item.meal_type === type);
      const selectedItems = restaurant.name.endsWith(' Family Restaurant') && categoryItems.length > 1
        ? categoryItems.filter((_, itemIndex) => itemIndex % 2 === index % 2)
        : categoryItems;
      if (!selectedItems.length) continue;
      const params = [];
      const values = selectedItems.map(item => {
        const offset = params.length;
        params.push(restaurant.id, type, item.name, item.price, item.image_url);
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5})`;
      });
      await query(`insert into restaurant_menu_items(restaurant_id,meal_type,name,price,image_url)
        values ${values.join(',')} on conflict(restaurant_id,meal_type,name) do nothing`, params);
    }
  }
}

let initialization;
db.initialize = () => {
  if (initialization) return initialization;
  initialization = (async () => {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a PostgreSQL connection string');
    const root = path.join(__dirname, '..');
    await db.exec(`CREATE TABLE IF NOT EXISTS snack_items (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
      image_url TEXT NOT NULL DEFAULT ''
    )`);
    let schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8')
      .replace(/^\s*PRAGMA[^;]*;\s*/gim, '')
      .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
      .replace(/\bINTEGER\b/gi, 'BIGINT')
      .replace(/\bREAL\b/gi, 'DOUBLE PRECISION')
      .replace(/\b(created_at|paid_at)\s+TEXT\s+NOT NULL\s+DEFAULT CURRENT_TIMESTAMP/gi, '$1 TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await db.execScript(schema);
    await db.execScript(fs.readFileSync(path.join(root, 'postgres-schema.sql'), 'utf8'));

    const seedMarker = 'initial-catalog-and-restaurants-v1';
    if (!await db.prepare('select 1 from schema_migrations where name = ?').get(seedMarker)) {
      const seed = fs.readFileSync(path.join(root, 'seed.sql'), 'utf8')
        .replace(/^\s*PRAGMA[^;]*;\s*/gim, '')
        .replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, '');
      await db.transaction(async () => {
        for (const statement of seed.split(';').map(part => part.trim()).filter(Boolean)) {
          const sql = statement.replace(/^((?:--[^\n]*\n|\s)*)INSERT\s+OR\s+IGNORE\s+INTO/i, '$1INSERT INTO');
          await db.exec(/^\s*(?:--[^\n]*\n|\s)*INSERT\s+OR\s+IGNORE\s+INTO/i.test(statement)
            ? `${sql} ON CONFLICT DO NOTHING`
            : sql);
        }
        await seedRoutes();
        await seedFood();
        await db.prepare('insert into schema_migrations(name) values(?)').run(seedMarker);
      })();
    }
    const admin = await db.prepare("select 1 from users where role='admin'").get();
    if (!admin) {
      await db.prepare(`insert into users(username,age,mobile,password_hash,role,email)
        values('admin',30,'01700000000',?,'admin',?)`)
        .run(bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10), process.env.ADMIN_EMAIL || null);
    }
  })().catch(error => {
    initialization = null;
    throw error;
  });
  return initialization;
};

module.exports = db;
