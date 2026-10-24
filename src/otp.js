const crypto = require('crypto'), db = require('./db'), { send } = require('./mailer');
const bad = m => Object.assign(new Error(m), { status: 400 });
const hash = (k, c) => crypto.createHash('sha256').update(`${k}:${c}:${process.env.JWT_SECRET || 'dev'}`).digest('hex');
const mailFailure = e => {
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
  const old = db.prepare('select created_at from otps where key = ?').get(key);
  if (old && Date.now() - old.created_at < 60000) throw bad('Wait a minute before asking for a new code');
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare('insert or replace into otps values (?,?,?,0,?)').run(key, hash(key, code), Date.now() + 5 * 60000, Date.now());
  try { await send(email, subject, `Your code is ${code}. It works for 5 minutes. If you did not ask for it, ignore this email.`); }
  catch (e) { console.error('Mail error:', e.message); db.prepare('delete from otps where key = ?').run(key); throw bad(mailFailure(e)); }
};

exports.check = (key, code) => {
  const o = db.prepare('select * from otps where key = ?').get(key);
  if (!o || o.expires_at < Date.now()) throw bad('The code has expired. Ask for a new one');
  if (o.attempts >= 5) { db.prepare('delete from otps where key = ?').run(key); throw bad('Too many wrong tries. Ask for a new code'); }
  if (hash(key, String(code || '')) !== o.code_hash) {
    db.prepare('update otps set attempts = attempts + 1 where key = ?').run(key); throw bad('Wrong code');
  }
  db.prepare('delete from otps where key = ?').run(key);
};
