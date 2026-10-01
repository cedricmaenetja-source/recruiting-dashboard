const { getStatus, getMfaRow, checkCode, updateMfaRow, setMfaCookie } = require('../_lib/mfa');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { status, user } = await getStatus(req);
    if (status !== 'enroll') return res.status(409).json({ status });

    const row = await getMfaRow(user.id);
    if (!row || !row.pending_secret_enc) return res.status(400).json({ error: 'Start setup first.' });

    const result = await checkCode(row, row.pending_secret_enc, (req.body || {}).code);
    if (!result.ok) return res.status(result.reason === 'locked' ? 429 : 400).json({ reason: result.reason });

    await updateMfaRow(user.id, {
      secret_enc: row.pending_secret_enc,
      pending_secret_enc: null,
      enabled_at: new Date().toISOString(),
    });
    setMfaCookie(res, user); // setup counts as passing MFA for this session
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[mfa/enroll-verify]', e);
    res.status(500).json({ error: 'Could not finish setup.' });
  }
};