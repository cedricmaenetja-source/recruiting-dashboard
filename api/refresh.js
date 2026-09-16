import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

function parseCookies(req) {
    const header = req.headers.cookie || '';
    return Object.fromEntries(
        header.split(';').filter(Boolean).map(c => {
            const [key, ...v] = c.trim().split('=');
            return [key, decodeURIComponent(v.join('='))];
        })
    );
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
        return res.status(401).json({ error: 'No refresh token provided.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const { data: tokenRow, error } = await supabase
        .from('tbldashboardsessions')
        .select('id, user_id, expires_at')
        .eq('token', refreshToken)
        .single();

    if (error || !tokenRow) {
        return res.status(401).json({ error: 'Refresh token has been revoked.' });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
        await supabase.from('tbldashboardsessions').delete().eq('id', tokenRow.id);
        return res.status(401).json({ error: 'Refresh token expired.' });
    }

    const accessToken = jwt.sign(
        { userId: decoded.userId, role: decoded.role },
        ACCESS_SECRET,
        { expiresIn: '15m' }
    );

    return res.status(200).json({ accessToken });
}