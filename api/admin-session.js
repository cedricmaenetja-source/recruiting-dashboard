import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const token = req.cookies.refreshToken;

    const { data: tokenRow, error } = await supabase
        .from('tbldashboardsessions')
        .select('id, user_id, expires_at')
        .eq('token', token)
        .single();

    if (error || !tokenRow) {
        return res.status(401).json({ error: 'Refresh token has been revoked.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, REFRESH_SECRET);
        const { data, error } = await supabase
            .from('tbldashboardusers')
            .select('id, first_name, last_name, email, role')
            .eq('id', decoded.userId)
            .eq('active', true)
            .single();

        if (error) return res.status(500).json({ data: null, error: error.message });
        return res.status(200).json({ data });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
}