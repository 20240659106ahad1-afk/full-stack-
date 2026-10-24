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
    transports: all('select id, name, type, route, capacity from transports'),
    rooms: all('select * from hotel_rooms'),
    meals: all('select * from meal_items order by meal_type, id'),
    snacks: all('select * from snack_items order by id'),
  });
});
module.exports = r;
