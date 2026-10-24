const r = require('express').Router(), bcrypt = require('bcryptjs'), db = require('../db'), otp = require('../otp'), pw = require('../password');
const { send } = require('../mailer');
const { sign, setCookie, auth } = require('../middleware/auth');
const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
const pub = u => ({ id: u.id, username: u.username, role: u.role });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/, MOBILE = /^01\d{9}$/, USER = /^\w{3,20}$/;
const notify = (email, how) => email && send(email, 'Your password was changed', `Your Travel Bangladesh password was changed ${how}. If this was not you, reset your password right away.`).catch(e => console.error('Mail error:', e.message));
const mail = v => String(v || '').trim().toLowerCase();
const dup = () => bad('This email or mobile number is already used by another account', 409);

r.get('/username-available', (q, res) => {
  const u = String(q.query.u || '');
  res.json({ valid: USER.test(u), available: !db.prepare('select 1 from users where lower(username) = lower(?)').get(u) });
});

r.post('/register', (q, res) => {
  const { username, age, mobile, password } = q.body, email = mail(q.body.email);
  if (!USER.test(username || '')) throw bad('Username must be 3-20 letters, numbers or underscore');
  if (!EMAIL.test(email)) throw bad('Enter a valid email. Payment codes are sent there');
  if (!MOBILE.test(mobile || '')) throw bad('Mobile must look like 01XXXXXXXXX');
  const weak = pw.problem(password, username); if (weak) throw bad(weak);
  if (db.prepare('select 1 from users where lower(username) = lower(?)').get(username)) throw bad('This username is already taken. Please choose another one', 409);
  try {
    const i = db.prepare('insert into users(username,age,mobile,email,password_hash) values(?,?,?,?,?)')
      .run(username, +age || null, mobile, email, bcrypt.hashSync(password, 10));
    const u = { id: i.lastInsertRowid, username, role: 'customer' };
    setCookie(res, sign(u)); res.status(201).json(pub(u));
  } catch { throw dup(); }
});

r.post('/login', (q, res) => {
  const u = db.prepare('select * from users where username = ?').get(q.body.username || '');
  if (!u || !bcrypt.compareSync(q.body.password || '', u.password_hash))
    return res.status(401).json({ error: 'Wrong username or password' });
  setCookie(res, sign(u)); res.json(pub(u));
});

r.post('/logout', (q, res) => res.clearCookie('token').json({ ok: true }));
r.get('/me', auth, (q, res) => res.json(q.user));

r.get('/profile', auth, (q, res) =>
  res.json(db.prepare('select username, email, mobile, age from users where id = ?').get(q.user.id)));

r.patch('/profile', auth, (q, res) => {
  const email = mail(q.body.email), cur = db.prepare('select * from users where id = ?').get(q.user.id);
  if (!EMAIL.test(email) || !MOBILE.test(q.body.mobile || '')) throw bad('Enter a valid email and a mobile like 01XXXXXXXXX');
  if (email !== cur.email && !bcrypt.compareSync(q.body.password || '', cur.password_hash))
    throw bad('Enter your current password to change your email');
  try { db.prepare('update users set email=?, mobile=?, age=? where id=?').run(email, q.body.mobile, +q.body.age || null, cur.id); }
  catch { throw dup(); }
  res.json({ ok: true });
});

r.post('/change-password', auth, (q, res) => {
  const u = db.prepare('select * from users where id = ?').get(q.user.id);
  if (!bcrypt.compareSync(q.body.old_password || '', u.password_hash)) throw bad('Old password is wrong');
  const weak = pw.problem(q.body.new_password, u.username); if (weak) throw bad(weak);
  db.prepare('update users set password_hash = ? where id = ?').run(bcrypt.hashSync(q.body.new_password, 10), u.id);
  notify(u.email, 'from your profile');
  res.json({ ok: true });
});

// Always answers "ok" so nobody can use this form to find out which emails have accounts.
r.post('/forgot', async (q, res, next) => {
  try {
    const email = mail(q.body.email), u = db.prepare('select id from users where email = ?').get(email);
    if (u) await otp.issue('reset:' + u.id, email, 'Your password reset code').catch(e => console.error(e.message));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/reset', (q, res) => {
  const u = db.prepare('select id, username from users where email = ?').get(mail(q.body.email));
  if (!u) throw bad('Wrong code');
  const weak = pw.problem(q.body.new_password, u.username); if (weak) throw bad(weak);
  otp.check('reset:' + u.id, q.body.code);
  db.prepare('update users set password_hash = ? where id = ?').run(bcrypt.hashSync(q.body.new_password, 10), u.id);
  notify(mail(q.body.email), 'with a reset code');
  res.json({ ok: true });
});
module.exports = r;
