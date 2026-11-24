# Travel Bangladesh

A full-stack travel planning and booking application for exploring tour packages across Bangladesh. Users can plan a trip, choose transport and accommodation, customize meals, review a price breakdown, and manage bookings.

> **Payment notice:** Payments are currently in demo mode. The app emails a verification code after you enter a wallet or bank account number and records a test transaction; it does not charge real money or connect to a payment gateway. Account numbers are not stored.

## Features

- Browse destinations and tour packages
- Browse transport options and start a trip with a selected vehicle
- Plan trips with morning, noon, evening, or night departures; choose individual seats and see booked seats marked unavailable
- Compare transport fares, with higher AC and flight fares
- Browse restaurants and menus at tour spots, select different meals for each traveller, and edit booked food orders and default preferences from Profile
- Create an account, log in with username/email/mobile, reset passwords by registered email, and manage a profile
- Save bookings, confirm them using an email OTP, edit upcoming pending or confirmed trips from Profile, and cancel bookings
- Recalculate prices after trip edits; show any overpayment as a manual refund due
- Submit feedback
- Admin tools for bookings, users, and catalog data

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript, Bootstrap 5
- **Backend:** Node.js and Express 5 REST API
- **Database:** PostgreSQL (for example, Supabase), accessed with `pg`
- **Authentication:** JWT in cookies; passwords hashed with bcryptjs
- **Email:** Nodemailer with SMTP or the Brevo API. `MAIL_FROM` must be a verified sender; Brevo accepts either `sender@example.com` or `Travel Bangladesh <sender@example.com>`.

For password-reset and payment codes on Render, configure `BREVO_API_KEY` and `MAIL_FROM` in the service's Environment settings. Do not share the API key.



## Run locally

### Requirements

- Node.js 22 or newer
- npm
- A PostgreSQL database, such as a Supabase project

### Configure the database

1. Create a Supabase project and copy its PostgreSQL connection string from **Project Settings → Database → Connection string**. Use the session-pooler connection string if the direct connection is unavailable from Render.
2. Set `DATABASE_URL` in your local `.env` file and in Render's environment variables. Keep the connection string private.
3. Start the server with `npm start`. On first startup, the app creates the schema and loads the catalog seed data. User accounts and bookings are stored in PostgreSQL and survive Render restarts and redeploys.

The database must be reachable over SSL. Supabase Free has usage and inactivity limits that can change; check its current plan details. Existing data in a local `travel.db` file is not automatically copied; export/import it separately if you need to preserve local accounts or bookings.

The PostgreSQL schema enables Row Level Security on application tables without public policies. The app accesses data through its private server-side `DATABASE_URL`; never expose that URL in frontend code.

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
