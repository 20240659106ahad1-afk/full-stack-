# Travel Bangladesh

A full-stack travel planning and booking application for exploring tour packages across Bangladesh. Users can plan a trip, choose transport and accommodation, customize meals, review a price breakdown, and manage bookings.

> **Payment notice:** Payments are currently in demo mode. The app emails a verification code and records a test transaction; it does not charge real money or connect to a payment gateway.

## Features

- Browse destinations and tour packages
- Plan trips with transport, hotel, travel dates, and seat availability
- Select meals for each day and view server-calculated pricing
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
