import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const { email, otp, role } = req.body;

    const tablename = (!role || role == 'admin') ? 'tbldashboardusers' : 'tbldashboardorganisationusers';
    const { data, error } = await supabase
        .from(tablename)
        .select('email')
        .eq('email', email)
        .eq('otp', otp)
        .maybeSingle(); 

    if (error) return res.status(500).json({ data: null, error: error.message });
    if (!data) if (!data) return res.status(500).json({ data: null, error: 'Otp verification failed.' });
    
    return res.status(200).json(data);
}