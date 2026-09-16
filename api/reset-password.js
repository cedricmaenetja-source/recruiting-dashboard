import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const { token, password, role } = req.body;

    if (!token){
        return res.status(405).json({ error: 'Unauthorized.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const tablename = (!role || role == 'admin') ? 'tbldashboardusers' : 'tbldashboardorganisationusers';
   
    const { data:exists, error:existsError } = await supabase
        .from(tablename)
        .select('id, email')
        .eq('email', decoded.email)
        .eq('active', true)
        .maybeSingle(); 
   
    if (existsError) return res.status(500).json({ data: null, error: existsError.message });
    if (!exists) return res.status(500).json({ data: null, error: 'This user does not exist on our system.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
        .from(tablename)
        .update({password: hashedPassword})
        .eq('email', decoded.email)
        .select('*')
        .maybeSingle(); 
    
    if (error) return res.status(500).json({ data: null, error: error.message });
  
    return res.status(200).json(data);
}