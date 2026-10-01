const QRCode = require('qrcode');
const { getStatus, authenticator, ISSUER, encrypt, supabase } = require('../_lib/mfa');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { status, user, row } = await getStatus(req);
    if (status !== 'enroll') return res.status(409).json({ status });

    const secret = authenticator.generateSecret();
    const { error } = await supabase.from('tbldashboardmfa').upsert({
      user_id: String(user.id),
      pending_secret_enc: encrypt(secret),
      failed_attempts: row ? row.failed_attempts : 0, // don't let a restart reset the lockout
    });
    if (error) throw error;

    const otpauth = authenticator.keyuri(user.email || String(user.id), ISSUER, secret);
    const qr = await QRCode.toDataURL(otpauth);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ qr, secret });
  } catch (e) {
    console.error('[mfa/enroll-start]', e);
    res.status(500).json({ error: 'Could not start setup.' });
  }
};