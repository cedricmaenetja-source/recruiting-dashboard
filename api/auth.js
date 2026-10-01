import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import dashboard from './dashboard';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export default async function handler(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    
    const { data: user, error } = await supabase
        .from('tbldashboardorganisationusers')
        .select('id, first_name, organisation_id, last_name, email, role, password')
        .eq('email', email)
        .eq('active', true)
        .single();
    
    if (error || !user) {
        return res.status(401).json({ error: 'Invalid logins.' });
    }
    
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
        return res.status(401).json({ error: 'Invalid logins.' });
    }
    
    const { data: org, error: orgError } = await supabase
        .from('tbldashboardorganisations')
        .select('*')
        .eq('id', user.organisation_id)
        .eq('active', true)
        .single();
    
    if (orgError || !org) {
        return res.status(401).json({ error: 'Invalid logins.' });
    }

    if (!user.organisation_id){
        return res.status(401).json({ error: 'Invalid logins.' });
    }
    
    const payload = { userId: user.id, role: user.role, dashboard_path: org.dashboard_path, organisation_id: org.id};
    
    const accessToken = jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

    const {data: refresh, error: refreshError } = await supabase
        .from('tbldashboardsessions')
        .insert({ user_id: user.id, token: refreshToken, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

    if (refreshError) {
        return res.status(401).json({ error: 'Failed to fetch token.' });
    }
    // Refresh token goes in an HttpOnly cookie
    res.setHeader('Set-Cookie', [
        `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 60 * 60}`
    ]);

    const { password_hash, ...safeUser } = user;

    return res.status(200).json({
        loggedIn: true,
        accessToken,
        user: safeUser,
        dashboard_path: org.dashboard_path,
        organisation_id: org.id,
        dashboard_url: org.dashboard_url
    });
}