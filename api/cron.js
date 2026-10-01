const { createClient } = require('@supabase/supabase-js');
const Papa = require('papaparse');
const { put } = require('@vercel/blob');
const fs = require('fs/promises');
const path = require('path');

const DATA_BUCKET = 'recruitment-dashboard'; // private Supabase Storage bucket
const zlib = require('zlib');

// Was `export const` — mixing ES exports with require/module.exports breaks in CommonJS
const ERROR_NOTIFICATION = `
    <p>Error:<br/><br/>
    {{ERROR}}<br/><br/>
    Thanks,<br/>
    Udder</p>`;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role bypasses RLS, so it can write to the private bucket
);

function parseReportBody(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const result = Papa.parse(trimmed, { header: true, skipEmptyLines: true });
    return result.data;
  }
}

async function fetchSmartRecruitersReport(kind, token, reportId) {
  const url = `${process.env.SMARTRECRUITERS_REPORTS}/${reportId}/files/recent/data`;
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'x-smarttoken': token },
  });
  const text = await res.text();
  if (!res.ok) {
    await sendErrorNotitification(`SmartRecruiters error (${kind} ${res.status}): ${text.slice(0, 300)}`);
    throw new Error(`SmartRecruiters error (${kind} ${res.status}): ${text.slice(0, 300)}`);
  }
  return parseReportBody(text);
}

async function sendErrorNotitification(error) {
  const payload = {
    to: process.env.UDDER_SUPPORT_TEAM,
    subject: 'Recruiting Dashboard Cron - Error Notification',
    body: ERROR_NOTIFICATION.replace('{{ERROR}}', String(error)),
  };
  try {
    await fetch(process.env.ZAPIER_SEND_EMAIL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[notify] fetch threw:', err);
  }
}

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const orgId = req.query.org;
  if (!orgId) {
    return res.status(400).json({ error: 'Missing ?org= query parameter.' });
  }

  const { data: org, error: orgErr } = await supabase
    .from('tbldashboardorganisations')
    .select('id, oauth_key, jobs_bi, positions_bi, applications_bi, dashboard_path')
    .eq('id', orgId)
    .single();

  if (orgErr || !org) {
    await sendErrorNotitification('Organisation not found - ' + orgId);
    return res.status(404).json({ error: 'Organisation not found.' });
  }

  const { oauth_key: token, jobs_bi, positions_bi, applications_bi, dashboard_path } = org;

  if (!token || !jobs_bi || !positions_bi || !applications_bi || !dashboard_path) {
    await sendErrorNotitification('Organisation is missing required fields (integration fields / dashboard_path).');
    return res.status(422).json({ error: 'Organisation is missing required fields (integration fields / dashboard_path).' });
  }

  const safePath = path.normalize(dashboard_path).replace(/^(\.\.[/\\])+/, '');
  const templatePath = path.join(process.cwd(), 'templates', safePath, 'dashboard.html');
  const blobKey = `${safePath.replace(/\\/g, '/')}/dashboard.html`;

  let template;
  try {
    template = await fs.readFile(templatePath, 'utf-8');
  } catch (err) {
    await sendErrorNotitification(err.message);
    console.error('[cron] template read failed:', templatePath, err.message);
    return res.status(404).json({ error: `No template found at templates/${blobKey}.` });
  }

  try {
    const [appRows, posRows, jobRows] = await Promise.all([
      fetchSmartRecruitersReport('applications', token, applications_bi),
      fetchSmartRecruitersReport('positions', token, positions_bi),
      fetchSmartRecruitersReport('jobs', token, jobs_bi),
    ]);

    if (!appRows.length) {
      await sendErrorNotitification('No application records returned.');
      throw new Error('No application records returned.');
    }

    const payload = {
      appRows,
      posRows,
      jobRows,
      generatedAt: new Date().toISOString(),
    };

    // 1) Data goes to the PRIVATE bucket, one folder per org: <orgId>/data.json
    //    Readable only by signed-in users of that org who have passed MFA (see storage policy).
    const json = JSON.stringify(payload);
    const gz = zlib.gzipSync(json);
    console.log(`[cron] org ${org.id}: ${(json.length / 1e6).toFixed(1)} MB raw, ${(gz.length / 1e6).toFixed(1)} MB compressed`);

    const dataKey = `${org.id}/data.json.gz`;
    const { error: upErr } = await supabase.storage
      .from(DATA_BUCKET)
      .upload(dataKey, gz, {
        contentType: 'application/gzip',
        upsert: true,
        cacheControl: '0',
      });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    // 2) The HTML page is published WITHOUT data, so the public blob holds nothing sensitive.
    //    (The template no longer contains the __EMBEDDED_DATA__ script tag.)
    const blob = await put(blobKey, template, {
      access: 'public',
      contentType: 'text/html',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    await supabase
      .from('tbldashboardorganisations')
      .update({ dashboard_url: blob.url })
      .eq('id', orgId);

    return res.status(200).json({
      ok: true, orgId, template: safePath, url: blob.url, dataKey, generatedAt: payload.generatedAt,
    });
  } catch (ex) {
    await sendErrorNotitification(`[cron] bake failed for org ${orgId}: ${ex}`);
    console.error(`[cron] bake failed for org ${orgId}:`, ex);
    return res.status(502).json({ error: ex.message || 'Could not bake dashboard.' });
  }
};