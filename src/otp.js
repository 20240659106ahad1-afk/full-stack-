const crypto = require('crypto'), db = require('./db'), { send } = require('./mailer');
const bad = m => Object.assign(new Error(m), { status: 400 });
const hash = (k, c) => crypto.createHash('sha256').update(`${k}:${c}:${process.env.JWT_SECRET || 'dev'}`).digest('hex');
const mailFailure = e => {
  if (/Email is not configured/.test(e.message || ''))
    return 'Password reset email is not configured. Ask the administrator to set BREVO_API_KEY and MAIL_FROM in Render.';
  if (/MAIL_FROM must be a verified email address/.test(e.message || ''))
    return 'The email sender is missing or unverified. Ask the administrator to check MAIL_FROM in Render.';
  if (process.env.NODE_ENV === 'production') return 'Could not send the email. Please try again later';
  if (e.code === 'EAUTH' || e.responseCode === 535)
    return 'Email login was rejected. Check SMTP_USER and make sure SMTP_PASS is your Brevo SMTP key, not an API key.';
  if (e.responseCode >= 400)
    return `Brevo rejected the email (SMTP ${e.responseCode}). Check that MAIL_FROM is a verified sender and review Brevo transactional logs.`;
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(e.code))
    return 'Could not connect to the email server. Check your SMTP settings and internet connection.';
  return 'Email delivery failed. Check the server terminal and Brevo transactional logs for details.';
};

exports.issue = async (key, email, subject) => {
  const old = await db.prepare('select created_at from otps where key = ?').get(key);
  if (old && Date.now() - old.created_at < 60000) throw bad('Wait a minute before asking for a new code');
  const code = String(crypto.randomInt(100000, 1000000));
  await db.prepare(`insert into otps(key,code_hash,expires_at,attempts,created_at) values(?,?,?,0,?)
    on conflict(key) do update set code_hash=excluded.code_hash, expires_at=excluded.expires_at,
      attempts=0, created_at=excluded.created_at`).run(key, hash(key, code), Date.now() + 5 * 60000, Date.now());
  try { await send(email, subject, `Your code is ${code}. It works for 5 minutes. If you did not ask for it, ignore this email.`); }
  catch (e) { console.error('Mail error:', e.message); await db.prepare('delete from otps where key = ?').run(key); throw bad(mailFailure(e)); }
};

exports.verify = async (key, code) => {
  const o = await db.prepare('select * from otps where key = ?').get(key);
  if (!o || o.expires_at < Date.now()) throw bad('The code has expired. Ask for a new one');
  if (o.attempts >= 5) { await db.prepare('delete from otps where key = ?').run(key); throw bad('Too many wrong tries. Ask for a new code'); }
  if (hash(key, String(code || '')) !== o.code_hash) {
    await db.prepare('update otps set attempts = attempts + 1 where key = ?').run(key); throw bad('Wrong code');
  }
};

exports.check = async (key, code) => {
  await exports.verify(key, code);
  await db.prepare('delete from otps where key = ?').run(key);
};
