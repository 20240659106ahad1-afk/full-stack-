const r = require('express').Router(), db = require('../db'), crypto = require('crypto');
const { send } = require('../mailer'), { auth } = require('../middleware/auth'), { BOOKINGS, withMeals } = require('../queries'), { okDate, left } = require('../seats');
const bad = m => Object.assign(new Error(m), { status: 400 });

// Prices and seat counts are worked out here on the server, never trusted from the browser.
function price(b) {
  const persons = +b.persons, nights = +b.nights, date = b.travel_date || null;
  if (!Number.isInteger(persons) || !Number.isInteger(nights) || persons < 1 || nights < 1) throw bad('Travellers and nights must be whole numbers, at least 1');
  if (date && !okDate(date)) throw bad('Choose a travel date from today onward');
  const startDistrictId = Number(b.start_district_id), destinationDivisionId = Number(b.destination_division_id);
  const packageId = Number(b.package_id);
  const startDistrict = db.prepare('select id from districts where id = ?').get(startDistrictId);
  const selectedPackage = db.prepare('select id, division_id from packages where id = ?').get(packageId);
  if (!startDistrict || !selectedPackage || selectedPackage.division_id !== destinationDivisionId) {
    throw bad('Choose a valid starting district, destination and tour package');
  }
  const finalStop = db.prepare('select stop_name from package_stops where package_id = ? order by stop_order desc limit 1').get(packageId);
  if (!finalStop) throw bad('This tour package has no final stop configured');
  const route = db.prepare('select distance_km from route_distances where start_district_id = ? and package_id = ?')
    .get(startDistrictId, packageId);
  if (!route) throw bad('The distance for this route is not set yet. Please ask an administrator to add it.');
  const t = db.prepare('select * from transports where id = ?').get(b.transport_id);
  const room = db.prepare('select * from hotel_rooms where id = ?').get(b.room_id);
  if (!t || !room) throw bad('Choose a transport and a hotel room');
  const transportType = String(t.type).trim().toLowerCase();
  if (!['ac', 'non-ac'].includes(transportType)) throw bad('This transport must be marked AC or Non-AC in the catalog');
  const seats = date ? left(t, date) : t.capacity;
  if (persons > seats) throw bad(seats ? `Only ${seats} seats are left on this vehicle for that date` : 'This vehicle is full on that date. Pick another date or vehicle');
  const acSurchargePerSeat = transportType === 'ac' ? 20 : 0;
  const oneWayFarePerPerson = route.distance_km * 1 + acSurchargePerSeat;
  const transport = oneWayFarePerPerson * persons;
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const plan = Array.from({ length: Math.min(nights, 7) }, (_, day) =>
    Object.fromEntries(mealTypes.map(type => {
      const raw = b.meal_plan?.[day]?.[type];
      if (raw === undefined || raw === null || raw === '') return [type, null];
      const id = Number(raw);
      if (!Number.isInteger(id) || id < 1) throw bad(`Choose a valid ${type} item`);
      return [type, id];
    })));
  const mealIds = [...new Set(plan.flatMap(day => mealTypes.slice(0, 3).map(type => day[type]).filter(Boolean)))];
  const snackIds = [...new Set(plan.map(day => day.snacks).filter(Boolean))];
  const mealItems = mealIds.length
    ? db.prepare(`select id, meal_type, name, price, image_url from meal_items where id in (${mealIds.map(() => '?').join()})`).all(...mealIds)
    : [];
  const snackItems = snackIds.length
    ? db.prepare(`select id, name, price, image_url from snack_items where id in (${snackIds.map(() => '?').join()})`).all(...snackIds)
    : [];
  if (mealItems.length !== mealIds.length || snackItems.length !== snackIds.length || mealItems.some(item => plan.some(day =>
    mealTypes.slice(0, 3).some(type => day[type] === item.id && type !== item.meal_type)))) {
    throw bad('One of the selected meal items is invalid');
  }
  const selectedMeals = plan.flatMap((day, index) => mealTypes.flatMap(type => {
    const item = (type === 'snacks' ? snackItems : mealItems).find(x => x.id === day[type]);
    return item ? [{ day: index + 1, type, id: item.id, name: item.name, price: item.price }] : [];
  }));
  const mealBreakdown = Object.fromEntries(mealTypes.map(type => [
    type,
    selectedMeals.filter(item => item.type === type).reduce((sum, item) => sum + item.price, 0) * persons,
  ]));
  const hotel = Math.ceil(persons / room.capacity) * room.price_per_night * nights;
  const meal = Object.values(mealBreakdown).reduce((sum, value) => sum + value, 0);
  const total = transport + hotel + meal, discount = total >= 5000 ? total * 0.3 : 0;
  return {
    distanceKm: route.distance_km, finalStop: finalStop.stop_name, oneWayFarePerPerson, acSurchargePerSeat, transport,
    hotel, meal, mealBreakdown, selectedMeals, mealDays: plan.filter(day => mealTypes.some(type => day[type])).length,
    total, discount, final_total: total - discount, persons, nights, seats_left: seats, plan,
  };
}

r.post('/quote', (q, res) => res.json(price(q.body)));

r.get('/availability', (q, res) => {
  if (!okDate(q.query.date)) throw bad('Choose a travel date from today onward');
  res.json(db.prepare('select * from transports').all().map(t => ({ id: t.id, capacity: t.capacity, left: left(t, q.query.date) })));
});

r.post('/', auth, (q, res) => {
  const b = q.body;
  if (!okDate(b.travel_date)) throw bad('Choose a travel date from today onward');
  const p = price(b);
  try {
    const row = db.transaction(() => {
      let code;
      do code = 'CUST' + crypto.randomInt(100000, 999999);
      while (db.prepare('select 1 from bookings where customer_code = ?').get(code));
      const i = db.prepare(`insert into bookings(customer_code,user_id,start_district_id,destination_division_id,package_id,
        transport_id,transport_persons,room_id,hotel_persons,nights,meal_persons,meal_days,
        distance_km,transport_cost,hotel_cost,meal_cost,total,discount,final_total,travel_date) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, q.user.id, b.start_district_id, b.destination_division_id, b.package_id || null,
          b.transport_id, p.persons, b.room_id, p.persons, p.nights, p.persons, p.mealDays,
          p.distanceKm, p.transport, p.hotel, p.meal, p.total, p.discount, p.final_total, b.travel_date);
      const saveMeal = db.prepare('insert into booking_meal_selections(booking_id,day,meal_type,meal_item_id) values(?,?,?,?)');
      const saveSnack = db.prepare('insert into booking_snack_selections(booking_id,day,snack_item_id) values(?,?,?)');
      p.selectedMeals.forEach(item => {
        if (item.type === 'snacks') saveSnack.run(i.lastInsertRowid, item.day, item.id);
        else saveMeal.run(i.lastInsertRowid, item.day, item.type, item.id);
      });
      return { id: i.lastInsertRowid, customer_code: code };
    })();
    res.status(201).json(row);
  } catch { throw bad('Please check your starting place, destination and package'); }
});

// Refund policy: 7+ days before travel 80% of the advance, 2-6 days 50%, less than 2 days nothing.
function refundFor(b) {
  if (b.status !== 'confirmed') return 0;
  const days = Math.ceil((new Date(b.travel_date) - new Date(new Date().toDateString())) / 864e5);
  if (days < 0) throw bad('This trip has already started, so it cannot be cancelled');
  return Math.round(b.advance * (days >= 7 ? 0.8 : days >= 2 ? 0.5 : 0) * 100) / 100;
}

r.get('/mine', auth, (q, res) =>
  res.json(withMeals(db.prepare(BOOKINGS + ' where b.user_id = ? order by b.id desc').all(q.user.id)).map(b => {
    let refund_preview = 0; try { refund_preview = refundFor(b); } catch {}
    return { ...b, refund_preview };
  })));

r.delete('/:id', auth, (q, res) => {
  const b = db.prepare(BOOKINGS + ' where b.id = ? and b.user_id = ?').get(q.params.id, q.user.id);
  if (!b || b.status === 'cancelled') throw bad('Booking not found or already cancelled');
  const refund = refundFor(b);
  db.prepare("update bookings set status='cancelled', refund_amount=? where id=?").run(refund, b.id);
  if (b.email) send(b.email, `Booking ${b.customer_code} was cancelled`,
    `Hello ${b.username},\n\nYour booking ${b.customer_code} (${b.package || b.division}, travel date ${b.travel_date}) was cancelled.\n` +
    (b.advance ? (refund ? `A refund of ${refund} Tk will be returned to you.` : 'The cancellation was too late for a refund.') : 'No payment had been taken, so nothing is due.') +
    '\n\nTravel Bangladesh').catch(e => console.error('Mail error:', e.message));
  res.json({ refund });
});
module.exports = r;
