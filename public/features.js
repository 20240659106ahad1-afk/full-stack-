// Bootstrap-powered pages: plan, bookings, admin, profile, catalog, plus account helpers.
let openEnt, userTimer;
const METHODS = ['Bkash', 'Nagad', 'Rocket', 'Bank'];
const today = () => new Date().toLocaleDateString('en-CA');

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
  d.meal_plan = Array.from({ length: Math.min(Math.max(+f.nights.value || 1, 1), 7) }, (_, day) =>
    Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snacks'].map(type => [
      type,
      f.querySelector(`[data-meal-day="${day}"][data-meal-type="${type}"]`).value || null,
    ])));
  return d;
};

async function plan() {
  cat = await api('/catalog');
  $('#app').innerHTML = `<section class="destination-banner" id="destination-banner"><img id="destination-photo" alt="" fetchpriority="high" hidden><div class="destination-shade"></div><div class="destination-copy"><span class="eyebrow">YOUR NEXT BANGLADESH GETAWAY</span><h1 id="destination-title">Choose a destination</h1><p id="destination-details">Select a destination division to explore available tours.</p></div></section><div class="plan">
<form id="trip" class="panel" data-act="book">
<ul class="nav nav-tabs mb-3" role="tablist">
<li class="nav-item"><button type="button" class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-trip">1. Trip and stay</button></li>
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
<label>Number of seats to book<input name="persons" type="number" min="1" value="2" required></label>
<h3 class="step"><b>3</b>Where will you stay?</h3>
<label>Hotel room<select name="room_id">${cat.rooms.map(r => opt(r.id, `${r.room_type}, ${r.bed_count} bed${r.bed_count === 1 ? '' : 's'}, sleeps ${r.capacity}, ${r.price_per_night} Tk a night`)).join('')}</select></label>
<label>Nights<input name="nights" type="number" min="1" value="2"></label>
<button type="button" class="ghost mt-3" data-go="meals">Next: customize meals</button></div>
<div class="tab-pane fade" id="tab-meals">
<h3 class="step"><b>4</b>Choose your food <small>select breakfast, lunch, dinner and snacks separately for each day</small></h3>
<div id="day-plan"></div><button type="button" class="ghost" data-act="copyday">Use Day 1 for every day</button>
<div><button type="submit" class="mt-4">Payment</button></div></div>
 </div></form>
<aside class="ticket" id="ticket">${miniLoader()}</aside></div>`;
  const f = $('#trip'); let avail = {};
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
    f.persons.max = left || 1;
    $('#seats').innerHTML = f.travel_date.value
      ? `<div class="progress mt-2" style="height:8px"><div class="progress-bar ${pct > 50 ? 'bg-success' : pct > 20 ? 'bg-warning' : 'bg-danger'}" style="width:${pct}%"></div></div>
<small class="text-secondary">${left} of ${t.capacity} seats left on ${esc(f.travel_date.value)}. ${left ? `You can book up to ${left}.` : 'This vehicle is full on this date.'}</small>`
      : '<small class="text-secondary">Choose your travel date to check seat availability.</small>';
  };
  const fillTransports = () => {
    const cur = f.transport_id.value;
    f.transport_id.innerHTML = cat.transports.map(t => { const left = avail[t.id] ?? t.capacity;
      return `<option value="${t.id}"${left ? '' : ' disabled'}${t.id == cur ? ' selected' : ''}>${esc(`${t.name} ${t.type}, ${left}/${t.capacity} seats left`)}</option>`; }).join('');
    seatUI();
  };
  const loadSeats = async () => {
    if (!f.travel_date.value) {
      avail = {};
      fillTransports();
      return;
    }
    try { avail = Object.fromEntries((await api('/bookings/availability?date=' + f.travel_date.value)).map(x => [x.id, x.left])); } catch { avail = {}; }
    fillTransports();
  };
  const dayPlan = () => {
    const n = Math.min(Math.max(+f.nights.value || 1, 1), 7);
    const old = [...f.querySelectorAll('.meal-choice')].map(s => [s.dataset.mealDay, s.dataset.mealType, s.value]);
    const oldSelections = new Map(old.map(([day, type, value]) => [`${day}:${type}`, value]));
    const labels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
    $('#day-plan').innerHTML = Array.from({ length: n }, (_, day) => `<section class="meal-day">
<h4>Day ${day + 1}</h4><div class="meal-choice-grid">${Object.entries(labels).map(([type, label]) => {
      const items = type === 'snacks' ? cat.snacks : cat.meals.filter(item => item.meal_type === type);
      const selected = items.find(item => item.id == oldSelections.get(`${day}:${type}`));
      return `<label class="meal-choice-field">${label}
<select class="meal-choice" data-meal-day="${day}" data-meal-type="${type}"><option value="">Skip ${label.toLowerCase()}</option>
${items.map(item => opt(item.id, `${item.name} · ${tk(item.price)}`, selected?.id === item.id)).join('')}</select>
<img class="meal-choice-photo" src="${esc(selected?.image_url || `/images/meal-${type}.jpg`)}" alt="${esc(selected?.name || `${label} options`)}" loading="lazy"></label>`;
    }).join('')}</div></section>`).join('')
      + (+f.nights.value > 7 ? '<p class="text-secondary small">Meals can be customized for the first 7 days.</p>' : '');
  };
  const quote = async () => {
    const ticket = $('#ticket');
    if (!ticket) return;
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
        .map(([type, label]) => `<div class="ln"><span>${label}</span><span>${tk(q.mealBreakdown[type])}</span></div>`).join('');
      ticket.innerHTML = `<h2>${esc(p ? p.name : 'Your trip')}</h2><p>${p ? esc(p.stops.join(' to ')) : ''}</p>
<div class="ln"><span>Distance (one way)</span><span>${q.distanceKm} km to ${esc(q.finalStop)}</span></div>
<div class="ln"><span>Fare per seat (${esc(transport?.type || '')})</span><span>${q.distanceKm} km × ৳1${q.acSurchargePerSeat ? ' + ৳20 AC fee' : ''} = ${tk(q.oneWayFarePerPerson)}</span></div>
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
    if (f.dataset.id || (!['start_district_id', 'destination_division_id', 'package_id', 'nights', 'travel_date', 'transport_id', 'persons', 'room_id'].includes(n)
      && !e.target.classList.contains('meal-choice'))) return;
    if (n === 'nights') dayPlan();
    if (n === 'travel_date') await loadSeats();
    if (n === 'transport_id') seatUI();
    clearTimeout(quoteTimer); quoteTimer = setTimeout(quote, 250);
  });
  f.addEventListener('change', e => {
    if (e.target.name === 'destination_division_id') { fillPackages(); updateDestination(); }
    if (e.target.name === 'package_id') updateDestination();
    if (e.target.classList.contains('meal-choice')) {
      const { mealType } = e.target.dataset;
      const items = mealType === 'snacks' ? cat.snacks : cat.meals.filter(item => item.meal_type === mealType);
      const selected = items.find(item => item.id == e.target.value);
      const image = e.target.parentElement.querySelector('.meal-choice-photo');
      image.src = selected?.image_url || `/images/meal-${mealType}.jpg`;
      image.alt = selected?.name || `${mealType} options`;
    }
  });
  fillPackages(); updateDestination(); dayPlan(); fillTransports(); quote();
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
<div><span>Date and seats booked</span><strong>${esc(booking.travel_date)} · ${booking.transport_persons}</strong></div>
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
<p class="mut">Demo mode: no real payment is processed. A test transaction ID will be generated after email verification.</p>
<label>Payment method<select name="method">${METHODS.map(method => `<option>${method}</option>`).join('')}</select></label>
<button type="button" class="ghost" data-act="otp" data-id="${booking.id}">Email me a code</button>
<div class="payment-code-panel" hidden><p class="mut">Enter the 6-digit code sent to your email.</p>
<label>6-digit email code${otpInput('otp')}</label><button type="submit">Confirm booking</button></div></form>`
    : `<p class="booking-cancelled">${booking.status === 'confirmed' ? 'This booking is already confirmed.' : 'This booking has been cancelled.'}</p>`}
<a class="success-back" href="#/bookings">Back to my bookings</a></section>`;
  document.querySelectorAll('.booking-payment .payment-code-panel .otp-digit').forEach(input => { input.required = false; });
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
<div class="booking-row"><span>Seats booked</span><strong>${b.transport_persons}</strong></div>
<div class="booking-row"><span>Transport</span><strong>${esc(b.transport_name)}</strong></div>
<div class="booking-row"><span>Hotel room</span><strong>${esc(`${b.room_type}, ${b.bed_count} bed${b.bed_count === 1 ? '' : 's'}`)}</strong></div>
<div class="booking-row"><span>Nights</span><strong>${b.nights}</strong></div>
${b.meals.length ? `<div class="booking-row"><span>Meals</span><strong>${b.meals.map(esc).join(', ')}</strong></div>` : ''}
</section><section class="booking-facts booking-money"><h2>Price summary</h2>
<div class="booking-row"><span>Total price</span><strong>${tk(b.final_total)}</strong></div>
${b.discount ? `<div class="booking-row discount"><span>Discount</span><strong>-${tk(b.discount)}</strong></div>` : ''}
${b.advance ? `<div class="booking-row paid"><span>Advance paid</span><strong>${tk(b.advance)}</strong></div><div class="booking-row due"><span>Remaining due</span><strong>${tk(b.remaining)}</strong></div>` : `<div class="booking-row"><span>Advance required (50%)</span><strong>${tk(b.final_total / 2)}</strong></div>`}
${b.method ? `<div class="booking-row"><span>Payment method</span><strong>${esc(b.method)}</strong></div><div class="booking-row"><span>Demo transaction ID</span><strong class="transaction-id">${esc(b.transaction_id)}</strong></div>` : ''}
</section></div>
${b.meals.length ? `<p class="booking-meals"><strong>Meal selections</strong><span>${b.meals.map(esc).join(' · ')}</span></p>` : ''}
${b.status === 'pending' ? `<form class="booking-payment" data-act="pay" data-id="${b.id}"><h2>Confirm your booking</h2><p class="mut mb-0">Your seats are held for 30 minutes after booking.</p>
<label>Payment method<select name="method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></label>
<p class="mut">Demo mode: no real payment is processed. A test transaction ID will be generated automatically.</p>
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
<div class="col-md-6 col-xl-3"><h3 class="mt-0">Trip</h3>${kv('From', esc(b.start_district))}${kv('To', esc(b.division))}${kv('Package', esc(b.package))}${b.distance_km ? kv('Route distance (one way)', `${b.distance_km} km`) : ''}${kv('Travel date', esc(b.travel_date))}${kv('Seats booked', b.transport_persons)}</div>
<div class="col-md-6 col-xl-3"><h3 class="mt-0">Transport and stay</h3>${kv('Transport', esc(`${b.transport_name} ${b.transport_type}`))}${kv('Room', esc(`${b.room_type}, ${b.bed_count} bed${b.bed_count === 1 ? '' : 's'}`))}${kv('Nights', b.nights)}${kv('Meals', b.meals.length ? b.meals.map(esc).join('<br>') : 'None')}</div>
<div class="col-md-6 col-xl-3"><h3 class="mt-0">Money</h3>${kv('Transport', tk(b.transport_cost))}${kv('Hotel', tk(b.hotel_cost))}${kv('Meals', tk(b.meal_cost))}${b.discount ? kv('Discount', '-' + tk(b.discount)) : ''}${kv('Total', `<strong>${tk(b.final_total)}</strong>`)}
${kv('Demo payment', b.method ? esc(`${b.method}, ID ${b.transaction_id}`) : 'Not paid')}${kv('Demo advance', b.advance ? tk(b.advance) : '-')}${kv('Due later', b.remaining ? tk(b.remaining) : '-')}${b.status === 'cancelled' ? kv('Refund to give back', tk(b.refund_amount)) : ''}</div>
</div></div></div></div>`).join('') || '<p class="mut">No bookings yet.</p>'}</div>`
    + (fbs.length ? `<h2 class="mt-4">Feedback <small class="text-secondary fs-6">${(fbs.reduce((s, f) => s + f.rating, 0) / fbs.length).toFixed(1)} / 5 from ${fbs.length} reviews</small></h2><ul class="list-group mb-3">${fbs.map(f => `<li class="list-group-item"><div class="d-flex justify-content-between gap-2"><strong>${esc(f.username)}${f.customer_code ? ` <span class="text-secondary fw-normal">on ${esc(f.customer_code)}</span>` : ''}</strong><span class="text-warning">${stars(f.rating)}</span></div><div>${esc(f.comment)}</div><small class="text-secondary">${esc(f.created_at)}</small></li>`).join('')}</ul>` : '') + (users.length ? `<h2 class="mt-4">Users</h2><div class="scroll"><table><tr><th>User</th><th>Email</th><th>Mobile</th><th>Role</th></tr>
${users.map(u => `<tr><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td>${esc(u.mobile)}</td><td><select data-role="${u.id}">${['customer', 'moderator', 'admin'].map(r => opt(r, r, r === u.role)).join('')}</select></td></tr>`).join('')}</table></div>` : '');
}

function forgot() {
  $('#app').innerHTML = `<h1>Reset your password</h1><form class="panel" data-act="forgot"><label>Email on your account<input name="email" type="email" required></label><button>Email me a code</button></form>`;
}

async function profile() {
  if (!me) {
    $('#app').innerHTML = `<section class="profile-auth"><div class="profile-auth-intro"><span class="section-kicker">YOUR TRAVEL ACCOUNT</span><h1>Log in to continue</h1><p class="mut">Access your profile, plan trips and manage your bookings.</p></div>${authPanel()}</section>`;
    return;
  }
  const u = await api('/auth/profile');
  $('#app').innerHTML = `<div class="profile-heading"><div><span class="section-kicker">YOUR ACCOUNT</span><h1>Your profile</h1><p class="mut">View and update your personal details.</p></div><span class="profile-user">${esc(u.username)}</span></div><div class="grid">
<form class="panel" data-act="profile"><h2>Details</h2><p class="mut">Username: ${esc(u.username)}</p>
<label>Email (payment codes are sent here)<input name="email" type="email" value="${esc(u.email)}" required></label>
<label>Mobile<input name="mobile" value="${esc(u.mobile)}" pattern="01[0-9]{9}" required></label>
<label>Age<input name="age" type="number" min="12" max="100" value="${esc(u.age)}"></label>
<label>Current password (only needed if you change your email)${pwInput('password', 'autocomplete="current-password"')}</label>
<button>Save details</button></form>
<form class="panel" data-act="chpw"><h2>Change password</h2>
<label>Old password${pwInput('old_password', 'required autocomplete="current-password"')}</label>
${pwField('new_password', 'New password', 'new-password')}<button>Change password</button></form></div>`;
}

const ENT = {
  transports: ['Transports', [['name', 'Name'], ['type', 'Type (AC or Non-AC)'], ['route', 'Route'], ['capacity', 'Seats', 'number']]],
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
  $('#app').innerHTML = '<h1>Catalog</h1><p class="mut">Changes show up for customers straight away. Transport costs ৳2 per seat per one-way km, plus a ৳20 per-seat AC fee. Enter the Google Maps one-way km for every source-district and package route you offer under Route distances; no routes are imported yet. Hotel room entries include bed count and nightly price.</p>' + Object.entries(ENT).map(([k, [title, fs]]) =>
    `<details class="panel item"${k === openEnt ? ' open' : ''}><summary><strong>${title}</strong> (${src[k].length})</summary>${[...src[k], {}].map(row =>
      `<form class="crow" data-act="save" data-ent="${k}" data-id="${row.id || ''}">${fs.map(f => cell(f, row[f[0]] ?? '')).join('')}<div><button>${row.id ? 'Save' : 'Add new'}</button>${row.id ? ` <button type="button" class="ghost" data-act="del" data-ent="${k}" data-id="${row.id}">Delete</button>` : ''}</div></form>`).join('')}</details>`).join('');
}

document.addEventListener('submit', async e => {
  const f = e.target, a = f.dataset.act, d = Object.fromEntries(new FormData(f));
  if (a === 'save') e.preventDefault();
  try {
    if (a === 'forgot') {
      await api('/auth/forgot', 'POST', d); toast('If that email has an account, a code is on its way');
      $('#app').innerHTML = `<h1>Enter the code</h1><form class="panel" data-act="reset"><input type="hidden" name="email" value="${esc(d.email)}">
<label>6-digit code${otpInput('code')}</label>
${pwField('new_password', 'New password', 'new-password')}<button>Set new password</button></form>`;
    } else if (a === 'reset') { await api('/auth/reset', 'POST', d); toast('Password changed. Log in with the new one.'); location.hash = '#/';
    } else if (a === 'profile') { await api('/auth/profile', 'PATCH', d); toast('Details saved'); f.password.value = '';
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
  if (e.target.closest('[data-go="meals"]')) { bootstrap.Tab.getOrCreateInstance($('#meal-tab')).show(); return; }
  const b = e.target.closest('[data-act]');
  try {
    if (b?.dataset.act === 'copyday') {
      const firstDay = [...document.querySelectorAll('.meal-choice[data-meal-day="0"]')];
      for (const source of firstDay) {
        document.querySelectorAll(`.meal-choice[data-meal-type="${source.dataset.mealType}"]`).forEach(target => {
          target.value = source.value;
        });
      }
      firstDay[0]?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (b?.dataset.act === 'otp') {
      const old = b.textContent; b.disabled = true; b.textContent = 'Sending...';
      try {
        const result = await api(`/payments/${b.dataset.id}/otp`, 'POST');
        const panel = b.closest('form').querySelector('.payment-code-panel');
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
