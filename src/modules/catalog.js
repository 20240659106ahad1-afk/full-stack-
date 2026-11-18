const r = require('express').Router(), db = require('../db');
r.get('/', (q, res) => {
  const all = s => db.prepare(s).all();
  const stops = all('select package_id, stop_name from package_stops order by package_id, stop_order');
  res.json({
    divisions: all('select id, name from divisions order by name'),
    districts: all('select id, division_id, name from districts order by name'),
    routeDistances: all('select id, start_district_id, package_id, distance_km from route_distances order by start_district_id, package_id'),
    packages: all('select id, division_id, name, best_for from packages order by name')
      .map(p => ({ ...p, stops: stops.filter(s => s.package_id === p.id).map(s => s.stop_name) })),
    transports: all('select id, name, type, route, capacity, cost_per_person from transports'),
    rooms: all('select * from hotel_rooms'),
    meals: all('select * from meal_items order by meal_type, id'),
    snacks: all('select * from snack_items order by id'),
  });
});

r.get('/restaurants', (q, res) => {
  const packageId = Number(q.query.package_id);
  if (!Number.isInteger(packageId) || packageId < 1
    || !db.prepare('select 1 from packages where id = ?').get(packageId)) {
    throw Object.assign(new Error('Choose a valid tour package'), { status: 400 });
  }
  const stops = db.prepare('select id, stop_order, stop_name from package_stops where package_id = ? order by stop_order')
    .all(packageId);
  const restaurants = db.prepare(`select r.id, r.package_stop_id, r.name, r.description
    from restaurants r join package_stops s on s.id = r.package_stop_id
    where s.package_id = ? order by s.stop_order, r.id`).all(packageId);
  const menu = db.prepare(`select id, restaurant_id, meal_type, name, price, image_url
    from restaurant_menu_items where restaurant_id in (
      select r.id from restaurants r join package_stops s on s.id = r.package_stop_id where s.package_id = ?)
    order by restaurant_id, meal_type, id`).all(packageId);
  res.json({
    stops: stops.map(stop => ({
      ...stop,
      restaurants: restaurants.filter(restaurant => restaurant.package_stop_id === stop.id)
        .map(restaurant => ({ ...restaurant, menu: menu.filter(item => item.restaurant_id === restaurant.id) })),
    })),
  });
});
module.exports = r;
