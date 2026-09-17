import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import Papa from 'papaparse';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REPORT_ID_COLUMN = {
  applications: 'applications_bi',
  positions:    'positions_bi',
  jobs:         'jobs_bi'
};

function parseReportBody(text){
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const result = Papa.parse(trimmed, { header: true, skipEmptyLines: true });
    if (result.errors?.length) {
      console.warn('[reports] CSV parse warnings:', result.errors.slice(0, 3));
    }
    return result.data;
  }
}

export default async function handler(req, res) {
  const kind = req.query.kind;
  
  const column = REPORT_ID_COLUMN[kind];
  if (!column) return res.status(400).json({ error: 'Unknown report kind.' });

  const authHeader = req.headers.authorization || '';
  const jwtToken = authHeader.replace('Bearer ', '');
  let decoded = null;
   try {
        decoded = jwt.verify(jwtToken, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
        return res.status(401).json({
            error: 'Invalid or expired token'
        });
    }
    
    const { data: profile, error: profileErr } = await supabase
    .from('tbldashboardorganisationusers')
    .select('organisation_id')
    .eq('id', decoded.userId)
    .single();
  if (profileErr || !profile) return res.status(403).json({ error: 'No organisation linked to this user.' });

  const { data: org, error: orgErr } = await supabase
    .from('tbldashboardorganisations')
    .select('oauth_key, jobs_bi, positions_bi, applications_bi')
    .eq('id', profile.organisation_id)
    .single();
  if (orgErr || !org) return res.status(404).json({ error: 'Organisation not found.' });

  const token = org.oauth_key;
  const reportId = org[column];
  if (!token || !reportId) {
    return res.status(422).json({ error: `This organisation has no ${kind} integration configured.` });
  }
  
  try {
    const url = `${process.env.SMARTRECRUITERS_REPORTS}/${reportId}/files/recent/data`;
    const srRes = await fetch(url, {
      headers: { 'accept': 'application/json', 'x-smarttoken': token }
    });

    const text = await srRes.text();
    if (!srRes.ok) {
      return res.status(srRes.status).json({ error: `SmartRecruiters error (${srRes.status}): ${text.slice(0,300)}` });
    }

    const data = parseReportBody(text);
    res.status(200).json(data);
  } catch (err) {
    console.error('[reports proxy]', err);
    res.status(502).json({ error: 'Could not reach SmartRecruiters.' });
  }
}