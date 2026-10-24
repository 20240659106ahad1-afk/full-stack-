const r = require('express').Router(), db = require('../db'), otp = require('../otp'), { send } = require('../mailer'), { auth } = require('../middleware/auth');
const { BOOKINGS, withMeals } = require('../queries');
const { okDate, left } = require('../seats');
const { randomBytes } = require('node:crypto');
const bad = m => Object.assign(new Error(m), { status: 400 });
const pending = q => {
  const b = db.prepare("select * from bookings where id=? and user_id=? and status='pending'").get(q.params.id, q.user.id);
  if (!b) throw bad('Booking not found or already paid');
  return b;
};

// Step 1: email a 6-digit code to the account's email address.
r.post('/:id/otp', auth, async (q, res, next) => {
  try {
    const b = pending(q), u = db.prepare('select email from users where id = ?').get(q.user.id);
    if (!u.email) throw bad('Add your email in Profile first');
    await otp.issue('pay:' + b.id, u.email, 'Your payment code');
    res.json({ sent_to: u.email.replace(/(.).+(@.+)/, '$1***$2'), expires_in: 300 });
  } catch (e) { next(e); }
});

// Demo only: no real payment is processed or verified.
r.post('/:id', auth, async (q, res) => {
  const { method, otp: code } = q.body, b = pending(q);
  if (!['Bkash', 'Nagad', 'Rocket', 'Bank'].includes(method)) throw bad('Choose a payment method');
  if (!okDate(b.travel_date)) throw bad('This booking has no valid travel date. Please cancel it and book again');
  const t = db.prepare('select * from transports where id = ?').get(b.transport_id);
  if (b.transport_persons > left(t, b.travel_date, b.id)) throw bad('Those seats were taken by someone else. Please cancel and book again');
  otp.check('pay:' + b.id, code);
  const transaction_id = 'TEST-' + randomBytes(10).toString('hex').toUpperCase();
  const advance = Math.round(b.final_total * 50) / 100, remaining = b.final_total - advance;
  db.transaction(() => {
    db.prepare('insert into payments(booking_id,method,transaction_id,advance,remaining) values(?,?,?,?,?)')
      .run(b.id, method, transaction_id, advance, remaining);
    db.prepare("update bookings set status='confirmed' where id=?").run(b.id);
  })();
  const confirmed = withMeals(db.prepare(BOOKINGS + ' where b.id = ?').all(b.id))[0];
  let email_sent = false;
  try {
    await send(confirmed.email, `Booking confirmed - ${confirmed.customer_code}`,
      `Hello ${confirmed.username},\n\nYour booking is confirmed.\n\n` +
      `Booking reference: ${confirmed.customer_code}\nTrip: ${confirmed.package || confirmed.division}\n` +
      `Route: ${confirmed.start_district} to ${confirmed.division}\nTravel date: ${confirmed.travel_date}\n` +
      `Travellers: ${confirmed.transport_persons}\nMeals: ${confirmed.meals.length ? confirmed.meals.join('; ') : 'None'}\n` +
      `Total: ${confirmed.final_total} Tk\nAdvance paid: ${advance} Tk\nRemaining due: ${remaining} Tk\n` +
      `Demo transaction ID: ${transaction_id}\n\nTravel Bangladesh`);
    email_sent = true;
  } catch (e) {
    console.error('Booking confirmation email error:', e.message);
  }
  res.json({
    advance, remaining, transaction_id, email_sent,
    sent_to: confirmed.email.replace(/(.).+(@.+)/, '$1***$2'),
  });
});
module.exports = r;
