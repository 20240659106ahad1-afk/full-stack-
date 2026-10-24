const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const tk = n => Math.round(n).toLocaleString('en-US') + ' Tk';
const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
const pwInput = (name, attrs = '') => `<span class="pw-wrap"><input name="${name}" type="password" ${attrs}><button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false" title="Show password"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span>`;
const otpInput = name => `<span class="otp-entry" role="group" aria-label="6-digit verification code">
<input type="hidden" name="${name}" value="">
${Array.from({ length: 6 }, (_, i) => `<input class="otp-digit" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1" aria-label="Digit ${i + 1} of 6" ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} required>`).join('')}
</span>`;
const divisionPhotos = {
  Barishal: 'kuakata-beach.jpg',
  Chattogram: 'cox-bazar-beach.jpg',
  Dhaka: 'lalbagh-fort.jpg',
  Khulna: 'sundarbans.jpg',
  Mymensingh: 'birishiri.jpg',
  Rajshahi: 'puthia-temple.jpg',
  Rangpur: 'tajhat-palace.jpg',
  Sylhet: 'jaflong.jpg',
};
const packagePhotos = {
  'Southern Delta Escape': 'kuakata-beach.jpg',
  'Floating Market Tour': 'floating-market.jpg',
  'Durga Sagar and Bhola Trip': 'durga-sagar.jpg',
  'Sea and Beach Getaway': 'cox-bazar-beach.jpg',
  'Hill Tracts Explorer': 'kaptai-lake.jpg',
  'Island Escape': 'saint-martin.jpg',
  'Old Dhaka Heritage Walk': 'lalbagh-fort.jpg',
  'Sonargaon Day Trip': 'panam-nagar.jpg',
  'Modern Dhaka City Tour': 'parliament-house.jpg',
  'Sundarbans Adventure': 'sundarbans.jpg',
  'Bagerhat Heritage Tour': 'shat-gombuj-mosque.jpg',
  'Tagore Literary Trail': 'shilaidaha.jpg',
  'Garo Hills Border Trip': 'birishiri.jpg',
  'Heritage and Art Tour': 'shashi-lodge.jpg',
  'River and Village Tour': 'brahmaputra.jpg',
  'Varendra Heritage Trail': 'puthia-temple.jpg',
  'Paharpur and Mahasthangarh Tour': 'paharpur-vihara.jpg',
  'Padma Riverside Tour': 'padma-garden.jpg',
  'Rangpur Heritage Tour': 'tajhat-palace.jpg',
  'Dinajpur Temple Trail': 'kantajew-temple.jpg',
  'Tea Garden and Border Trip': 'tetulia-tea-garden.jpg',
  'Sylhet Highlights': 'jaflong.jpg',
  'Tea Garden Tour': 'sreemangal-tea-garden.jpg',
  'Haor Adventure': 'tanguar-haor.jpg',
};
const destinationImage = (name, packageName = '') => `/images/${packagePhotos[packageName] || divisionPhotos[name] || 'kuakata-beach.jpg'}`;
let me = null, cat = null, toastTimer, quoteTimer;
const showLoader = () => $('#loader').classList.add('on');
const hideLoader = () => $('#loader').classList.remove('on');

async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
function toast(m, bad) {
  const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 3500);
}

function nav() {
  const links = '<a href="#/">Home</a><a href="#/tours"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v12a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9M8 5l9 4.5"/></svg>Tour packages</a><a href="#customize-meals"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M3 12h18M8 7c0-1 .8-1.5.8-2.5M12 7c0-1 .8-1.5.8-2.5M16 7c0-1 .8-1.5.8-2.5"/></svg>Customize meals</a>';
  $('#nav').innerHTML = me
    ? `${links}<a href="#/bookings">My bookings</a><a href="#/feedback">Feedback</a>${me.role !== 'customer' ? '<a href="#/admin">Admin</a>' : ''}${me.role === 'admin' ? '<a href="#/catalog">Catalog</a>' : ''}<a href="#/profile">Profile</a><button class="ghost" data-act="logout">Log out (${esc(me.username)})</button>`
    : `${links}<a href="#/profile">Profile / Log in</a>`;
}

function authPanel() {
  return `<div class="hero-card account-card"><div class="tabs"><button type="button" class="on" data-tab="login">Log in</button><button type="button" data-tab="register">Create account</button></div>
<form id="f-login" data-act="login"><label>Username<input name="username" required autocomplete="username"></label>
<label>Password${pwInput('password', 'required autocomplete="current-password"')}</label>
<button>Log in</button> <a href="#/forgot">Forgot password?</a></form>
<form id="f-register" data-act="register" hidden><label>Username<input name="username" required minlength="3" maxlength="20" autocomplete="username" data-check="username"></label><div class="form-text" id="u-msg">3-20 letters, numbers or underscore. It must be unique.</div>
<label>Email (payment codes are sent here)<input name="email" type="email" required autocomplete="email"></label>
<label>Mobile<input name="mobile" required pattern="01[0-9]{9}" placeholder="01XXXXXXXXX"></label>
<label>Age<input name="age" type="number" min="12" max="100"></label>
${pwField('password', 'Password', 'new-password')}
<button>Create account</button></form></div>`;
}

const tourCard = (p, division) => `<article class="tour-card"><img src="${destinationImage(division?.name || '', p.name)}" alt="${esc(p.stops[1] || p.stops[0] || division?.name || 'Bangladesh')} - ${esc(p.name)}" loading="lazy"><div class="tour-card-body">
<span class="tour-location">${esc(division?.name || 'Bangladesh')}</span><h3>${esc(p.name)}</h3><p class="tour-stops">${esc(p.stops.join(' → '))}</p>
<p>${esc(p.best_for || 'Discover this beautiful destination')}</p><div class="tour-card-footer"><span>Custom trip pricing</span><a href="#/plan" class="tour-link">Plan this tour <span aria-hidden="true">↗</span></a></div></div></article>`;

async function tours() {
  cat = await api('/catalog');
  const regions = [{ id: 'all', name: 'All regions' }, ...cat.divisions];
  const cards = cat.packages.map(p => tourCard(p, cat.divisions.find(d => d.id === p.division_id)));
  $('#app').innerHTML = `<section class="listing-heading"><span class="section-kicker">FIND YOUR NEXT ESCAPE</span><h1>Tour packages</h1><p>Choose from our curated tours across Bangladesh.</p></section>
<div class="region-filters" role="group" aria-label="Filter tours by region">${regions.map((d, i) => `<button type="button" class="region-filter${i === 0 ? ' active' : ''}" data-region="${d.id}">${esc(d.name)}</button>`).join('')}</div>
<div class="tour-grid listing-tour-grid">${cards.length ? cards.join('') : '<p class="mut">No tour packages are available yet.</p>'}</div>`;
  const grid = document.querySelector('.listing-tour-grid');
  document.querySelectorAll('.region-filter').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.region-filter').forEach(x => x.classList.toggle('active', x === button));
    const id = button.dataset.region;
    grid.innerHTML = cat.packages.filter(p => id === 'all' || p.division_id == id)
      .map(p => tourCard(p, cat.divisions.find(d => d.id === p.division_id))).join('')
      || '<p class="mut">No tours found in this region yet.</p>';
  }));
}

async function bookingSuccess(id) {
  const bookings = await api('/bookings/mine');
  const booking = bookings.find(item => String(item.id) === String(id));
  if (!booking) throw new Error('Booking not found');
  const confirmed = booking.status === 'confirmed';
  $('#app').classList.remove('wide');
  $('#app').innerHTML = `<section class="booking-success panel">
<div class="success-mark" aria-hidden="true">✓</div>
<span class="section-kicker">${confirmed ? 'BOOKING CONFIRMED' : 'BOOKING REQUEST SAVED'}</span>
<h1>${confirmed ? 'Booking confirmed!' : 'Your trip is reserved!'}</h1>
<p class="success-intro">${confirmed ? 'Your booking is confirmed. Keep your booking reference for your trip.' : 'Your booking request is saved. Complete the advance payment from My bookings to confirm it.'}</p>
<div class="success-code"><span>Booking reference</span><strong>${esc(booking.customer_code)}</strong><small>Keep this reference to find your booking.</small></div>
<div class="success-summary">
<div class="success-trip"><span class="summary-label">YOUR TRIP</span><h2>${esc(booking.package || booking.division)}</h2>
<p>${esc(booking.start_district)} <span aria-hidden="true">→</span> ${esc(booking.division)}</p>
<div class="summary-meta"><span>Travel date<strong>${esc(booking.travel_date)}</strong></span><span>Seats<strong>${booking.transport_persons}</strong></span><span>Stay<strong>${esc(booking.room_type)}, ${booking.bed_count} bed${booking.bed_count === 1 ? '' : 's'}, ${booking.nights} nights</strong></span></div>
${booking.meals.length ? `<p class="success-meals"><strong>Meals selected:</strong> ${booking.meals.map(esc).join(' · ')}</p>` : ''}
</div><div class="success-price"><span class="summary-label">PRICE SUMMARY</span>
<div class="booking-row"><span>Total amount</span><strong>${tk(booking.final_total)}</strong></div>
${booking.discount ? `<div class="booking-row discount"><span>Discount</span><strong>-${tk(booking.discount)}</strong></div>` : ''}
${booking.advance ? `<div class="booking-row paid"><span>Advance paid</span><strong>${tk(booking.advance)}</strong></div><div class="booking-row due"><span>Remaining due</span><strong>${tk(booking.remaining)}</strong></div>` : `<div class="booking-row"><span>Advance to confirm (50%)</span><strong>${tk(booking.final_total / 2)}</strong></div>`}
<div class="success-status"><span>Status</span><span class="tag ${booking.status}">${booking.status}</span></div></div>
</div><div class="success-actions"><a class="cta" href="${confirmed ? '#/bookings' : `#/payment/${encodeURIComponent(booking.id)}`}">${confirmed ? 'View my bookings' : 'Pay advance'}</a><a class="success-back" href="#/tours">Explore more tours</a></div>
</section>`;
}

async function home() {
  cat = cat || await api('/catalog');
  const fb = await api('/feedback').catch(() => ({ items: [] }));
  const reviews = fb.items.length ? `<section class="home-section reviews-section"><div class="section-heading"><div><span class="section-kicker">KIND WORDS FROM TRAVELLERS</span><h2>What travellers say</h2><p>${fb.avg} / 5 from ${fb.count} reviews</p></div></div><div class="row g-3">${fb.items.map(i => `<div class="col-md-6 col-lg-4"><div class="card h-100"><div class="card-body"><div class="text-warning">${stars(i.rating)}</div><p class="mb-2">${esc(i.comment)}</p><small class="text-secondary">${esc(i.username)}</small></div></div></div>`).join('')}</div></section>` : '';
  const tiles = cat.divisions.map(d => {
    const ps = cat.packages.filter(p => p.division_id === d.id);
    const highlight = ps[0]?.best_for || 'Discover Bangladesh';
    return `<a class="tile" href="#/plan">
<img src="${destinationImage(d.name)}" alt="${esc(d.name)} travel scenery" loading="lazy">
<span class="tile-count">${ps.length} ${ps.length === 1 ? 'trip' : 'trips'}</span>
<div class="tile-copy"><h3>${esc(d.name)}</h3><p>${esc(highlight)}</p><span class="tile-link">Explore destination <span aria-hidden="true">↗</span></span></div></a>`;
  }).join('');
  const featured = cat.packages.slice(0, 6).map(p => {
    const division = cat.divisions.find(d => d.id === p.division_id);
    return tourCard(p, division);
  }).join('');
  const mealTypes = [
    ['breakfast', 'Breakfast', cat.meals.filter(m => m.meal_type === 'breakfast')],
    ['lunch', 'Lunch', cat.meals.filter(m => m.meal_type === 'lunch')],
    ['dinner', 'Dinner', cat.meals.filter(m => m.meal_type === 'dinner')],
    ['snacks', 'Snacks', cat.snacks],
  ];
  const mealCards = mealTypes.map(([type, title, items]) => `<article class="meal-card">
<div class="meal-card-heading"><span class="meal-icon" aria-hidden="true">${type === 'snacks' ? '◉' : '✳'}</span><h3>${title}</h3></div>
<div class="meal-item-list">${items.map(item => `<div class="meal-item">
<img src="${esc(item.image_url || `/images/meal-${type}.jpg`)}" alt="${esc(item.name)}" loading="lazy">
<div><strong>${esc(item.name)}</strong></div></div>`).join('')}</div>
<a href="#/plan">Next: view meal details and prices ↗</a></article>`).join('');
  $('#app').innerHTML = `<section class="hero"><div class="hero-copy">
<span class="hero-eyebrow">YOUR JOURNEY STARTS HERE</span><h1>Discover Bangladesh</h1>
<p>From the mangrove forests of the Sundarbans to the floating markets of Barishal, find your next unforgettable adventure.</p>
<div class="hero-actions"><a class="hero-button hero-button-light" href="#/tours">Browse tours <span aria-hidden="true">↘</span></a><a class="hero-button hero-button-outline" href="#customize-meals"><span aria-hidden="true">✳</span> Customize meals</a></div>
</div><div class="hero-stats"><span><strong>${cat.divisions.length}</strong> divisions</span><i></i><span><strong>${cat.packages.length}</strong> curated tours</span><i></i><span><strong>30%</strong> savings available</span></div></section>
<div class="wrap home-content"><section id="featured-tours" class="home-section"><div class="section-heading"><div><span class="section-kicker">FIND YOUR NEXT ESCAPE</span><h2>Featured tour packages</h2><p>Explore curated trips across Bangladesh's beautiful regions.</p></div><a href="#/tours" class="section-link">View all tours <span aria-hidden="true">→</span></a></div><div class="tour-grid">${featured}</div></section>
<section id="destinations" class="home-section"><div class="section-heading"><div><span class="section-kicker">A COUNTRY FULL OF STORIES</span><h2>Explore by destination</h2><p>Choose a region and start planning your journey.</p></div></div><div class="tiles">${tiles}</div></section>
<section id="customize-meals" class="home-section"><div class="section-heading"><div><span class="section-kicker">A TASTE OF BANGLADESH</span><h2>Customize every meal</h2><p>Choose breakfast, lunch, dinner and snacks separately for each day of your trip.</p></div><a href="#/plan" class="section-link">Customize meals <span aria-hidden="true">→</span></a></div><div class="meal-grid">${mealCards}</div></section>
${reviews}<section class="home-section"><div class="section-heading"><div><span class="section-kicker">SIMPLE FROM START TO FINISH</span><h2>How it works</h2></div></div><div class="how">
<div><b>1</b><h3>Plan your trip</h3><p>Choose where you start, where you go, how you travel, where you stay and what you eat.</p></div>
<div><b>2</b><h3>Watch the price</h3><p>A live ticket adds everything up for you and applies the discount.</p></div>
<div><b>3</b><h3>Confirm with a code</h3><p>Pay a 50% advance using a code we email you. Plans changed? Cancel from My bookings.</p></div></div></section></div>`;
}

async function route() {
  const anchor = location.hash && !location.hash.startsWith('#/') ? decodeURIComponent(location.hash.slice(1)) : '';
  nav();
  const routeParts = location.hash.slice(2).split('/');
  const p = anchor ? '' : routeParts[0];
  $('#app').classList.toggle('wide', p === '');
  document.querySelectorAll('#nav a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === location.hash));
  if (!me && ['plan', 'bookings', 'booking-success', 'payment', 'admin', 'catalog', 'feedback'].includes(p)) { location.hash = '#/'; return; }
  if ((p === 'admin' && me.role === 'customer') || (p === 'catalog' && me.role !== 'admin')) { location.hash = '#/'; return; }
  const t0 = Date.now(); showLoader();
  try {
    if (p === 'booking-success') await bookingSuccess(routeParts[1]);
    else if (p === 'payment') await paymentPage(routeParts[1]);
    else await ({ plan, tours, bookings, admin, catalog, forgot, profile, feedback }[p] || home)();
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
  } catch (e) { toast(e.message, 1); }
  setTimeout(hideLoader, Math.max(0, 650 - (Date.now() - t0)));
}

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, a = f.dataset.act, d = Object.fromEntries(new FormData(f));
  try {
    if (a === 'login' || a === 'register') {
      me = await api('/auth/' + a, 'POST', d); toast('Welcome, ' + me.username);
      if (location.hash === '#/profile') route();
      else location.hash = '#/profile';
    } else if (a === 'book') {
      const b = await api('/bookings', 'POST', payload(f));
      if (f.id === 'trip') {
        location.hash = '#/payment/' + encodeURIComponent(b.id);
      } else {
        location.hash = '#/booking-success/' + encodeURIComponent(b.id);
      }
    } else if (a === 'pay') {
      const payment = await api('/payments/' + f.dataset.id, 'POST', d);
      if (payment.email_sent) toast(`Booking confirmed. Confirmation email sent to ${payment.sent_to}.`);
      else toast('Booking confirmed, but the email could not be sent. Check the server logs.', 1);
      location.hash = '#/booking-success/' + encodeURIComponent(f.dataset.id);
    }
  } catch (err) { toast(err.message, 1); }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'FORM') return;
  try {
    if (b.dataset.act === 'logout') { await api('/auth/logout', 'POST'); me = null; location.hash = '#/'; route(); }
    if (b.dataset.act === 'cancel') {
      const paid = +b.dataset.paid;
      const msg = paid ? `Cancel this confirmed booking? You paid ${tk(paid)} and will get ${tk(b.dataset.refund)} back.` : 'Cancel this booking?';
      if (confirm(msg)) {
        const r = await api('/bookings/' + b.dataset.id, 'DELETE');
        toast(r.refund ? `Cancelled. A refund of ${tk(r.refund)} will be returned to you.` : 'Booking cancelled'); bookings();
      }
    }
  } catch (err) { toast(err.message, 1); }
});

document.addEventListener('change', async e => {
  const id = e.target.dataset.role; if (!id) return;
  try { await api(`/admin/users/${id}/role`, 'PATCH', { role: e.target.value }); toast('Role updated'); }
  catch (err) { toast(err.message, 1); admin(); }
});

addEventListener('hashchange', route);
(async () => { try { me = await api('/auth/me'); } catch {} route(); })();
