const COMMON = ['password', 'password1', '12345678', '123456789', 'qwerty123', 'iloveyou', 'admin123', '11111111', 'abcd1234'];
// Returns a message when the password is weak, or null when it is fine.
exports.problem = (pw, username = '') => {
  pw = String(pw || '');
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  const hasName = String(username).length >= 3 && pw.toLowerCase().includes(String(username).toLowerCase());
  return pw.length < 8 || classes < 3 || COMMON.includes(pw.toLowerCase()) || hasName
    ? 'Password is too weak. Use 8+ characters with at least 3 of: small letter, capital letter, number, symbol. Do not use your username.' : null;
};
