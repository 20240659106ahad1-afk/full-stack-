const r = require('express').Router(), db = require('../db');
const { auth, allow } = require('../middleware/auth'), { BOOKINGS, withMeals } = require('../queries');
const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
r.use(auth, allow('admin', 'moderator'));

r.get('/bookings', (q, res) => res.json(withMeals(db.prepare(BOOKINGS + ' order by b.id desc').all())));
r.get('/users', allow('admin'), (q, res) => res.json(db.prepare('select id, username, email, mobile, role from users order by id').all()));
r.patch('/users/:id/role', allow('admin'), (q, res) => {
  if (!['customer', 'moderator', 'admin'].includes(q.body.role)) throw bad('Invalid role');
  if (+q.params.id === q.user.id) throw bad("You can't change your own role");
  db.prepare('update users set role = ? where id = ?').run(q.body.role, q.params.id);
  res.json({ ok: true });
});

r.get('/feedback', (q, res) => res.json(db.prepare(`select f.id, f.rating, f.comment, f.created_at, u.username, b.customer_code from feedback f
  join users u on u.id = f.user_id left join bookings b on b.id = f.booking_id order by f.id desc`).all()));

// Catalog management (admin only): transports, hotel rooms, and individual meals
const cols = {
  transports: ['name', 'type', 'route', 'capacity', 'cost_per_person'],
  hotel_rooms: ['room_type', 'price_per_night', 'capacity', 'bed_count'],
  meal_items: ['meal_type', 'name', 'price', 'image_url'],
  snack_items: ['name', 'price', 'image_url'],
  route_distances: ['start_district_id', 'package_id', 'distance_km'],
};
const NUM = ['capacity', 'bed_count', 'cost_per_person', 'price_per_night', 'price', 'distance_km'];
const values = (t, b, id) => cols[t].map(c => {
  const raw = b[c];
  if (t === 'transports' && c === 'cost_per_person' && raw === undefined) {
    return id ? db.prepare('select cost_per_person from transports where id = ?').get(id)?.cost_per_person ?? 0 : 0;
  }
  if (raw === undefined || raw === null || String(raw).trim() === '') throw bad(`${c.replace(/_/g, ' ')} is required`);
  if (['start_district_id', 'package_id'].includes(c) && (!Number.isInteger(Number(raw)) || Number(raw) < 1)) {
    throw bad(`${c.replace(/_/g, ' ')} must be a valid selection`);
  }
  if (c === 'image_url') {
    const image = String(raw).trim();
    if (!/^\/images\/(?!.*\.\.)[a-z0-9._/-]+\.(?:jpe?g|png|webp|gif|svg)$/i.test(image)
      && !/^https:\/\/\S+$/i.test(image)) throw bad('Image must be a local /images/ path or an https URL');
    return image;
  }
  if (!NUM.includes(c)) return String(raw).trim();
  const number = Number(raw);
  const positiveInteger = ['capacity', 'bed_count'].includes(c);
  if (!Number.isFinite(number) || (positiveInteger && (!Number.isInteger(number) || number < 1))
    || (c === 'distance_km' ? number <= 0 : !positiveInteger && number < 0)) {
    throw bad(`${c.replace(/_/g, ' ')} must be ${positiveInteger ? 'a positive whole' : c === 'distance_km' ? 'a positive' : 'a non-negative'} number`);
  }
  return number;
});
const inUse = () => bad('It is in use and cannot be deleted. Edit it instead', 409);
const del = t => (q, res) => {
  try { db.prepare(`delete from ${t} where id = ?`).run(q.params.id); res.json({ ok: true }); } catch { throw inUse(); }
};

for (const t in cols) {
  r.post('/catalog/' + t, allow('admin'), (q, res) => {
    const v = values(t, q.body);
    try { res.status(201).json({ id: db.prepare(`insert into ${t}(${cols[t]}) values(${cols[t].map(() => '?')})`).run(...v).lastInsertRowid }); }
    catch { throw bad('Check the values. This entry may already exist, or capacity may be 0'); }
  });
  r.put('/catalog/' + t + '/:id', allow('admin'), (q, res) => {
    const v = values(t, q.body, q.params.id);
    try {
      const result = db.prepare(`update ${t} set ${cols[t].map(c => c + '=?')} where id=?`).run(...v, q.params.id);
      if (result.changes !== 1) throw bad('This catalog entry no longer exists. Reload the page and try again', 404);
      res.json({ ok: true });
    } catch (error) {
      if (error.status) throw error;
      console.error(`Failed to update ${t} catalog entry ${q.params.id}:`, error);
      throw bad('Could not save this catalog entry. Check for duplicate values and try again');
    }
  });
  r.delete('/catalog/' + t + '/:id', allow('admin'), del(t));
}

const savePackage = (q, res, id) => {
  const b = q.body, name = String(b.name || '').trim();
  const stops = String(b.stops || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!name || !b.division_id || !stops.length) throw bad('Name, division and at least one stop are required');
  try {
    const out = db.transaction(() => {
      if (id) {
        db.prepare('update packages set division_id=?, name=?, best_for=? where id=?').run(b.division_id, name, b.best_for || '', id);
        db.prepare('delete from package_stops where package_id = ?').run(id);
      } else id = db.prepare('insert into packages(division_id,name,best_for) values(?,?,?)').run(b.division_id, name, b.best_for || '').lastInsertRowid;
      stops.forEach((s, i) => db.prepare('insert into package_stops(package_id,stop_order,stop_name) values(?,?,?)').run(id, i + 1, s));
      return id;
    })();
    res.json({ id: out });
  } catch { throw bad('Check the values. A package with this name may already exist'); }
};
r.post('/catalog/packages', allow('admin'), (q, res) => savePackage(q, res));
r.put('/catalog/packages/:id', allow('admin'), (q, res) => savePackage(q, res, +q.params.id));
r.delete('/catalog/packages/:id', allow('admin'), del('packages'));
module.exports = r;
