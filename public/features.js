// Bootstrap-powered pages: plan, bookings, admin, profile, catalog, plus account helpers.
let openEnt, userTimer;
const METHODS = ['Bkash', 'Nagad', 'Rocket', 'Bank'];
const today = () => new Date().toLocaleDateString('en-CA');
const paymentFields = () => `<label>Payment method<select name="method">${METHODS.map(method => `<option>${method}</option>`).join('')}</select></label>
<label data-account-label><span>bKash phone number</span><input name="account" type="text" inputmode="numeric" pattern="01[3-9][0-9]{8}" maxlength="24" placeholder="01XXXXXXXXX" autocomplete="off" required></label>
<p class="mut">Demo only: no money will be taken. Your account number is not stored; the verification code goes to your registered email.</p>`;
const departureGroups = [
  ['Morning', ['06:00', '08:00', '10:00']],
  ['Noon', ['12:00', '14:00']],
  ['Evening', ['16:00', '18:00']],
  ['Night', ['20:00', '22:00', '23:30']],
];
const setupPaymentForms = () => document.querySelectorAll('.booking-payment').forEach(form => {
  const method = form.elements.method, label = form.querySelector('[data-account-label] span'), account = form.elements.account;
  const updateAccountField = () => {
    const bank = method.value === 'Bank';
    label.textContent = bank ? 'Bank account number' : `${method.value} phone number`;
    account.pattern = bank ? '[0-9]{6,24}' : '01[3-9][0-9]{8}';
    account.placeholder = bank ? 'Enter bank account number' : '01XXXXXXXXX';
  };
  method.addEventListener('change', updateAccountField);
  updateAccountField();
});

function strength(pw, user = '') {
  const cls = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  const common = ['password', 'password1', '12345678', '123456789', 'qwerty123', 'iloveyou', 'admin123', '11111111', 'abcd1234'].includes(pw.toLowerCase());
  const named = user.length >= 3 && pw.toLowerCase().includes(user.toLowerCase());
  if (pw.length < 8 || cls < 3 || common || named) return { level: 'Weak', ok: false, pct: Math.max(8, Math.min(40, pw.length * 4)), bar: 'bg-danger' };
  return pw.length >= 12 && cls === 4 ? { level: 'Strong', ok: true, pct: 100, bar: 'bg-success' } : { level: 'Medium', ok: true, pct: 70, bar: 'bg-warning' };
}
const pwField = (name, label, auto) => `<label>${label}${pwInput(name, `required minlength="8" autocomplete="${auto}" data-check="password"`)}</label>
<div class="progress mt-2" style="height:6px"><div class="progress-bar pw-bar" style="width:0"></div></div>
<div class="form-text pw-msg">Use 8+ characters with 3 of: small letter, capital letter, number, symbol.</div>`;

const payload = f => {
  const d = Object.fromEntries(new FormData(f));
  d.seat_numbers = JSON.parse(d.seat_numbers || '[]');
  if (f.dataset.id && f.dataset.preserveMeals === 'true') d.preserve_existing_meals = true;
  else d.food_orders = tripFoodEditor?.orders() || [];
  if (f.dataset.id) d.booking_id = Number(f.dataset.id);
  return d;
};

function mountFoodEditor(container, stops, options = {}) {
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const labels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
  const stopById = new Map(stops.map(stop => [stop.id, stop]));
  const state = new Map();
  let days = Math.min(Math.max(Number(options.days) || 1, 1), 7);
  let persons = Math.max(1, Number(options.persons) || 1);
  for (const order of options.initialOrders || []) {
    const stop = stopById.get(stops.find(item => item.restaurants.some(r => r.id === order.restaurant_id))?.id);
    if (!stop) continue;
    const day = Number(order.day), type = order.meal_type, person = Number(order.person_number);
    if (day < 1 || day > days || person < 1 || person > persons || !mealTypes.includes(type)) continue;
    const entry = state.get(day) || { stop_id: stop.id, restaurant_id: order.restaurant_id, items: {} };
    entry.stop_id = stop.id;
    entry.restaurant_id = order.restaurant_id;
    entry.items[`${type}:${person}`] = { menu_item_id: order.menu_item_id, quantity: order.quantity || 1 };
    state.set(day, entry);
  }
  for (let day = 1; day <= days; day++) {
    if (!state.has(day)) state.set(day, { stop_id: stops[0]?.id || '', restaurant_id: '', items: {} });
  }
  const render = () => {
    container.innerHTML = Array.from({ length: days }, (_, index) => {
      const day = index + 1, entry = state.get(day), stop = stopById.get(Number(entry.stop_id));
      const restaurant = stop?.restaurants.find(item => item.id == entry.restaurant_id);
      return `<section class="food-day panel">
<h3>Day ${day} menu</h3>
<label>Choose a travel spot
<select data-food-spot="${day}">${stops.map(item => opt(item.id, item.stop_name, item.id == entry.stop_id)).join('')}</select></label>
<div class="food-restaurants" role="group" aria-label="Restaurants at ${esc(stop?.stop_name || 'this spot')}">
${(stop?.restaurants || []).map(item => `<button type="button" class="food-restaurant${item.id == entry.restaurant_id ? ' active' : ''}" data-food-restaurant="${day}" data-restaurant-id="${item.id}">
<strong>${esc(item.name)}</strong><small>${esc(item.description)}</small></button>`).join('') || '<p class="mut">No restaurant is available at this spot.</p>'}
</div>
${restaurant ? `<div class="food-menu"><h4>${esc(restaurant.name)} menu</h4>
${mealTypes.map(type => `<fieldset class="food-menu-category"><legend>${labels[type]}</legend>
<div class="food-item-gallery">${restaurant.menu.filter(item => item.meal_type === type).map(item =>
  `<article class="food-item-card"><img src="${esc(item.image_url || '/images/pexels-pizza.jpg')}" alt="${esc(item.name)}" loading="lazy">
<div><strong>${esc(item.name)}</strong><span>${tk(item.price)}</span></div></article>`).join('')}</div>
${Array.from({ length: persons }, (_, personIndex) => {
  const person = personIndex + 1, key = `${type}:${person}`, choice = entry.items[key] || {};
  const menu = restaurant.menu.filter(item => item.meal_type === type);
  return `<div class="food-person-row"><label>Person ${person}
<select data-food-item="${day}" data-meal-type="${type}" data-person="${person}">
<option value="">Skip ${labels[type].toLowerCase()}</option>
${menu.map(item => opt(item.id, `${item.name} · ${tk(item.price)}`, choice.menu_item_id == item.id)).join('')}
</select></label>
<label>Qty<input type="number" min="1" max="10" value="${choice.quantity || 1}" data-food-quantity="${day}" data-meal-type="${type}" data-person="${person}"${choice.menu_item_id ? '' : ' disabled'}></label></div>`;
}).join('') || '<p class="mut">No menu items in this category.</p>'}
</fieldset>`).join('')}</div>` : '<p class="mut mb-0">Click a restaurant to see its menu and order separately for each person.</p>'}
</section>`;
    }).join('') + (!stops.length ? '<p class="mut">Choose a tour package to browse restaurants at its spots.</p>' : '')
      + (options.onSave ? '<button type="button" class="mt-3" data-food-save>Save food order</button>' : '');
  };
  const orders = () => [...state.entries()].flatMap(([day, entry]) =>
    Object.entries(entry.items).flatMap(([key, choice]) => {
      if (!choice.menu_item_id || !entry.restaurant_id) return [];
      const [meal_type, person] = key.split(':');
      return [{ day, meal_type, person_number: Number(person), restaurant_id: Number(entry.restaurant_id),
        menu_item_id: Number(choice.menu_item_id), quantity: Number(choice.quantity) || 1 }];
    }));
  const updatePreferenceDefaults = (day, restaurant) => {
    const entry = state.get(day);
    for (const type of mealTypes) {
      const preferredName = options.preferences?.[type];
      if (!preferredName) continue;
      const item = restaurant.menu.find(menuItem => menuItem.meal_type === type
        && menuItem.name.toLowerCase() === preferredName.toLowerCase());
      if (!item) continue;
      for (let person = 1; person <= persons; person++) {
        const key = `${type}:${person}`;
        if (!entry.items[key]?.menu_item_id) entry.items[key] = { menu_item_id: item.id, quantity: 1 };
      }
    }
  };
  container.addEventListener('change', event => {
    const spotSelect = event.target.closest('[data-food-spot]');
    if (spotSelect) {
      const day = Number(spotSelect.dataset.foodSpot);
      state.set(day, { stop_id: Number(spotSelect.value), restaurant_id: '', items: {} });
      render();
      options.onChange?.();
      return;
    }
    const itemSelect = event.target.closest('[data-food-item]');
    if (itemSelect) {
      const day = Number(itemSelect.dataset.foodItem), entry = state.get(day);
      const key = `${itemSelect.dataset.mealType}:${itemSelect.dataset.person}`;
      const choice = entry.items[key] || { quantity: 1 };
      choice.menu_item_id = itemSelect.value ? Number(itemSelect.value) : '';
      entry.items[key] = choice;
      render();
      options.onChange?.();
      return;
    }
    const quantity = event.target.closest('[data-food-quantity]');
    if (quantity) {
      const day = Number(quantity.dataset.foodQuantity), entry = state.get(day);
      const key = `${quantity.dataset.mealType}:${quantity.dataset.person}`;
      if (entry.items[key]?.menu_item_id) entry.items[key].quantity = Math.min(10, Math.max(1, Number(quantity.value) || 1));
      options.onChange?.();
    }
  });
  container.addEventListener('click', async event => {
    const button = event.target.closest('[data-food-restaurant]');
    if (button) {
      const day = Number(button.dataset.foodRestaurant), entry = state.get(day);
      const restaurantId = Number(button.dataset.restaurantId);
      const restaurant = stops.flatMap(stop => stop.restaurants).find(item => item.id === restaurantId);
      entry.restaurant_id = restaurantId;
      entry.items = {};
      if (restaurant) updatePreferenceDefaults(day, restaurant);
      render();
      options.onChange?.();
      return;
    }
    const save = event.target.closest('[data-food-save]');
    if (save && options.onSave) {
      save.disabled = true;
      try { await options.onSave(orders()); }
      catch (error) { toast(error.message, 1); }
      finally { if (save.isConnected) save.disabled = false; }
    }
  });
  render();
  return {
    orders,
    update(nextPersons, nextDays) {
      persons = Math.max(1, Number(nextPersons) || 1);
      const count = Math.min(Math.max(Number(nextDays) || 1, 1), 7);
      for (const [day, entry] of state) {
        for (const key of Object.keys(entry.items)) {
          if (Number(key.split(':')[1]) > persons || day > count) delete entry.items[key];
        }
      }
      for (let day = 1; day <= count; day++) {
        if (!state.has(day)) state.set(day, { stop_id: stops[0]?.id || '', restaurant_id: '', items: {} });
      }
      for (const day of state.keys()) if (day > count) state.delete(day);
      days = count;
      render();
    },
  };
}
let tripFoodEditor;

async function plan() {
  tripFoodEditor = null;
  cat = await api('/catalog');
  const editId = new URLSearchParams(location.hash.split('?')[1] || '').get('edit');
  let editingBooking = null;
  if (editId) {
    editingBooking = (await api('/bookings/mine')).find(booking => String(booking.id) === editId);
    if (!editingBooking || editingBooking.status === 'cancelled') throw new Error('Booking not found or cancelled');
  }
  $('#app').innerHTML = `<section class="destination-banner" id="destination-banner"><img id="destination-photo" alt="" fetchpriority="high" hidden><div class="destination-shade"></div><div class="destination-copy"><span class="eyebrow">${editingBooking ? 'UPDATE YOUR TRIP' : 'YOUR NEXT BANGLADESH GETAWAY'}</span><h1 id="destination-title">${editingBooking ? 'Edit your booking' : 'Choose a destination'}</h1><p id="destination-details">${editingBooking ? `Update booking ${esc(editingBooking.customer_code)}. The new price and any refund due will be shown before saving.` : 'Select a destination division to explore available tours.'}</p></div></section><div class="plan">
<form id="trip" class="panel" data-act="book" data-id="${editingBooking ? editingBooking.id : ''}">
<ul class="nav nav-tabs mb-3" role="tablist">
<li class="nav-item"><button type="button" class="nav-link active" id="trip-tab" data-bs-toggle="tab" data-bs-target="#tab-trip">1. Trip and stay</button></li>
<li class="nav-item"><button type="button" class="nav-link" id="meal-tab" data-bs-toggle="tab" data-bs-target="#tab-meals">2. Customize meals</button></li></ul>
<div class="tab-content">
<div class="tab-pane fade show active" id="tab-trip">
<h3 class="step"><b>1</b>Where and when?</h3>
<label>Starting district<select name="start_district_id" required><option value="" selected disabled>Choose a starting district</option>${cat.divisions.map(d => `<optgroup label="${esc(d.name)}">${cat.districts.filter(x => x.division_id === d.id).map(x => opt(x.id, x.name)).join('')}</optgroup>`).join('')}</select></label>
<label>Destination division<select name="destination_division_id" required><option value="" selected disabled>Choose a destination division</option>${cat.divisions.map(d => opt(d.id, d.name)).join('')}</select></label>
<label>Package<select name="package_id" required><option value="" selected disabled>Choose a destination first</option></select></label>
<label>Travel date<input name="travel_date" type="date" required min="${today()}"></label>
<h3 class="step"><b>2</b>How will you travel?</h3>
<label>Transport<select name="transport_id"></select></label><div id="seats"></div>
<label>Transport departure time<select name="departure_time" required><option value="" selected disabled>Choose a departure time</option>
${departureGroups.map(([period, times]) => `<optgroup label="${period}">${times.map(time => opt(time, time)).join('')}</optgroup>`).join('')}</select></label>
<p class="mut small mb-2">Departures are available in the morning, noon, evening and night.</p>
<div class="seat-selection-summary"><span>Seats selected</span><strong id="selected-seat-count">0</strong><input type="hidden" name="persons" value="0"><input type="hidden" name="seat_numbers" value="[]"></div>
<h3 class="step"><b>3</b>Where will you stay?</h3>
<label>Hotel room<select name="room_id">${cat.rooms.map(r => opt(r.id, `${r.room_type}, ${r.bed_count} bed${r.bed_count === 1 ? '' : 's'}, sleeps ${r.capacity}, ${r.price_per_night} Tk a night`)).join('')}</select></label>
<label>Nights<input name="nights" type="number" min="1" value="2"></label>
<button type="button" class="ghost mt-3" data-go="meals">Next: customize meals</button></div>
<div class="tab-pane fade" id="tab-meals">
<h3 class="step"><b>4</b>Choose your food <small>open a spot's restaurants, browse a menu and choose separately for each traveller</small></h3>
<div id="day-plan"></div>
<div class="plan-step-actions"><button type="button" class="ghost mt-4" data-go="trip">Back: edit trip and stay</button>
<button type="submit" class="mt-4">${editingBooking ? 'Save booking changes' : 'Payment'}</button></div></div>
 </div></form>
<aside class="ticket" id="ticket">${miniLoader()}</aside></div>`;
  const f = $('#trip'); let avail = {}, bookedSeats = {}, selectedSeats = [], availabilityError = '';
  if (editingBooking && !editingBooking.food_orders.length && editingBooking.meals.length) {
    f.dataset.preserveMeals = 'true';
  }
  let initialFoodOrders = editingBooking?.food_orders || [];
  const foodPreferences = await api('/bookings/preferences');
  const updateDestination = () => {
    const destination = cat.divisions.find(d => d.id == f.destination_division_id.value);
    if (!destination) {
      $('#destination-title').textContent = 'Choose a destination';
      $('#destination-details').textContent = 'Select a destination division to explore available tours.';
      $('#destination-photo').hidden = true;
      return;
    }
    const selectedPackage = cat.packages.find(p => p.id == f.package_id.value);
    const title = selectedPackage?.name || destination.name;
    $('#destination-title').textContent = title;
    $('#destination-photo').src = destinationImage(destination.name, selectedPackage?.name);
    $('#destination-photo').alt = `${title} travel scenery`;
    $('#destination-photo').hidden = false;
    $('#destination-details').textContent = selectedPackage
      ? [selectedPackage.best_for, selectedPackage.stops.join(' · ')].filter(Boolean).join(' — ') || `Explore ${selectedPackage.name}.`
      : `Choose a ${destination.name} tour package to see its highlights.`;
  };
  const fillPackages = () => {
    const packages = cat.packages.filter(p => p.division_id == f.destination_division_id.value);
    const placeholder = !f.destination_division_id.value ? 'Choose a destination first'
      : packages.length ? 'Choose a tour package' : 'No packages available for this destination';
    f.package_id.innerHTML = `<option value="" selected disabled>${placeholder}</option>`
      + packages.map(p => opt(p.id, p.name)).join('');
  };
  const seatUI = () => {
    const t = cat.transports.find(x => x.id == f.transport_id.value); if (!t) return;
    const left = avail[t.id] ?? t.capacity, pct = Math.round(left / t.capacity * 100);
    const booked = new Set(bookedSeats[t.id] || []);
    $('#seats').innerHTML = availabilityError
      ? `<p class="text-danger small">${esc(availabilityError)}</p>`
      : f.travel_date.value && f.departure_time.value
      ? `<div class="progress mt-2" style="height:8px"><div class="progress-bar ${pct > 50 ? 'bg-success' : pct > 20 ? 'bg-warning' : 'bg-danger'}" style="width:${pct}%"></div></div>
<small class="text-secondary">${left} of ${t.capacity} seats left for ${esc(f.departure_time.value)} on ${esc(f.travel_date.value)}.</small>
<div class="seat-legend"><span><i class="seat-legend-available"></i> Available</span><span><i class="seat-legend-selected"></i> Selected</span><span><i class="seat-legend-booked"></i> Booked</span></div>
<div class="seat-grid" role="group" aria-label="Choose seats">${Array.from({ length: t.capacity }, (_, i) => i + 1).map(number => {
        const isBooked = booked.has(number), isSelected = selectedSeats.includes(number);
        return `<button type="button" class="seat-option${isBooked ? ' booked' : isSelected ? ' selected' : ''}" data-seat="${number}" aria-pressed="${isSelected}" aria-label="Seat ${number}${isBooked ? ', booked' : isSelected ? ', selected' : ', available'}"${isBooked ? ' disabled' : ''}>${number}</button>`;
      }).join('')}</div>`
      : '<small class="text-secondary">Choose a travel date and departure time to see available seats.</small>';
  };
  const fillTransports = () => {
    const requested = new URLSearchParams(location.hash.split('?')[1] || '').get('transport');
    const cur = f.transport_id.value || requested || editingBooking?.transport_id;
    f.transport_id.innerHTML = cat.transports.map(t => { const left = avail[t.id] ?? t.capacity;
      return `<option value="${t.id}"${t.id == cur ? ' selected' : ''}>${esc(`${t.name} ${t.type}, ${left}/${t.capacity} seats left`)}</option>`; }).join('');
    seatUI();
  };
  const loadSeats = async () => {
    if (!f.travel_date.value || !f.departure_time.value || !f.transport_id.value) {
      avail = {}; bookedSeats = {}; availabilityError = '';
      fillTransports();
      return;
    }
    try {
      const params = new URLSearchParams({ date: f.travel_date.value, departure_time: f.departure_time.value });
      if (f.dataset.id) params.set('booking_id', f.dataset.id);
      const options = await api('/bookings/availability?' + params);
      availabilityError = '';
      avail = Object.fromEntries(options.map(x => [x.id, x.left]));
      bookedSeats = Object.fromEntries(options.map(x => [x.id, x.booked_seats]));
      const unavailable = new Set(bookedSeats[f.transport_id.value] || []);
      selectedSeats = selectedSeats.filter(number => !unavailable.has(number));
      syncSeatSelection();
    } catch (error) {
      avail = {}; bookedSeats = {};
      availabilityError = 'Could not load seat availability. Please change the date or departure time and try again.';
      toast(error.message, 1);
    }
    fillTransports();
  };
  const syncSeatSelection = () => {
    f.persons.value = selectedSeats.length;
    f.seat_numbers.value = JSON.stringify(selectedSeats);
    $('#selected-seat-count').textContent = selectedSeats.length;
    tripFoodEditor?.update(selectedSeats.length || 1, +f.nights.value || 1);
  };
  $('#seats').addEventListener('click', e => {
    const button = e.target.closest('[data-seat]');
    if (!button || button.disabled) return;
    const number = Number(button.dataset.seat);
    selectedSeats = selectedSeats.includes(number)
      ? selectedSeats.filter(seat => seat !== number)
      : [...selectedSeats, number].sort((a, b) => a - b);
    if (editingBooking && selectedSeats.length !== editingBooking.transport_persons) f.dataset.preserveMeals = 'false';
    syncSeatSelection();
    seatUI();
    clearTimeout(quoteTimer); quoteTimer = setTimeout(quote, 200);
  });
  const dayPlan = async () => {
    const packageId = f.package_id.value;
    if (!packageId) {
      tripFoodEditor = null;
      $('#day-plan').innerHTML = '<p class="mut">Choose a tour package to browse restaurants at each spot.</p>';
      return;
    }
    const { stops } = await api('/catalog/restaurants?package_id=' + encodeURIComponent(packageId));
    tripFoodEditor = mountFoodEditor($('#day-plan'), stops, {
      days: +f.nights.value || 1, persons: +f.persons.value || 1, preferences: foodPreferences,
      initialOrders: initialFoodOrders,
      onChange: () => {
        if (editingBooking) f.dataset.preserveMeals = 'false';
        clearTimeout(quoteTimer);
        quoteTimer = setTimeout(quote, 200);
      },
    });
    initialFoodOrders = [];
    if (+f.nights.value > 7) $('#day-plan').insertAdjacentHTML('beforeend',
      '<p class="text-secondary small">Restaurant orders can be customized for the first 7 days.</p>');
  };
  const quote = async () => {
    const ticket = $('#ticket');
    if (!ticket) return;
    if (!selectedSeats.length) {
      ticket.innerHTML = '<p class="mut mb-0">Choose a travel date and departure time, then select at least one available seat to see the price.</p>';
      return;
    }
    if (!f.start_district_id.value || !f.destination_division_id.value || !f.package_id.value) {
      ticket.innerHTML = '<p class="mut mb-0">Choose your starting district, destination and tour package to see the price.</p>';
      return;
    }
    try {
      const q = await api('/bookings/quote', 'POST', payload(f)), p = cat.packages.find(x => x.id == f.package_id.value);
      if (!ticket.isConnected) return;
      const transport = cat.transports.find(x => x.id == f.transport_id.value);
      const mealLines = Object.entries({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' })
        .filter(([type]) => q.mealBreakdown[type])
        .map(([type, label]) => `<div class="ln"><span>${label} (${q.mealPersonCounts[type]} servings)</span><span>${tk(q.mealBreakdown[type])}</span></div>`).join('');
      ticket.innerHTML = `<h2>${esc(p ? p.name : 'Your trip')}</h2><p>${p ? esc(p.stops.join(' to ')) : ''}</p>
<div class="ln"><span>Distance (one way)</span><span>${q.distanceKm} km to ${esc(q.finalStop)}</span></div>
<div class="ln"><span>Fare per seat (${esc(transport?.type || '')})</span><span>${tk(q.fareBasePerPerson)} base${q.acSurchargePerSeat ? ` + ${tk(q.acSurchargePerSeat)} AC premium` : ''} = ${tk(q.oneWayFarePerPerson)}</span></div>
<div class="ln"><span>Transport (${q.persons} seats, one way)</span><span>${tk(q.transport)}</span></div>
${[['Hotel', q.hotel]].map(([k, v]) => `<div class="ln"><span>${k}</span><span>${tk(v)}</span></div>`).join('')}
${mealLines}<div class="ln"><span>Food items (${q.selectedMeals.length} selected)</span><span>${tk(q.meal)}</span></div>
${q.discount ? `<div class="ln"><span>30% discount</span><span>-${tk(q.discount)}</span></div>` : ''}
<div class="ln total"><span>Total</span><span>${tk(q.final_total)}</span></div>
<p class="mut mb-0">Advance to pay now: ${tk(q.final_total / 2)}</p>`;
    } catch (e) { if (ticket.isConnected) ticket.innerHTML = `<div class="alert alert-warning mb-0">${esc(e.message)}</div>`; }
  };
  f.addEventListener('input', async e => {
    const n = e.target.name;
    const foodControl = e.target.matches('[data-food-item], [data-food-quantity]');
    if (!(['start_district_id', 'destination_division_id', 'package_id', 'nights', 'travel_date',
      'transport_id', 'departure_time', 'persons', 'room_id'].includes(n) || foodControl)) return;
    if (n === 'nights') {
      if (editingBooking) f.dataset.preserveMeals = 'false';
      if (tripFoodEditor) tripFoodEditor.update(+f.persons.value, +f.nights.value);
      else await dayPlan();
    }
    if (['travel_date', 'transport_id', 'departure_time'].includes(n)) {
      selectedSeats = [];
      syncSeatSelection();
      await loadSeats();
    }
    clearTimeout(quoteTimer); quoteTimer = setTimeout(quote, 250);
  });
  f.addEventListener('change', e => {
    if (e.target.name === 'destination_division_id') {
      fillPackages();
      updateDestination();
      dayPlan().catch(error => toast(error.message, 1));
    }
    if (e.target.name === 'package_id') {
      if (editingBooking) f.dataset.preserveMeals = 'false';
      updateDestination();
      dayPlan().catch(error => toast(error.message, 1));
    }
  });
  if (editingBooking) {
    f.start_district_id.value = editingBooking.start_district_id;
    f.destination_division_id.value = editingBooking.destination_division_id;
    fillPackages();
    f.package_id.value = editingBooking.package_id;
    f.travel_date.value = editingBooking.travel_date;
    f.departure_time.value = editingBooking.departure_time;
    f.room_id.value = editingBooking.room_id;
    f.nights.value = editingBooking.nights;
    selectedSeats = [...(editingBooking.seat_numbers || [])];
  } else {
    fillPackages();
  }
  updateDestination();
  syncSeatSelection();
  await dayPlan();
  fillTransports();
  if (editingBooking) await loadSeats();
  quote();
}

async function paymentPage(bookingId) {
  const bookings = await api('/bookings/mine');
  const booking = bookings.find(item => String(item.id) === String(bookingId));
  if (!booking) throw new Error('Could not load your booking details');
  $('#app').classList.remove('wide');
  $('#app').innerHTML = `<section class="panel payment-page">
<span class="section-kicker">BOOKING PAYMENT</span><h1>Review and confirm</h1>
<div class="payment-trip-summary">
<div><span>Trip</span><strong>${esc(booking.package || booking.division)}</strong></div>
<div><span>Route</span><strong>${esc(booking.start_district)} → ${esc(booking.division)}</strong></div>
<div><span>Route distance and fare</span><strong>${booking.distance_km} km one way · ${booking.transport_persons} seats</strong></div>
<div><span>Date and departure time</span><strong>${esc(booking.travel_date)} · ${esc(booking.departure_time || 'Not set')}</strong></div>
<div><span>Seats booked</span><strong>${booking.seat_numbers?.length ? booking.seat_numbers.join(', ') : booking.transport_persons}</strong></div>
<div><span>Transport</span><strong>${esc(`${booking.transport_name} ${booking.transport_type}`)}</strong></div>
<div><span>Stay</span><strong>${esc(`${booking.room_type}, ${booking.bed_count} bed${booking.bed_count === 1 ? '' : 's'}, ${booking.nights} nights`)}</strong></div>
<div class="payment-meals"><span>Your meal choices</span><strong>${booking.meals.length ? booking.meals.map(esc).join('<br>') : 'No meals selected'}</strong></div>
<div><span>Transport</span><strong>${tk(booking.transport_cost)}</strong></div>
<div><span>Hotel</span><strong>${tk(booking.hotel_cost)}</strong></div>
<div><span>Meals</span><strong>${tk(booking.meal_cost)}</strong></div>
${booking.discount ? `<div><span>Discount</span><strong>-${tk(booking.discount)}</strong></div>` : ''}
<div class="payment-total"><span>Total</span><strong>${tk(booking.final_total)}</strong></div>
<div><span>Advance to pay (50%)</span><strong>${tk(booking.final_total / 2)}</strong></div>
</div>
${booking.status === 'pending' ? `<form class="booking-payment payment-step" data-act="pay" data-id="${booking.id}">
${paymentFields()}
<button type="button" class="ghost" data-act="otp" data-id="${booking.id}">Email me a code</button>
<div class="payment-code-panel" hidden><p class="mut">Enter the 6-digit code sent to your email.</p>
<label>6-digit email code${otpInput('otp')}</label><button type="submit">Confirm booking</button></div></form>`
    : `<p class="booking-cancelled">${booking.status === 'confirmed' ? 'This booking is already confirmed.' : 'This booking has been cancelled.'}</p>`}
<a class="success-back" href="#/bookings">Back to my bookings</a></section>`;
  document.querySelectorAll('.booking-payment .payment-code-panel .otp-digit').forEach(input => { input.required = false; });
  setupPaymentForms();
}

async function bookings() {
  const list = await api('/bookings/mine');
  $('#app').innerHTML = `<div class="bookings-heading"><div><span class="eyebrow">YOUR TRIPS</span><h1>My bookings</h1><p class="mut mb-0">View and manage your travel plans.</p></div>
${list.length ? `<span class="booking-count">${list.length} ${list.length === 1 ? 'booking' : 'bookings'}</span>` : ''}</div>`
    + (list.length ? `<ul class="nav nav-pills booking-filters mb-3">${[['all', 'All'], ['active', 'Active'], ['cancelled', 'Cancelled']].map(([k, label], i) => `<li class="nav-item"><button type="button" class="nav-link${i ? '' : ' active'}" data-filter="${k}">${label}</button></li>`).join('')}</ul>
<div class="booking-list">${list.map((b, i) => `<details class="booking-card" data-st="${b.status}"${i === 0 ? ' open' : ''}>
<summary class="booking-summary"><span class="booking-destination"><strong>${esc(b.package || b.division)}</strong><small>${esc(b.division)} · ${esc(b.travel_date)}</small></span>
<span class="tag ${b.status}">${b.status}</span><span class="booking-ref">${esc(b.customer_code)}</span><span class="booking-chevron" aria-hidden="true">⌄</span></summary>
<div class="booking-content"><div class="booking-details">
<section class="booking-facts"><h2>Trip details</h2>
<div class="booking-row"><span>Booking reference</span><strong>${esc(b.customer_code)}</strong></div>
<div class="booking-row"><span>From</span><strong>${esc(b.start_district)}</strong></div>
${b.distance_km ? `<div class="booking-row"><span>Route distance</span><strong>${b.distance_km} km one way</strong></div>` : ''}
<div class="booking-row"><span>Travel date</span><strong>${esc(b.travel_date)}</strong></div>
${b.departure_time ? `<div class="booking-row"><span>Transport departure time</span><strong>${esc(b.departure_time)}</strong></div>` : ''}
<div class="booking-row"><span>Seats booked</span><strong>${b.seat_numbers?.length ? b.seat_numbers.join(', ') : b.transport_persons}</strong></div>
<div class="booking-row"><span>Transport</span><strong>${esc(b.transport_name)}</strong></div>
<div class="booking-row"><span>Hotel room</span><strong>${esc(`${b.room_type}, ${b.bed_count} bed${b.bed_count === 1 ? '' : 's'}`)}</strong></div>
<div class="booking-row"><span>Nights</span><strong>${b.nights}</strong></div>
${b.meals.length ? `<div class="booking-row"><span>Meals</span><strong>${b.meals.map(esc).join(', ')}</strong></div>` : ''}
</section><section class="booking-facts booking-money"><h2>Price summary</h2>
<div class="booking-row"><span>Total price</span><strong>${tk(b.final_total)}</strong></div>
${b.discount ? `<div class="booking-row discount"><span>Discount</span><strong>-${tk(b.discount)}</strong></div>` : ''}
${b.advance ? `<div class="booking-row paid"><span>Advance paid</span><strong>${tk(b.advance)}</strong></div><div class="booking-row due"><span>Remaining due</span><strong>${tk(b.remaining)}</strong></div>` : `<div class="booking-row"><span>Advance required (50%)</span><strong>${tk(b.final_total / 2)}</strong></div>`}
${b.refund_due ? `<div class="booking-row due"><span>Manual refund to arrange</span><strong>${tk(b.refund_due)}</strong></div>` : ''}
${b.method ? `<div class="booking-row"><span>Payment method</span><strong>${esc(b.method)}</strong></div><div class="booking-row"><span>Demo transaction ID</span><strong class="transaction-id">${esc(b.transaction_id)}</strong></div>` : ''}
</section></div>
${b.meals.length ? `<p class="booking-meals"><strong>Meal selections</strong><span>${b.meals.map(esc).join(' · ')}</span></p>` : ''}
${b.status === 'pending' ? `<form class="booking-payment" data-act="pay" data-id="${b.id}"><h2>Confirm your booking</h2><p class="mut mb-0">Your seats are held for 30 minutes after booking.</p>
${paymentFields()}
<button type="button" class="ghost" data-act="otp" data-id="${b.id}">Email me a code</button>
<div class="payment-code-panel" hidden><p class="mut">Enter the code sent to your email.</p>
<label>6-digit code from your email${otpInput('otp')}</label><button>Confirm booking</button></div>
<button type="button" class="ghost" data-act="cancel" data-id="${b.id}">Cancel booking</button></form>`
    : b.status === 'confirmed' ? `<div class="booking-actions"><div><strong class="demo-note">Demo payment recorded</strong>
<p class="mut">Cancel 7+ days before travel: 80% of the advance back. 2-6 days: 50%. Less than 2 days: no refund. If you cancel today you get ${tk(b.refund_preview)}.</p></div>
<button class="ghost" data-act="cancel" data-id="${b.id}" data-paid="${b.advance}" data-refund="${b.refund_preview}">Cancel booking</button></div>`
    : `<p class="booking-cancelled">${b.advance ? (b.refund_amount ? `Refund of ${tk(b.refund_amount)} will be returned to you.` : 'This cancellation was too late for a refund.') : 'No payment was taken.'}</p>`}
</div></details>`).join('')}</div>`
    : '<div class="booking-empty panel"><h2>No bookings yet</h2><p class="mut">Your next trip is waiting to be planned.</p><a class="cta" href="#/plan">Plan a trip</a></div>');
  document.querySelectorAll('.booking-payment .payment-code-panel').forEach(panel => {
    panel.querySelectorAll('.otp-digit').forEach(input => { input.required = false; });
  });
  setupPaymentForms();
}

const kv = (k, v) => `<div class="ln"><span class="mut">${k}</span><span class="text-end">${v || '-'}</span></div>`;
async function admin() {
  const bk = await api('/admin/bookings'), fbs = await api('/admin/feedback'), users = me.role === 'admin' ? await api('/admin/users') : [];
  const stat = (k, v) => `<div class="col-6 col-md-3"><div class="card text-center"><div class="card-body py-3"><div class="fs-3 fw-bold">${v}</div><div class="text-secondary small">${k}</div></div></div></div>`;
  const ok = bk.filter(b => b.status === 'confirmed');
  $('#app').innerHTML = `<h1>Admin</h1><div class="row g-3 mb-4">${stat('Bookings', bk.length)}${stat('Confirmed', ok.length)}${stat('Waiting for payment', bk.filter(b => b.status === 'pending').length)}${stat('Demo advances', tk(ok.reduce((s, b) => s + b.advance, 0)))}</div>
<h2>Who booked what</h2><input id="bk-filter" class="mb-3" placeholder="Search by code, customer, mobile, place or status">
<div class="accordion" id="bk-acc">${bk.map(b => `<div class="accordion-item" data-q="${esc([b.customer_code, b.username, b.mobile, b.package, b.division, b.status].join(' ').toLowerCase())}">
<h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#bk${b.id}">
<span class="fw-bold">${esc(b.customer_code)}</span><span>${esc(b.username)}</span><span class="text-secondary me-auto">${esc(b.package || b.division)}</span><span class="tag ${b.status}">${b.status}</span><strong>${tk(b.final_total)}</strong></button></h2>
<div id="bk${b.id}" class="accordion-collapse collapse" data-bs-parent="#bk-acc"><div class="accordion-body"><div class="row g-4">
<div class="col-md-6 col-xl-3"><h3 class="mt-0">Customer</h3>${kv('Username', esc(b.username))}${kv('Mobile', esc(b.mobile))}${kv('Email', esc(b.email))}${kv('Booked at', esc(b.created_at))}</div>
<div class="col-md-6 col-xl-3"><h3 class="mt-0">Trip</h3>${kv('From', esc(b.start_district))}${kv('To', esc(b.division))}${kv('Package', esc(b.package))}${b.distance_km ? kv('Route distance (one way)', `${b.distance_km} km`) : ''}${kv('Travel date', esc(b.travel_date))}${b.departure_time ? kv('Transport departure time', esc(b.departure_time)) : ''}${kv('Seats booked', b.seat_numbers?.length ? b.seat_numbers.join(', ') : b.transport_persons)}</div>
<div class="col-md-6 col-xl-3"><h3 class="mt-0">Transport and stay</h3>${kv('Transport', esc(`${b.transport_name} ${b.transport_type}`))}${b.departure_time ? kv('Departure time', esc(b.departure_time)) : ''}${kv('Room', esc(`${b.room_type}, ${b.bed_count} bed${b.bed_count === 1 ? '' : 's'}`))}${kv('Nights', b.nights)}${kv('Meals', b.meals.length ? b.meals.map(esc).join('<br>') : 'None')}</div>
<div class="col-md-6 col-xl-3"><h3 class="mt-0">Money</h3>${kv('Transport', tk(b.transport_cost))}${kv('Hotel', tk(b.hotel_cost))}${kv('Meals', tk(b.meal_cost))}${b.discount ? kv('Discount', '-' + tk(b.discount)) : ''}${kv('Total', `<strong>${tk(b.final_total)}</strong>`)}
${kv('Demo payment', b.method ? esc(`${b.method}, ID ${b.transaction_id}`) : 'Not paid')}${kv('Demo advance', b.advance ? tk(b.advance) : '-')}${kv('Due later', b.remaining ? tk(b.remaining) : '-')}${b.status === 'confirmed' && b.refund_due ? kv('Manual refund to arrange', tk(b.refund_due)) : ''}${b.status === 'cancelled' ? kv('Refund to give back', tk(b.refund_amount)) : ''}</div>
</div></div></div></div>`).join('') || '<p class="mut">No bookings yet.</p>'}</div>`
    + (fbs.length ? `<h2 class="mt-4">Feedback <small class="text-secondary fs-6">${(fbs.reduce((s, f) => s + f.rating, 0) / fbs.length).toFixed(1)} / 5 from ${fbs.length} reviews</small></h2><ul class="list-group mb-3">${fbs.map(f => `<li class="list-group-item"><div class="d-flex justify-content-between gap-2"><strong>${esc(f.username)}${f.customer_code ? ` <span class="text-secondary fw-normal">on ${esc(f.customer_code)}</span>` : ''}</strong><span class="text-warning">${stars(f.rating)}</span></div><div>${esc(f.comment)}</div><small class="text-secondary">${esc(f.created_at)}</small></li>`).join('')}</ul>` : '') + (users.length ? `<h2 class="mt-4">Users</h2><div class="scroll"><table><tr><th>User</th><th>Email</th><th>Mobile</th><th>Role</th></tr>
${users.map(u => `<tr><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td>${esc(u.mobile)}</td><td><select data-role="${u.id}">${['customer', 'moderator', 'admin'].map(r => opt(r, r, r === u.role)).join('')}</select></td></tr>`).join('')}</table></div>` : '');
}

function forgot() {
  $('#app').innerHTML = `<h1>Reset your password</h1><form class="panel" data-act="forgot"><p class="mut">Enter the email registered to your account. Check your inbox and spam folder for the 6-digit code.</p><label>Email on your account<input name="email" type="email" required autocomplete="email"></label><button>Email me a code</button></form>`;
}

async function profile() {
  if (!me) {
    $('#app').innerHTML = `<section class="profile-auth"><div class="profile-auth-intro"><span class="section-kicker">YOUR TRAVEL ACCOUNT</span><h1>Log in to continue</h1><p class="mut">Access your profile, plan trips and manage your bookings.</p></div>${authPanel()}</section>`;
    return;
  }
  const [u, list, preferences, catalogData] = await Promise.all([
    api('/auth/profile'), api('/bookings/mine'), api('/bookings/preferences'), api('/catalog'),
  ]);
  cat = catalogData;
  const profileParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const foodBookingId = profileParams.get('food');
  const foodBooking = list.find(booking => String(booking.id) === foodBookingId && booking.status !== 'cancelled');
  const editableBookings = list.filter(booking => booking.status !== 'cancelled' && booking.travel_date >= today());
  $('#app').innerHTML = `<div class="profile-heading"><div><span class="section-kicker">YOUR ACCOUNT</span><h1>Your profile</h1><p class="mut">View and update your personal details.</p></div><span class="profile-user">${esc(u.username)}</span></div><div class="grid">
<form class="panel" data-act="profile"><h2>Details</h2><p class="mut">Username: ${esc(u.username)}</p>
<label>Email (payment codes are sent here)<input name="email" type="email" value="${esc(u.email)}" required></label>
<label>Mobile<input name="mobile" value="${esc(u.mobile)}" pattern="01[0-9]{9}" required></label>
<label>Age<input name="age" type="number" min="12" max="100" value="${esc(u.age)}"></label>
<label>Current password (only needed if you change your email)${pwInput('password', 'autocomplete="current-password"')}</label>
<button>Save details</button></form>
<form class="panel" data-act="chpw"><h2>Change password</h2>
<label>Old password${pwInput('old_password', 'required autocomplete="current-password"')}</label>
${pwField('new_password', 'New password', 'new-password')}<button>Change password</button></form></div>
<section class="profile-food panel"><span class="section-kicker">YOUR FOOD</span><h2>Default food preferences</h2>
<p class="mut">We will preselect these dishes when a restaurant menu has a matching item. You can still choose a different meal for every traveller.</p>
<form data-act="food-preferences" class="food-preferences-grid">${['breakfast', 'lunch', 'dinner', 'snacks'].map(type => {
    const items = type === 'snacks' ? cat.snacks : cat.meals.filter(item => item.meal_type === type);
    const names = [...new Set(items.map(item => item.name))];
    return `<label>${type[0].toUpperCase() + type.slice(1)} preference<select name="${type}">
<option value="">No default</option>${names.map(name => opt(name, name, preferences[type] === name)).join('')}</select></label>`;
  }).join('')}<button>Save food preferences</button></form></section>
<section class="profile-food panel"><span class="section-kicker">YOUR BOOKINGS</span><h2>Edit a trip</h2>
<p class="mut">Update trip details before travel. The total and any manual refund due are recalculated when you save.</p>
${editableBookings.length
    ? `<div class="profile-food-bookings">${editableBookings.map(booking =>
      `<a class="profile-food-booking" href="#/plan?edit=${encodeURIComponent(booking.id)}"><strong>${esc(booking.package || booking.division)}</strong>
<span>${esc(booking.travel_date)} · ${booking.status} · ${esc(booking.customer_code)}${booking.refund_due ? ` · Refund due: ${tk(booking.refund_due)}` : ''}</span><b>Edit trip →</b></a>`).join('')}</div>`
    : '<p class="mut">No upcoming bookings to edit.</p>'}
</section>
<section class="profile-food panel"><span class="section-kicker">BOOKING MEALS</span><h2>Update food for a trip</h2>
<p class="mut">Open any active booking to update restaurant orders, including while your trip is in progress. Your booking total and remaining due will be recalculated.</p>
${list.filter(booking => booking.status !== 'cancelled').length
    ? `<div class="profile-food-bookings">${list.filter(booking => booking.status !== 'cancelled').map(booking =>
      `<a class="profile-food-booking" href="#/profile?food=${encodeURIComponent(booking.id)}"><strong>${esc(booking.package || booking.division)}</strong>
<span>${esc(booking.travel_date)} · ${booking.status} · ${esc(booking.customer_code)}</span><b>Update food →</b></a>`).join('')}</div>`
    : '<p class="mut">No active bookings yet.</p>'}
${foodBooking ? `<div class="profile-food-editor"><h3>${esc(foodBooking.package || foodBooking.division)} · ${esc(foodBooking.customer_code)}</h3>
<p class="mut">Current total: ${tk(foodBooking.final_total)}${foodBooking.remaining ? ` · Remaining due: ${tk(foodBooking.remaining)}` : ''}${foodBooking.refund_due ? ` · Manual refund due: ${tk(foodBooking.refund_due)}` : ''}</p>
<div id="profile-food-order"></div></div>` : ''}
</section>`;
  if (foodBooking) {
    const { stops } = await api('/catalog/restaurants?package_id=' + encodeURIComponent(foodBooking.package_id));
    mountFoodEditor($('#profile-food-order'), stops, {
      days: foodBooking.nights, persons: foodBooking.transport_persons,
      initialOrders: foodBooking.food_orders, preferences,
      onSave: async orders => {
        const result = await api(`/bookings/${foodBooking.id}/food`, 'PUT', { food_orders: orders });
        toast(`Food order updated. New total: ${tk(result.booking.final_total)}${result.booking.remaining ? ` · Due: ${tk(result.booking.remaining)}` : ''}`);
        await profile();
      },
    });
  }
}

const ENT = {
  transports: ['Transports', [['name', 'Name'], ['type', 'Type (AC or Non-AC)'], ['route', 'Route'], ['capacity', 'Seats', 'number'], ['cost_per_person', 'Base fare per seat', 'number']]],
  hotel_rooms: ['Hotel rooms', [['room_type', 'Room type'], ['price_per_night', 'Price a night', 'number'], ['capacity', 'Sleeps', 'number'], ['bed_count', 'Beds', 'number']]],
  meal_items: ['Meal items', [['meal_type', 'Meal', ['breakfast', 'lunch', 'dinner']], ['name', 'Item'], ['price', 'Price', 'number'], ['image_url', 'Photo URL or /images/ path', 'image']]],
  snack_items: ['Snacks', [['name', 'Item'], ['price', 'Price', 'number'], ['image_url', 'Photo URL or /images/ path', 'image']]],
  packages: ['Trip packages', [['division_id', 'Division', 'div'], ['name', 'Name'], ['best_for', 'Best for'], ['stops', 'Stops, one per line', 'area']]],
  route_distances: ['Route distances', [['start_district_id', 'Starting district', 'district'], ['package_id', 'Tour package / final stop', 'package'], ['distance_km', 'One-way distance (km)', 'number']]],
};
const cell = ([n, l, t], v) => `<label>${l}${t === 'area' ? `<textarea name="${n}" rows="4" required>${esc(v)}</textarea>`
  : t === 'div' ? `<select name="${n}">${cat.divisions.map(d => opt(d.id, d.name, d.id == v)).join('')}</select>`
  : t === 'district' ? `<select name="${n}"><option value="" disabled${v ? '' : ' selected'}>Choose a starting district</option>${cat.districts.map(d => {
    const division = cat.divisions.find(x => x.id === d.division_id);
    return opt(d.id, `${d.name} (${division?.name || 'Unknown division'})`, d.id == v);
  }).join('')}</select>`
  : t === 'package' ? `<select name="${n}"><option value="" disabled${v ? '' : ' selected'}>Choose a tour package</option>${cat.packages.map(p => opt(p.id, `${p.name} → ${p.stops[p.stops.length - 1] || p.name}`, p.id == v)).join('')}</select>`
  : t === 'image' ? `<input name="${n}" value="${esc(v)}" placeholder="/images/meal.jpg" required>`
  : Array.isArray(t) ? `<select name="${n}">${t.map(x => opt(x, x, x === v)).join('')}</select>`
  : `<input name="${n}" value="${esc(v)}" required ${t === 'number' ? `type="number" min="${n === 'distance_km' ? '0.01' : ['capacity', 'bed_count'].includes(n) ? '1' : '0'}" step="any"` : ''}>`}</label>`;

async function catalog() {
  cat = await api('/catalog');
  const src = { transports: cat.transports, hotel_rooms: cat.rooms, meal_items: cat.meals, snack_items: cat.snacks, packages: cat.packages.map(p => ({ ...p, stops: p.stops.join('\n') })), route_distances: cat.routeDistances };
  $('#app').innerHTML = '<h1>Catalog</h1><p class="mut">Changes show up for customers straight away. Transport fares use the higher of route distance or base fare; AC transport has a 50% premium. Enter the one-way km for every source-district and package route under Route distances. Hotel room entries include bed count and nightly price.</p>' + Object.entries(ENT).map(([k, [title, fs]]) =>
    `<details class="panel item"${k === openEnt ? ' open' : ''}><summary><strong>${title}</strong> (${src[k].length})</summary>${[...src[k], {}].map(row =>
      `<form class="crow" data-act="save" data-ent="${k}" data-id="${row.id || ''}">${fs.map(f => cell(f, row[f[0]] ?? '')).join('')}<div><button>${row.id ? 'Save' : 'Add new'}</button>${row.id ? ` <button type="button" class="ghost" data-act="del" data-ent="${k}" data-id="${row.id}">Delete</button>` : ''}</div></form>`).join('')}</details>`).join('');
}

document.addEventListener('submit', async e => {
  const f = e.target, a = f.dataset.act, d = Object.fromEntries(new FormData(f));
  if (a === 'save') e.preventDefault();
  try {
    if (a === 'forgot') {
      await api('/auth/forgot', 'POST', d); toast('If that email has an account, a code is on its way');
      $('#app').innerHTML = `<h1>Enter the code</h1><form class="panel" data-act="verify-reset-code"><input type="hidden" name="email" value="${esc(d.email)}">
<label>6-digit code${otpInput('code')}</label><button>Verify code</button> <a href="#/forgot">Send another code</a></form>`;
    } else if (a === 'verify-reset-code') {
      await api('/auth/reset/verify', 'POST', d); toast('Code verified. Set a new password.');
      $('#app').innerHTML = `<h1>Set a new password</h1><form class="panel" data-act="reset">
<input type="hidden" name="email" value="${esc(d.email)}"><input type="hidden" name="code" value="${esc(d.code)}">
${pwField('new_password', 'New password', 'new-password')}<button>Reset password</button></form>`;
    } else if (a === 'reset') { await api('/auth/reset', 'POST', d); toast('Password reset. Log in with the new one.'); location.hash = '#/profile';
    } else if (a === 'profile') { await api('/auth/profile', 'PATCH', d); toast('Details saved'); f.password.value = '';
    } else if (a === 'food-preferences') {
      await api('/bookings/preferences', 'PUT', d);
      toast('Food preferences saved');
      await profile();
    } else if (a === 'chpw') { await api('/auth/change-password', 'POST', d); toast('Password changed'); f.reset();
    } else if (a === 'save') {
      const id = f.dataset.id; await api('/admin/catalog/' + f.dataset.ent + (id ? '/' + id : ''), id ? 'PUT' : 'POST', d);
      openEnt = f.dataset.ent;
      await catalog();
      toast('Saved');
    }
  } catch (err) { toast(err.message, 1); }
});

document.addEventListener('click', async e => {
  const eye = e.target.closest('.pw-toggle');
  if (eye) {
    const input = eye.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    eye.setAttribute('aria-pressed', String(show));
    eye.title = show ? 'Hide password' : 'Show password';
    return;
  }
  const t = e.target.closest('[data-tab]');
  if (t) {
    document.querySelectorAll('.tabs [data-tab], #nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t.dataset.tab));
    $('#f-login').hidden = t.dataset.tab !== 'login'; $('#f-register').hidden = t.dataset.tab !== 'register';
    return;
  }
  const go = e.target.closest('[data-go]');
  if (go) {
    const tab = go.dataset.go === 'meals' ? $('#meal-tab') : $('#trip-tab');
    bootstrap.Tab.getOrCreateInstance(tab).show();
    return;
  }
  const b = e.target.closest('[data-act]');
  try {
    if (b?.dataset.act === 'otp') {
      const form = b.closest('form');
      if (!form.reportValidity()) return;
      const old = b.textContent; b.disabled = true; b.textContent = 'Sending...';
      try {
        const result = await api(`/payments/${b.dataset.id}/otp`, 'POST', {
          method: form.elements.method.value, account: form.elements.account.value,
        });
        const panel = form.querySelector('.payment-code-panel');
        panel.hidden = false;
        panel.querySelectorAll('.otp-digit').forEach(input => { input.required = true; });
        panel.querySelector('.otp-digit')?.focus();
        toast('Code sent to ' + result.sent_to);
      } finally { b.disabled = false; b.textContent = old; }
    }
    if (b?.dataset.act === 'del' && confirm('Delete this item?')) {
      await api(`/admin/catalog/${b.dataset.ent}/${b.dataset.id}`, 'DELETE'); toast('Deleted'); openEnt = b.dataset.ent; catalog();
    }
  } catch (err) { toast(err.message, 1); }
});

document.addEventListener('input', e => {
  const i = e.target;
  if (i.classList.contains('otp-digit')) {
    const digits = [...i.closest('.otp-entry').querySelectorAll('.otp-digit')];
    const index = digits.indexOf(i), value = i.value.replace(/\D/g, '');
    if (value.length > 1) {
      value.slice(0, digits.length - index).split('').forEach((digit, offset) => { digits[index + offset].value = digit; });
    }
    i.value = value.slice(-1);
    const code = digits.map(d => d.value).join('');
    i.closest('.otp-entry').querySelector('input[type=hidden]').value = code;
    if (i.value && i.value.length === 1 && !digits[index + 1]?.value) digits[index + 1]?.focus();
  }
  if (i.id === 'bk-filter') document.querySelectorAll('#bk-acc .accordion-item').forEach(x => x.hidden = !x.dataset.q.includes(i.value.trim().toLowerCase()));
  if (i.dataset.check === 'password') {
    const s = strength(i.value, i.form.username?.value || ''), bar = i.form.querySelector('.pw-bar'), msg = i.form.querySelector('.pw-msg');
    bar.style.width = i.value ? s.pct + '%' : '0'; bar.className = 'progress-bar pw-bar ' + s.bar;
    msg.className = 'form-text pw-msg ' + (!i.value ? '' : s.ok ? 'text-success' : 'text-danger');
    msg.textContent = !i.value ? 'Use 8+ characters with 3 of: small letter, capital letter, number, symbol.' : `Password strength: ${s.level}` + (s.ok ? '' : '. Make it longer and mix letters, numbers and symbols.');
  }
  if (i.dataset.check === 'username') {
    clearTimeout(userTimer); const m = $('#u-msg');
    userTimer = setTimeout(async () => {
      if (!i.value) { m.className = 'form-text'; m.textContent = '3-20 letters, numbers or underscore. It must be unique.'; return; }
      try {
        const r = await api('/auth/username-available?u=' + encodeURIComponent(i.value));
        m.className = 'form-text ' + (r.valid && r.available ? 'text-success' : 'text-danger');
        m.textContent = !r.valid ? 'Use 3-20 letters, numbers or underscore' : r.available ? 'This username is available' : 'This username is already taken';
      } catch {}
    }, 350);
  }
});

document.addEventListener('keydown', e => {
  if (!e.target.classList.contains('otp-digit')) return;
  const digits = [...e.target.closest('.otp-entry').querySelectorAll('.otp-digit')], index = digits.indexOf(e.target);
  if (e.key === 'Backspace' && !e.target.value) digits[index - 1]?.focus();
  if (e.key === 'ArrowLeft') digits[index - 1]?.focus();
  if (e.key === 'ArrowRight') digits[index + 1]?.focus();
});

document.addEventListener('paste', e => {
  if (!e.target.classList.contains('otp-digit')) return;
  const value = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
  if (!value) return;
  e.preventDefault();
  const digits = [...e.target.closest('.otp-entry').querySelectorAll('.otp-digit')], start = digits.indexOf(e.target);
  value.split('').forEach((digit, i) => { if (digits[start + i]) digits[start + i].value = digit; });
  digits[0].dispatchEvent(new Event('input', { bubbles: true }));
  digits[start + Math.min(value.length, digits.length - start) - 1]?.focus();
});

const stars = n => '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
const miniLoader = () => `<div class="mini-loader">${$('#loader .car').outerHTML}<div class="road"></div><p class="mb-0 mt-2 fw-bold" style="color:var(--green)">Loading<span class="dots"></span></p></div>`;

async function feedback() {
  const [mine, bks] = await Promise.all([api('/feedback/mine'), api('/bookings/mine')]);
  const used = new Set(mine.map(m => m.booking_id)), options = bks.filter(b => b.status !== 'cancelled' && !used.has(b.id));
  $('#app').innerHTML = `<h1>Your feedback</h1><div class="grid"><form class="panel" data-act="feedback"><h2>How was your experience?</h2>
<div class="stars" role="radiogroup" aria-label="Rating">${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="star${n}" value="${n}" required><label for="star${n}" title="${n} stars">\u2605</label>`).join('')}</div>
<label>About which booking? <span class="text-secondary fw-normal">(optional)</span><select name="booking_id"><option value="">General feedback</option>${options.map(b => opt(b.id, `${b.customer_code}, ${b.package || b.division}`)).join('')}</select></label>
<label>Your comment<textarea name="comment" rows="4" required minlength="3" maxlength="500"></textarea></label><button>Send feedback</button></form>
<div class="panel"><h2>What you sent</h2>${mine.length ? mine.map(m => `<div class="mb-3"><div class="text-warning">${stars(m.rating)}</div><div>${esc(m.comment)}</div><small class="text-secondary">${esc(m.created_at)}${m.customer_code ? ', ' + esc(m.customer_code) : ''}</small></div>`).join('') : '<p class="mut">Nothing yet. Tell us how we did.</p>'}</div></div>`;
}

document.addEventListener('submit', async e => {
  if (e.target.dataset.act !== 'feedback') return;
  try { await api('/feedback', 'POST', Object.fromEntries(new FormData(e.target))); toast('Thank you for your feedback'); feedback(); }
  catch (err) { toast(err.message, 1); }
});

document.addEventListener('click', e => {
  const fl = e.target.closest('[data-filter]'); if (!fl) return;
  document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === fl));
  document.querySelectorAll('.booking-card[data-st]').forEach(a => a.hidden = fl.dataset.filter === 'cancelled' ? a.dataset.st !== 'cancelled' : fl.dataset.filter === 'active' ? a.dataset.st === 'cancelled' : false);
});
