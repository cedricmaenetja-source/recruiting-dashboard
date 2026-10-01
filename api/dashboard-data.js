const { requireMfa, supabase } = require('./_lib/mfa');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await requireMfa(req, res);
    if (!user) return; // 401 already sent with { status }

    if (!user.organisationId) {
      return res.status(403).json({ error: "Your account isn't linked to an organisation." });
    }

    const { data, error } = await supabase.storage
      .from('recruitment-dashboard')
      .createSignedUrl(`${user.organisationId}/data.json.gz`, 60);
    if (error) {
      return res.status(404).json({ error: 'No dashboard data for your organisation yet.' });
    }

    res.status(200).json({ url: data.signedUrl });
  } catch (e) {
    console.error('[dashboard-data]', e);
    res.status(500).json({ error: 'Could not load dashboard data.' });
  }
};