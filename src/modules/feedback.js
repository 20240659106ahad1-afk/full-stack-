const r = require('express').Router(), db = require('../db'), { auth } = require('../middleware/auth');
const bad = m => Object.assign(new Error(m), { status: 400 });

// Public: average rating and the latest reviews (shown on the home page).
r.get('/', (q, res) => {
  const s = db.prepare('select count(*) n, coalesce(round(avg(rating), 1), 0) avg from feedback').get();
  res.json({ count: s.n, avg: s.avg, items: db.prepare(
    'select f.rating, f.comment, f.created_at, u.username from feedback f join users u on u.id = f.user_id order by f.id desc limit 6').all() });
});

r.get('/mine', auth, (q, res) => res.json(db.prepare(
  `select f.id, f.booking_id, f.rating, f.comment, f.created_at, b.customer_code from feedback f
   left join bookings b on b.id = f.booking_id where f.user_id = ? order by f.id desc`).all(q.user.id)));

r.post('/', auth, (q, res) => {
  const rating = Number(q.body.rating), comment = String(q.body.comment || '').trim(), bid = q.body.booking_id ? Number(q.body.booking_id) : null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw bad('Choose 1 to 5 stars');
  if (comment.length < 3 || comment.length > 500) throw bad('Write 3 to 500 characters');
  if (bid && !db.prepare('select 1 from bookings where id = ? and user_id = ?').get(bid, q.user.id)) throw bad('That booking is not yours');
  try { db.prepare('insert into feedback(user_id,booking_id,rating,comment) values(?,?,?,?)').run(q.user.id, bid, rating, comment); }
  catch { throw bad('You already left feedback for this booking'); }
  res.status(201).json({ ok: true });
});
module.exports = r;
