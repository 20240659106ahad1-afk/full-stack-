const r = require('express').Router(), db = require('../db'), otp = require('../otp'), { send } = require('../mailer'), { auth } = require('../middleware/auth');
const { BOOKINGS, withMeals } = require('../queries');
const { okDate, left, booked } = require('../seats');
const { randomBytes, createHmac } = require('node:crypto');
const bad = m => Object.assign(new Error(m), { status: 400 });
const paymentDetails = body => {
  const { method } = body || {};
  if (!['Bkash', 'Nagad', 'Rocket', 'Bank'].includes(method)) throw bad('Choose a payment method');
  const account = String(body?.account || '').replace(/[\s-]/g, '');
  const valid = method === 'Bank' ? /^\d{6,24}$/.test(account) : /^01[3-9]\d{8}$/.test(account);
  if (!valid) throw bad(method === 'Bank'
    ? 'Enter a valid bank account number using 6 to 24 digits'
    : 'Enter a valid Bangladesh mobile wallet number, such as 01XXXXXXXXX');
  return { method, account };
};
const paymentOtpKey = (id, method, account) =>
  `pay:${id}:${createHmac('sha256', process.env.JWT_SECRET || 'dev').update(`${method}:${account}`).digest('hex')}`;
const pending = async q => {
  const b = await db.prepare("select * from bookings where id=? and user_id=? and status='pending'").get(q.params.id, q.user.id);
  if (!b) throw bad('Booking not found or already paid');
  return b;
};

// Step 1: email a 6-digit code to the account's email address.
r.post('/:id/otp', auth, async (q, res, next) => {
  try {
    const b = await pending(q), u = await db.prepare('select email from users where id = ?').get(q.user.id);
    const { method, account } = paymentDetails(q.body);
    if (!u.email) throw bad('Add your email in Profile first');
    const recent = await db.prepare('select created_at from otps where key like ? order by created_at desc limit 1')
      .get(`pay:${b.id}:%`);
    if (recent && Date.now() - recent.created_at < 60000) throw bad('Wait a minute before asking for a new code');
    await otp.issue(paymentOtpKey(b.id, method, account), u.email, 'Your payment code');
    res.json({ sent_to: u.email.replace(/(.).+(@.+)/, '$1***$2'), expires_in: 300 });
  } catch (e) { next(e); }
});

// Demo only: no real payment is processed or verified.
r.post('/:id', auth, async (q, res) => {
  const { method, account } = paymentDetails(q.body), { otp: code } = q.body, b = await pending(q);
  await otp.check(paymentOtpKey(b.id, method, account), code);
  const transaction_id = 'TEST-' + randomBytes(10).toString('hex').toUpperCase();
  const { advance, remaining } = await db.transaction(async () => {
    const stillPending = await db.prepare("select * from bookings where id=? and user_id=? and status='pending' for update")
      .get(b.id, q.user.id);
    if (!stillPending) throw bad('Booking not found or already paid');
    if (!okDate(stillPending.travel_date)) throw bad('This booking has no valid travel date. Please cancel it and book again');
    const transport = await db.prepare('select * from transports where id=?').get(stillPending.transport_id);
    await db.lock(`${stillPending.transport_id}:${stillPending.travel_date}:${stillPending.departure_time || ''}`);
    const selected = await db.prepare('select seat_number from booking_seats where booking_id=?').all(stillPending.id);
    const occupied = new Set(await booked(transport, stillPending.travel_date, stillPending.departure_time, stillPending.id));
    if (stillPending.transport_persons > await left(transport, stillPending.travel_date, stillPending.departure_time, stillPending.id)
      || selected.some(seat => occupied.has(seat.seat_number))) {
      throw bad('Those seats were taken by someone else. Please edit your booking or choose another date');
    }
    const advance = Math.round(stillPending.final_total * 50) / 100;
    const remaining = stillPending.final_total - advance;
    await db.prepare('insert into payments(booking_id,method,transaction_id,advance,remaining) values(?,?,?,?,?)')
      .run(stillPending.id, method, transaction_id, advance, remaining);
    await db.prepare("update bookings set status='confirmed' where id=?").run(stillPending.id);
    return { advance, remaining };
  })();
  const confirmed = (await withMeals(await db.prepare(BOOKINGS + ' where b.id = ?').all(b.id)))[0];
  let email_sent = false;
  try {
    await send(confirmed.email, `Booking confirmed - ${confirmed.customer_code}`,
      `Hello ${confirmed.username},\n\nYour booking is confirmed.\n\n` +
      `Booking reference: ${confirmed.customer_code}\nTrip: ${confirmed.package || confirmed.division}\n` +
      `Route: ${confirmed.start_district} to ${confirmed.division}\nTravel date: ${confirmed.travel_date}\n` +
      `Transport departure time: ${confirmed.departure_time || 'Not set'}\n` +
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
