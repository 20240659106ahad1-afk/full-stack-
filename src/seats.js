const db = require('./db');
exports.today = () => new Date().toLocaleDateString('en-CA');
exports.okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(new Date(d)) && d >= exports.today();
// Seats held by confirmed bookings, plus unpaid bookings made in the last 30 minutes.
const taken = (tid, date, except = 0) => db.prepare(`select coalesce(sum(transport_persons),0) n from bookings
  where transport_id = ? and travel_date = ? and id <> ? and (status = 'confirmed'
  or (status = 'pending' and created_at > datetime('now','-30 minutes')))`).get(tid, date, except).n;
exports.left = (t, date, except = 0) => Math.max(0, t.capacity - taken(t.id, date, except));
