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
- **Email:** Nodemailer with SMTP or the Brevo API

## Run locally

### Requirements

- Node.js 22 or newer
- npm

### Setup

In PowerShell, from the project directory:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set a strong, private `JWT_SECRET` and `ADMIN_PASSWORD`. Never commit `.env` or publish its secret values.

Start the app:

```powershell
npm start
```

Open [http://localhost:3000](http://localhost:3000). For development with automatic server restarts:

```powershell
npm run dev
```

The SQLite database is created as `travel.db` in the project directory by default. Set `DB_PATH` to use a different location.

### Email and OTP

For local development, clear `SMTP_HOST` and leave the email credentials unset; verification emails are then printed in the server terminal. To send real email, configure either:

- **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`
- **Brevo API:** `BREVO_API_KEY` and a verified sender in `MAIL_FROM`

Keep all credentials private. Do not use a regular Gmail password; use an app password if configuring Gmail SMTP.

### Initial admin account

On a fresh database, the app creates an `admin` account. Set `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) **before the first startup**. If no password is configured, the application currently falls back to `admin123`; change it before using the account and never rely on that default in a deployed environment. Existing databases are not automatically given a new admin password when the environment variable changes.

## Deploying to Render

The repository includes a `render.yaml` blueprint. Create a Render Blueprint from the repository and provide the requested environment variables in Render's dashboard:

- Set a strong `ADMIN_PASSWORD`.
- Set `ADMIN_EMAIL` if desired.
- Configure `BREVO_API_KEY` and verified `MAIL_FROM` to deliver OTP emails. SMTP variables are also supported where the host allows SMTP.
- `JWT_SECRET` is configured for automatic generation by the blueprint.

The app uses SQLite by default. **SQLite data is not durable on an ephemeral hosting filesystem.** Before using the deployment for persistent bookings, configure a persistent disk and point `DB_PATH` to a location on that disk, or migrate to a managed database. Do not assume data on a free ephemeral instance survives a restart or redeploy.

## Project layout

```text
public/                 Frontend pages, styles, scripts, and images
src/
  middleware/           Authentication middleware
  modules/              Auth, booking, payment, catalog, feedback, and admin routes
  db.js                 SQLite connection, schema setup, and migrations
  mailer.js             Email delivery
  otp.js                Email verification code handling
server.js               Express app and API route registration
schema.sql              Database schema
seed.sql                Initial catalog data
render.yaml             Render deployment blueprint
```

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

## Security and data

- `.env`, SQLite database files, and `node_modules` are excluded from Git by `.gitignore`.
- Use `.env.example` only as a configuration template; put real credentials in your local `.env` or your hosting provider's environment settings.
- The seeded catalog data is stored in `seed.sql`; application data is stored in SQLite.
