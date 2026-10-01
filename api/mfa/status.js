const { getStatus } = require('../_lib/mfa');

module.exports = async (req, res) => {
  try {
    const { status } = await getStatus(req);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status });
  } catch (e) {
    console.error('[mfa/status]', e);
    res.status(500).json({ error: 'Could not check sign-in status.' });
  }
};