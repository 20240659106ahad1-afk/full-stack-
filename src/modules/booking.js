const r = require('express').Router(), db = require('../db'), crypto = require('crypto');
const { send } = require('../mailer'), { auth } = require('../middleware/auth'), { BOOKINGS, withMeals } = require('../queries'), { okDate, left, booked } = require('../seats');
const departures = require('../departures');
const food = require('../food');
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
  const departureTime = departures.isAvailable(b.departure_time) ? b.departure_time : null;
  const seats = date ? left(t, date, departureTime) : t.capacity;
  if (persons > seats) throw bad(seats ? `Only ${seats} seats are left on this vehicle for that date` : 'This vehicle is full on that date. Pick another date or vehicle');
  const fareBasePerPerson = Math.max(route.distance_km, t.cost_per_person);
  const acSurchargePerSeat = transportType === 'ac' ? Math.ceil(fareBasePerPerson * 0.5) : 0;
  const oneWayFarePerPerson = fareBasePerPerson + acSurchargePerSeat;
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
  const portions = plan.map((day, index) => Object.fromEntries(mealTypes.map(type => {
    if (!day[type]) return [type, 0];
    const raw = b.meal_plan?.[index]?.[`${type}_persons`];
    const count = raw === undefined ? persons : Number(raw);
    if (!Number.isInteger(count) || count < 1 || count > persons) {
      throw bad(`The number of people eating ${type} must be a whole number from 1 to ${persons}`);
    }
    return [type, count];
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
  let selectedMeals = plan.flatMap((day, index) => mealTypes.flatMap(type => {
    const item = (type === 'snacks' ? snackItems : mealItems).find(x => x.id === day[type]);
    return item ? [{ day: index + 1, type, id: item.id, name: item.name, price: item.price,
      persons: portions[index][type] }] : [];
  }));
  let mealBreakdown = Object.fromEntries(mealTypes.map(type => [
    type,
    selectedMeals.filter(item => item.type === type).reduce((sum, item) => sum + item.price * item.persons, 0),
  ]));
  let mealPersonCounts = Object.fromEntries(mealTypes.map(type => [
    type,
    selectedMeals.filter(item => item.type === type).reduce((sum, item) => sum + item.persons, 0),
  ]));
  let mealDays = plan.filter(day => mealTypes.some(type => day[type])).length;
  if (Array.isArray(b.food_orders)) {
    selectedMeals = food.validateOrders(packageId, persons, nights, b.food_orders);
    mealBreakdown = Object.fromEntries(food.TYPES.map(type => [
      type, selectedMeals.filter(item => item.meal_type === type).reduce((sum, item) => sum + item.price * item.quantity, 0),
    ]));
    mealPersonCounts = Object.fromEntries(food.TYPES.map(type => [
      type, new Set(selectedMeals.filter(item => item.meal_type === type).map(item => item.person_number)).size,
    ]));
    mealDays = new Set(selectedMeals.map(item => item.day)).size;
  }
  const hotel = Math.ceil(persons / room.capacity) * room.price_per_night * nights;
  const meal = Object.values(mealBreakdown).reduce((sum, value) => sum + value, 0);
  const total = transport + hotel + meal, discount = total >= 5000 ? total * 0.3 : 0;
  return {
    distanceKm: route.distance_km, fareBasePerPerson, finalStop: finalStop.stop_name, oneWayFarePerPerson, acSurchargePerSeat, transport,
    hotel, meal, mealBreakdown, mealPersonCounts, selectedMeals, mealDays,
    total, discount, final_total: total - discount, persons, nights, seats_left: seats, plan,
  };
}

r.post('/quote', (q, res) => res.json(price(q.body)));

r.get('/availability', (q, res) => {
  if (!okDate(q.query.date)) throw bad('Choose a travel date from today onward');
  const departureTime = q.query.departure_time || null;
  if (departureTime && !departures.isAvailable(departureTime)) throw bad('Choose a departure time from the available schedule');
  res.json(db.prepare('select * from transports').all().map(t => ({
    id: t.id, capacity: t.capacity,
    left: left(t, q.query.date, departureTime),
    booked_seats: departureTime ? booked(t, q.query.date, departureTime) : [],
  })));
});

r.post('/', auth, (q, res) => {
  const b = q.body;
  if (!okDate(b.travel_date)) throw bad('Choose a travel date from today onward');
  if (typeof b.departure_time !== 'string' || !departures.isAvailable(b.departure_time)) throw bad('Choose a departure time from the available schedule');
  const p = price(b);
  const seatNumbers = b.seat_numbers;
  const transport = db.prepare('select capacity from transports where id = ?').get(b.transport_id);
  if (!Array.isArray(seatNumbers) || seatNumbers.length !== p.persons
    || seatNumbers.some(number => !Number.isInteger(number) || number < 1 || number > transport.capacity)
    || new Set(seatNumbers).size !== seatNumbers.length) {
    throw bad('Select a different seat for each traveller');
  }
  try {
    const row = db.transaction(() => {
      const transport = db.prepare('select * from transports where id = ?').get(b.transport_id);
      const occupied = new Set(booked(transport, b.travel_date, b.departure_time));
      if (seatNumbers.some(number => occupied.has(number))) throw bad('One or more selected seats were just booked. Choose available seats and try again');
      let code;
      do code = 'CUST' + crypto.randomInt(100000, 999999);
      while (db.prepare('select 1 from bookings where customer_code = ?').get(code));
      const i = db.prepare(`insert into bookings(customer_code,user_id,start_district_id,destination_division_id,package_id,
        transport_id,transport_persons,room_id,hotel_persons,nights,meal_persons,meal_days,
        distance_km,transport_cost,hotel_cost,meal_cost,total,discount,final_total,travel_date,departure_time) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, q.user.id, b.start_district_id, b.destination_division_id, b.package_id || null,
          b.transport_id, p.persons, b.room_id, p.persons, p.nights, p.persons, p.mealDays,
          p.distanceKm, p.transport, p.hotel, p.meal, p.total, p.discount, p.final_total, b.travel_date, b.departure_time);
      const saveMeal = db.prepare('insert into booking_meal_selections(booking_id,day,meal_type,meal_item_id,persons) values(?,?,?,?,?)');
      const saveSnack = db.prepare('insert into booking_snack_selections(booking_id,day,snack_item_id,persons) values(?,?,?,?)');
      const saveFood = db.prepare(`insert into booking_food_orders(
        booking_id,day,meal_type,person_number,restaurant_id,menu_item_id,quantity) values(?,?,?,?,?,?,?)`);
      p.selectedMeals.forEach(item => {
        if (item.restaurant_id) saveFood.run(i.lastInsertRowid, item.day, item.meal_type, item.person_number,
          item.restaurant_id, item.menu_item_id, item.quantity);
        else if (item.type === 'snacks') saveSnack.run(i.lastInsertRowid, item.day, item.id, item.persons);
        else saveMeal.run(i.lastInsertRowid, item.day, item.type, item.id, item.persons);
      });
      const saveSeat = db.prepare('insert into booking_seats(booking_id,seat_number) values(?,?)');
      seatNumbers.forEach(number => saveSeat.run(i.lastInsertRowid, number));
      return { id: i.lastInsertRowid, customer_code: code };
    })();
    res.status(201).json(row);
  } catch (error) {
    if (error.status) throw error;
    console.error('Could not save booking:', error);
    throw Object.assign(new Error('Could not save this booking. Please check your details and try again.'), { status: 500 });
  }
});

r.get('/preferences', auth, (q, res) => res.json(food.preferences(q.user.id)));
r.put('/preferences', auth, (q, res) => res.json(food.savePreferences(q.user.id, q.body)));

r.put('/:id/food', auth, (q, res) => {
  const booking = db.prepare("select * from bookings where id = ? and user_id = ? and status != 'cancelled'")
    .get(q.params.id, q.user.id);
  if (!booking) throw bad('Booking not found or cancelled');
  const orders = food.validateOrders(booking.package_id, booking.transport_persons, booking.nights, q.body?.food_orders);
  const mealCost = orders.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = booking.total - booking.meal_cost + mealCost;
  const discount = total >= 5000 ? total * 0.3 : 0;
  const finalTotal = total - discount;
  db.transaction(() => {
    db.prepare('delete from booking_food_orders where booking_id = ?').run(booking.id);
    db.prepare('delete from booking_meal_selections where booking_id = ?').run(booking.id);
    db.prepare('delete from booking_snack_selections where booking_id = ?').run(booking.id);
    db.prepare('delete from booking_meals where booking_id = ?').run(booking.id);
    db.prepare('delete from booking_meal_days where booking_id = ?').run(booking.id);
    const save = db.prepare(`insert into booking_food_orders(
      booking_id,day,meal_type,person_number,restaurant_id,menu_item_id,quantity) values(?,?,?,?,?,?,?)`);
    orders.forEach(item => save.run(booking.id, item.day, item.meal_type, item.person_number,
      item.restaurant_id, item.menu_item_id, item.quantity));
    db.prepare(`update bookings set meal_cost=?,total=?,discount=?,final_total=? where id=?`)
      .run(mealCost, total, discount, finalTotal, booking.id);
    db.prepare(`update payments set remaining=max(0, ? - advance) where booking_id=?`)
      .run(finalTotal, booking.id);
  })();
  const updated = withMeals(db.prepare(BOOKINGS + ' where b.id = ?').all(booking.id))[0];
  res.json({ ok: true, booking: updated });
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
