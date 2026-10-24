const jwt = require('jsonwebtoken'), db = require('../db');
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('Set JWT_SECRET');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
exports.sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
exports.setCookie = (res, token) => res.cookie('token', token, {
  httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5 });
exports.auth = (req, res, next) => {
  try {
    const { id } = jwt.verify(req.cookies.token, SECRET);
    const u = db.prepare('select id, username, role from users where id = ?').get(id);
    if (!u) throw 0;
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
};
exports.allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have access' });
