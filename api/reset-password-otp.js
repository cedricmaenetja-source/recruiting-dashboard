import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from './_verify-session';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

export default async function handler(req, res) {
    const { to, token, host, body, subject, from, fromName, replyTo, email, link, clientName, userId,contactPerson, date, vendorName, role } = req.body;

    let payload;
    let tablename = '';
    tablename = (!role || role == 'admin') ? 'tbldashboardusers' : 'tbldashboardorganisationusers';
    
    const { data, error } = await supabase
        .from(tablename)
        .select('id, email')
        .eq('email', email)
        .maybeSingle(); 

    if (error) return res.status(500).json({ data: null, error: error.message });
    if (!data) return res.status(500).json({ data: null, error: 'This email does not exist on our system.' });

    const otp = Math.floor(100000 + Math.random() * 900000);
    const { data: otpUpdate, error: otpError } = await supabase
        .from(tablename)
        .update({otp: otp})
        .eq('email', email); 

    if (otpError) return res.status(500).json({ data: null, error: otpError.message });

    payload = {
        to:  email,
        subject: '[Recruiting Dashboard] - Your Verification Code',
        body: OTP_VERIFICATION_EMAIL.replace('{{OTP_CODE}}', otp) 
    };

    try {
        const response = await fetch(ZAPIER_SEND_EMAIL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();

        const accessToken = jwt.sign({email: email}, ACCESS_SECRET, { expiresIn: '15m' });
        data.accessToken = accessToken;
        
        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Request failed' });
    }
}

export const ZAPIER_SEND_EMAIL = process.env.ZAPIER_SEND_EMAIL;
export const OTP_VERIFICATION_EMAIL = `
    <p>Hello,<br/><br/>

    Your One-Time Password (OTP) for verification is:<br/><br/>

    <strong>{{OTP_CODE}}</strong><br/><br/>

    If you did not request this code, please ignore this email.<br/><br/>

    Thanks,<br/>
    Udder</p>`;