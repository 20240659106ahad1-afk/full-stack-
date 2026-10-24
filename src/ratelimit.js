const hits = new Map();
module.exports = (max, windowMs) => (q, res, next) => {
  const k = q.ip + q.originalUrl.split('?')[0], now = Date.now();
  const a = (hits.get(k) || []).filter(t => now - t < windowMs); a.push(now); hits.set(k, a);
  a.length > max ? res.status(429).json({ error: 'Too many tries. Please wait a minute and try again' }) : next();
};
