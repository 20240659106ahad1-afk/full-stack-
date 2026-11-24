const db = require('./db');
exports.today = () => new Date().toLocaleDateString('en-CA');
exports.okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(new Date(d)) && d >= exports.today();
// Seats held by confirmed bookings, plus unpaid bookings made in the last 30 minutes.
const activeBookings = async (tid, date, time, except = 0) => db.prepare(`select b.id, b.transport_persons, s.seat_number from bookings b
  left join booking_seats s on s.booking_id = b.id
  where b.transport_id = ? and b.travel_date = ? and (cast(? as text) is null or b.departure_time = ? or b.departure_time is null) and b.id <> ?
  and (b.status = 'confirmed' or (b.status = 'pending' and b.created_at > CURRENT_TIMESTAMP - interval '30 minutes'))
  order by b.id`).all(tid, date, time, time, except);
const taken = async (tid, date, time, except = 0) => db.prepare(`select coalesce(sum(transport_persons),0) n from bookings
  where transport_id = ? and travel_date = ? and (cast(? as text) is null or departure_time = ? or departure_time is null) and id <> ?
  and (status = 'confirmed' or (status = 'pending' and created_at > CURRENT_TIMESTAMP - interval '30 minutes'))`
).get(tid, date, time, time, except);

exports.booked = async (t, date, time, except = 0) => {
  const rows = await activeBookings(t.id, date, time, except);
  const occupied = new Set(), legacy = new Map();
  for (const row of rows) {
    if (row.seat_number !== null) occupied.add(row.seat_number);
    else legacy.set(row.id, row.transport_persons);
  }
  for (let remaining of legacy.values()) {
    while (remaining > 0) {
      let seat = 1;
      while (seat <= t.capacity && occupied.has(seat)) seat++;
      if (seat > t.capacity) break;
      occupied.add(seat);
      remaining--;
    }
  }
  return [...occupied].filter(number => number >= 1 && number <= t.capacity).sort((a, b) => a - b);
};
exports.left = async (t, date, time = null, except = 0) => {
  const used = time
    ? (await exports.booked(t, date, time, except)).length
    : (await taken(t.id, date, null, except)).n;
  return Math.max(0, t.capacity - used);
};
