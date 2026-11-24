const db = require('./db');
exports.BOOKINGS = `select b.*, u.username, u.mobile, u.email, p.name package, d.name division, sd.name start_district,
  t.name transport_name, t.type transport_type, hr.room_type, hr.bed_count, py.method, py.transaction_id, py.advance, py.remaining
  from bookings b join users u on u.id = b.user_id
  left join packages p on p.id = b.package_id
  left join divisions d on d.id = b.destination_division_id
  left join districts sd on sd.id = b.start_district_id
  left join transports t on t.id = b.transport_id
  left join hotel_rooms hr on hr.id = b.room_id
  left join payments py on py.booking_id = b.id`;
exports.withMeals = async rows => {
  const [packages, selections, snacks, seats, foodOrders] = await Promise.all([
    db.prepare('select md.booking_id, md.day, mp.name from booking_meal_days md join meal_packages mp on mp.id = md.package_id order by md.day').all(),
    db.prepare(`select s.booking_id, s.day, s.meal_type, s.persons, m.name from booking_meal_selections s
    join meal_items m on m.id = s.meal_item_id order by s.day, s.meal_type`).all(),
    db.prepare(`select s.booking_id, s.day, s.persons, i.name from booking_snack_selections s
    join snack_items i on i.id = s.snack_item_id order by s.day`).all(),
    db.prepare('select booking_id, seat_number from booking_seats order by seat_number').all(),
    db.prepare(`select o.booking_id, o.day, o.meal_type, o.person_number, o.quantity,
    o.restaurant_id, o.menu_item_id, m.name, m.price, r.name restaurant_name, s.stop_name
    from booking_food_orders o join restaurant_menu_items m on m.id = o.menu_item_id
    join restaurants r on r.id = o.restaurant_id join package_stops s on s.id = r.package_stop_id
    order by o.day, o.person_number, o.meal_type`).all(),
  ]);
  return rows.map(b => ({
    ...b,
    seat_numbers: seats.filter(x => x.booking_id === b.id).map(x => x.seat_number),
    food_orders: foodOrders.filter(x => x.booking_id === b.id),
    meals: [
      ...packages.filter(x => x.booking_id === b.id).map(x => `Day ${x.day}: ${x.name}`),
      ...selections.filter(x => x.booking_id === b.id).map(x =>
        `Day ${x.day} ${x.meal_type[0].toUpperCase()}${x.meal_type.slice(1)} (${x.persons} people): ${x.name}`),
      ...snacks.filter(x => x.booking_id === b.id).map(x => `Day ${x.day} Snacks (${x.persons} people): ${x.name}`),
      ...foodOrders.filter(x => x.booking_id === b.id).map(x =>
        `Day ${x.day} ${x.meal_type} · ${x.stop_name} / ${x.restaurant_name} · Person ${x.person_number}: ${x.name}${x.quantity > 1 ? ` × ${x.quantity}` : ''}`),
    ],
  }));
};
