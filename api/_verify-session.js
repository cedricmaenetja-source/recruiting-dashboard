import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function verifySession(req) {
    const token = req.cookies.refreshToken;
    
    const { data: tokenRow, error } = await supabase
        .from('tbldashboardsessions')
        .select('id, user_id, expires_at')
        .eq('token', token)
        .single();
    
    if (error || !tokenRow) return null;
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        return decoded;
    } catch {
        return null;
    }
}