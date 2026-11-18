const db = require('./db');
const TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'];
const bad = message => Object.assign(new Error(message), { status: 400 });

exports.TYPES = TYPES;

exports.validateOrders = (packageId, persons, nights, orders) => {
  if (!Array.isArray(orders)) throw bad('Food orders must be a list');
  if (orders.length > Math.min(nights, 7) * TYPES.length * persons) throw bad('Too many food items selected');
  const getMenuItem = db.prepare(`select m.id, m.restaurant_id, m.meal_type, m.name, m.price,
    r.name restaurant_name, r.package_stop_id, s.stop_name
    from restaurant_menu_items m join restaurants r on r.id = m.restaurant_id
    join package_stops s on s.id = r.package_stop_id
    where m.id = ? and r.id = ? and s.package_id = ?`);
  const seen = new Set();
  return orders.map(order => {
    const day = Number(order.day), person = Number(order.person_number), restaurantId = Number(order.restaurant_id);
    const itemId = Number(order.menu_item_id), quantity = Number(order.quantity ?? 1);
    const type = String(order.meal_type || '');
    if (!Number.isInteger(day) || day < 1 || day > Math.min(nights, 7)
      || !Number.isInteger(person) || person < 1 || person > persons
      || !Number.isInteger(restaurantId) || restaurantId < 1
      || !Number.isInteger(itemId) || itemId < 1
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 10
      || !TYPES.includes(type)) throw bad('Check the selected food, day, traveller and quantity');
    const key = `${day}:${type}:${person}`;
    if (seen.has(key)) throw bad('Choose no more than one item per meal, traveller and day');
    seen.add(key);
    const item = getMenuItem.get(itemId, restaurantId, packageId);
    if (!item || item.meal_type !== type) throw bad('One of the selected restaurant menu items is invalid');
    return { day, person_number: person, restaurant_id: restaurantId, menu_item_id: item.id,
      meal_type: type, quantity, name: item.name, price: item.price,
      restaurant_name: item.restaurant_name, stop_name: item.stop_name };
  });
};

exports.preferences = userId => Object.fromEntries(db.prepare(
  'select meal_type, dish_name from user_food_preferences where user_id = ?'
).all(userId).map(row => [row.meal_type, row.dish_name]));

exports.savePreferences = (userId, preferences) => {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw bad('Choose valid food preferences');
  }
  const upsert = db.prepare(`insert into user_food_preferences(user_id,meal_type,dish_name) values(?,?,?)
    on conflict(user_id,meal_type) do update set dish_name=excluded.dish_name`);
  const remove = db.prepare('delete from user_food_preferences where user_id = ? and meal_type = ?');
  const exists = db.prepare('select 1 from restaurant_menu_items where meal_type = ? and name = ? limit 1');
  db.transaction(() => {
    for (const type of TYPES) {
      const name = String(preferences[type] || '').trim();
      if (!name) {
        remove.run(userId, type);
        continue;
      }
      if (!exists.get(type, name)) throw bad(`That ${type} preference is not on a restaurant menu`);
      upsert.run(userId, type, name);
    }
  })();
  return exports.preferences(userId);
};
