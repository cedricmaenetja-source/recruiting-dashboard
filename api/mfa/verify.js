const { getStatus, checkCode, setMfaCookie } = require('../_lib/mfa');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { status, user, row } = await getStatus(req);
    if (status === 'ok') return res.status(200).json({ ok: true });
    if (status !== 'challenge') return res.status(409).json({ status });

    const result = await checkCode(row, row.secret_enc, (req.body || {}).code);
    if (!result.ok) return res.status(result.reason === 'locked' ? 429 : 400).json({ reason: result.reason });

    setMfaCookie(res, user);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[mfa/verify]', e);
    res.status(500).json({ error: 'Could not verify the code.' });
  }
};