# Travel Bangladesh

A full-stack travel planning and booking application for exploring tour packages across Bangladesh. Users can plan a trip, choose transport and accommodation, customize meals, review a price breakdown, and manage bookings.

> **Payment notice:** Payments are currently in demo mode. The app emails a verification code after you enter a wallet or bank account number and records a test transaction; it does not charge real money or connect to a payment gateway. Account numbers are not stored.

## Features

- Browse destinations and tour packages
- Browse transport options and start a trip with a selected vehicle
- Plan trips with morning, noon, evening, or night departures; choose individual seats and see booked seats marked unavailable
- Compare transport fares, with higher AC and flight fares
- Browse restaurants and menus at tour spots, select different meals for each traveller, and edit booked food orders and default preferences from Profile
- Create an account, sign in, and manage a profile
- Save bookings, confirm them using an email OTP, and cancel bookings
- Submit feedback
- Admin tools for bookings, users, and catalog data

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript, Bootstrap 5
- **Backend:** Node.js and Express 5 REST API
- **Database:** SQLite using Node.js's built-in `node:sqlite`
- **Authentication:** JWT in cookies; passwords hashed with bcryptjs
- **Email:** Nodemailer with SMTP or the Brevo API. `MAIL_FROM` must be a verified sender; Brevo accepts either `sender@example.com` or `Travel Bangladesh <sender@example.com>`.

Food photos for the new menu items are downloaded from Pexels and served locally under the [Pexels license](https://www.pexels.com/license/). Photo IDs: [Halwa Puri, 36388454](https://images.pexels.com/photos/36388454/pexels-photo-36388454.jpeg), [Egg Sandwich, 31150225](https://images.pexels.com/photos/31150225/pexels-photo-31150225.jpeg), [Chicken Pulao, 4224304](https://images.pexels.com/photos/4224304/pexels-photo-4224304.jpeg), [Beef Curry with Rice, 9392998](https://images.pexels.com/photos/9392998/pexels-photo-9392998.jpeg), [Chicken Roast Polao, 9738983](https://images.pexels.com/photos/9738983/pexels-photo-9738983.jpeg), [Prawn Curry, 14537692](https://images.pexels.com/photos/14537692/pexels-photo-14537692.jpeg), [Jilapi, 39852669](https://images.pexels.com/photos/39852669/pexels-photo-39852669.jpeg), [Vegetable Pakora, 40987137](https://images.pexels.com/photos/40987137/pexels-photo-40987137.jpeg), [Chicken Sandwich, 9207184](https://images.pexels.com/photos/9207184/pexels-photo-9207184.jpeg), and [Lemon Tea, 8329871](https://images.pexels.com/photos/8329871/pexels-photo-8329871.jpeg).

The original menu photos have also been replaced with locally served Pexels photos. Their photo IDs are [Paratha, 38834853](https://images.pexels.com/photos/38834853/pexels-photo-38834853.jpeg), [Khichuri, 6363501](https://images.pexels.com/photos/6363501/pexels-photo-6363501.jpeg), [Beef with Rice, 9392998](https://images.pexels.com/photos/9392998/pexels-photo-9392998.jpeg), [Chicken Curry, 29684985](https://images.pexels.com/photos/29684985/pexels-photo-29684985.jpeg), [Omelette, 25402351](https://images.pexels.com/photos/25402351/pexels-photo-25402351.jpeg), [Beef Bhuna, 15131224](https://images.pexels.com/photos/15131224/pexels-photo-15131224.jpeg), [Hilsa with Rice, 10294656](https://images.pexels.com/photos/10294656/pexels-photo-10294656.jpeg), [Biryani, 40262796](https://images.pexels.com/photos/40262796/pexels-photo-40262796.jpeg), [Chicken Polao, 4224304](https://images.pexels.com/photos/4224304/pexels-photo-4224304.jpeg), [Dal, 38108860](https://images.pexels.com/photos/38108860/pexels-photo-38108860.jpeg), [Mutton Curry, 34616638](https://images.pexels.com/photos/34616638/pexels-photo-34616638.jpeg), [Grilled Fish, 8352777](https://images.pexels.com/photos/8352777/pexels-photo-8352777.jpeg), [Fried Rice, 34683315](https://images.pexels.com/photos/34683315/pexels-photo-34683315.jpeg), [Pizza, 6068717](https://images.pexels.com/photos/6068717/pexels-photo-6068717.jpeg), [Singara, 8970595](https://images.pexels.com/photos/8970595/pexels-photo-8970595.jpeg), [Chicken Roll, 33430554](https://images.pexels.com/photos/33430554/pexels-photo-33430554.jpeg), [Fuchka, 34356404](https://images.pexels.com/photos/34356404/pexels-photo-34356404.jpeg), and [Chotpoti, 10898272](https://images.pexels.com/photos/10898272/pexels-photo-10898272.jpeg).

## Run locally

### Requirements

- Node.js 22 or newer
- npm


## Main API routes

All API routes are prefixed with `/api`:

| Route | Purpose |
|---|---|
| `/auth` | Registration, login, profile, and password flows |
| `/catalog` | Destinations, packages, transport, rooms, and meals |
| `/bookings` | Quotes, seat availability, booking management |
| `/payments` | Email OTP and demo payment confirmation |
| `/feedback` | Submit and view feedback |
| `/admin` | Admin booking, user, and catalog tools |
