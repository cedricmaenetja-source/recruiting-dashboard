import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from './_verify-session';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // const session = await verifySession(req);
    // if (!session) {
    //     return res.status(401).json({ error: 'Authorization failed.' });
    // }

    const { action } = req.query;

    const VALID_ACTIONS = [
        'resetPassword',
        'resetPasswordLink',
        'otpVerification'
    ];

    if (action && !VALID_ACTIONS.includes(action)) return res.status(400).json({ error: `Unknown action: "${action}". Did you forget to register it in VALID_ACTIONS?` });

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { to, token, host, otp, body, subject, from, fromName, replyTo, email, link, clientName, userId,contactPerson, date, vendorName, role } = req.body;

    if (!token){
        return res.status(405).json({ error: 'Unauthorized.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    let payload;
    let tablename = '';
    tablename = (!role || role == 'admin') ? 'tbldashboardusers' : 'tbldashboardorganisationusers';
    
    const { data:exists, error:existsError } = await supabase
        .from(tablename)
        .select('id, email')
        .eq('id', decoded.userId)
        .eq('active', true)
        .maybeSingle(); 
   
    if (existsError) return res.status(500).json({ data: null, error: existsError.message });
    if (!exists) return res.status(500).json({ data: null, error: 'This user does not exist on our system.' });

    if (action === 'resetPassword'){
        const otp = Math.floor(100000 + Math.random() * 900000);
        const { data: otpUpdate, error: otpError } = await supabase
            .from(tablename)
            .update({otp: otp})
            .eq('email', exists.email); 

        if (otpError) return res.status(500).json({ data: null, error: otpError.message });

        payload = {
            to:  exists.email,
            subject: '[Recruiting Dashboard] - Your Verification Code',
            body: OTP_VERIFICATION_EMAIL.replace('{{OTP_CODE}}', otp) 
        };
    }

    if (action === 'resetPasswordLink'){
        payload = {
            to: email,
            subject: '[Recruiting Dashboard] - Password Reset',
            body: RESET_PASSWORD_EMAIL.replace('{{LINK}}', link).replaceAll('{{EMAIL}}', email) 
        };
    }

    if (action === 'otpVerification'){
        const otp = Math.floor(100000 + Math.random() * 900000);
        const { data: otpUpdate, error: otpError } = await supabase
            .from(tablename)
            .update({otp: otp})
            .eq('email', exists.email); 

        if (otpError) return res.status(500).json({ data: null, error: otpError.message });

        payload = {
            to: exists.email,
            subject: 'Recruiting Dashboard - Your Verification Code',
            body: OTP_VERIFICATION_EMAIL.replace('{{OTP_CODE}}', otp) 
        };
    }

    try {
        const response = await fetch(ZAPIER_SEND_EMAIL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Request failed' });
    }
}

export const ZAPIER_SEND_EMAIL = process.env.ZAPIER_SEND_EMAIL;
export const RESET_PASSWORD_EMAIL = `
    <p>Hello,<br/><br/>

    To reset your password, click the link below:<br/><br/>

    <strong>{{LINK}}?email={{EMAIL}}</strong><br/><br/>

    Email to use: <strong>{{EMAIL}}</strong><br/><br/>
    If you did not request this, please ignore this email.<br/><br/>

    Thanks,<br/>
    Udder</p>`;

export const OTP_VERIFICATION_EMAIL = `
    <p>Hello,<br/><br/>

    Your One-Time Password (OTP) for verification is:<br/><br/>

    <strong>{{OTP_CODE}}</strong><br/><br/>

    If you did not request this code, please ignore this email.<br/><br/>

    Thanks,<br/>
    Udder</p>`;