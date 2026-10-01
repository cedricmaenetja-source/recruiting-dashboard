import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import Papa from 'papaparse';
import { Redis } from '@upstash/redis';
import { gzipSync, gunzipSync } from 'zlib';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REPORT_ID_COLUMN = {
  applications: 'applications_bi',
  positions:    'positions_bi',
  jobs:         'jobs_bi'
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

const CACHE_TTL_SECONDS = 20 * 60 * 60; // 20 hours
const BUCKET = 'report-cache';

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

// ⬇ store the (large) payload as a gzip file in Supabase Storage; Redis only ever holds a pointer
async function writeCacheFile(storagePath, data){
  const compressed = gzipSync(JSON.stringify(data));
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, compressed, { contentType: 'application/gzip', upsert: true });
  if (error) throw error;
}

async function readCacheFile(storagePath){
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  const buf = Buffer.from(await data.arrayBuffer());
  return JSON.parse(gunzipSync(buf).toString('utf8'));
}

export default async function handler(req, res) {
  const kind = req.query.kind;
  const forceRefresh = req.query.refresh === 'true';

  const column = REPORT_ID_COLUMN[kind];
  if (!column) return res.status(400).json({ error: 'Unknown report kind.' });

  const authHeader = req.headers.authorization || '';
  const jwtToken = authHeader.replace('Bearer ', '');
  let decoded = null;
  try {
    decoded = jwt.verify(jwtToken, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
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

  const cacheKey = `reports:${profile.organisation_id}:${kind}:${reportId}`;
  const storagePath = `${profile.organisation_id}/${kind}/${reportId}.json.gz`;

  res.setHeader('Cache-Control', `private, max-age=${CACHE_TTL_SECONDS}, must-revalidate`);

  if (!forceRefresh) {
    try {
      const pointer = await redis.get(cacheKey);   // small: {path, fetchedAt}
      if (pointer) {
        const data = await readCacheFile(pointer.path);
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(data);
      }
    } catch (err) {
      console.error('[reports proxy] cache read failed:', err);
      // fall through — treat as a miss
    }
  }
  res.setHeader('X-Cache', forceRefresh ? 'BYPASS' : 'MISS');

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

    try {
      await writeCacheFile(storagePath, data);
      await redis.set(cacheKey, { path: storagePath, fetchedAt: Date.now() }, { ex: CACHE_TTL_SECONDS });
      console.log('[reports proxy] cached', cacheKey, '->', storagePath);
    } catch (err) {
      console.error('[reports proxy] cache write failed:', err);
      // don't fail the request just because caching failed
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('[reports proxy]', err);
    res.status(502).json({ error: 'Could not reach SmartRecruiters.' });
  }
}