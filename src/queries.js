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
exports.withMeals = rows => {
  const packages = db.prepare('select md.booking_id, md.day, mp.name from booking_meal_days md join meal_packages mp on mp.id = md.package_id order by md.day').all();
  const selections = db.prepare(`select s.booking_id, s.day, s.meal_type, m.name from booking_meal_selections s
    join meal_items m on m.id = s.meal_item_id order by s.day, s.meal_type`).all();
  const snacks = db.prepare(`select s.booking_id, s.day, i.name from booking_snack_selections s
    join snack_items i on i.id = s.snack_item_id order by s.day`).all();
  return rows.map(b => ({
    ...b,
    meals: [
      ...packages.filter(x => x.booking_id === b.id).map(x => `Day ${x.day}: ${x.name}`),
      ...selections.filter(x => x.booking_id === b.id).map(x =>
        `Day ${x.day} ${x.meal_type[0].toUpperCase()}${x.meal_type.slice(1)}: ${x.name}`),
      ...snacks.filter(x => x.booking_id === b.id).map(x => `Day ${x.day} Snack: ${x.name}`),
    ],
  }));
};
