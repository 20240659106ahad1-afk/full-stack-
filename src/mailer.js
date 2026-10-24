const nodemailer = require('nodemailer');

// 1) BREVO_API_KEY set -> send over HTTPS (works on Render's free plan, which blocks SMTP ports)
// 2) SMTP_HOST set     -> send through SMTP, e.g. Gmail (works on your own computer)
// 3) neither           -> print the email in the terminal (handy while developing)
const smtp = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;

exports.send = async (to, subject, text) => {
  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'Travel Bangladesh', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, textContent: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (smtp) return void await smtp.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
  console.log(`\n[DEV EMAIL] To: ${to}\nSubject: ${subject}\n${text}\n`);
};
