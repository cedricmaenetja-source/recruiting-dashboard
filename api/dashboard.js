const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  const orgId = req.query.org;
  if (!orgId) {
    return res.status(400).json({ error: 'Missing ?org= query parameter.' });
  }

  const { data: org, error: orgErr } = await supabase
    .from('tbldashboardorganisations')
    .select('dashboard_path, dashboard_url')
    .eq('id', orgId)
    .single();

  if (orgErr || !org || !org.dashboard_path || !org.dashboard_url) {
    return res.status(404).json({ error: 'No dashboard found for this organisation.' });
  }

  const safePath = path.normalize(org.dashboard_path).replace(/^(\.\.[/\\])+/, '');
  const blobKey = `${safePath.replace(/\\/g, '/')}/dashboard.html`;
  const blobUrl = org.dashboard_url;

  try {
    const blobRes = await fetch(blobUrl);
    if (!blobRes.ok) {
      return res.status(502).json({ error: `Could not fetch blob (${blobRes.status}).` });
    }

    const html = await blobRes.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline');
    return res.status(200).send(html);
  } catch (ex) {
    console.error('[dashboard] blob fetch failed:', ex);
    return res.status(502).json({ error: 'Could not reach Blob storage.' });
  }
};