import { createClient } from '@supabase/supabase-js';
import { verifySession } from './_verify-session';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const session = await verifySession(req);
    if (!session) {
        // token used for guest users
        const token = req.cookies.auth;
        try {    
            if (!token) {
                return res.status(400).json({
                    error: 'Authorization failed.'
                });
            }
    
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    
        } catch (err) {
            return res.status(401).json({ error: 'Authorization failed.' });
        }
    }

    const { action, orgId } = req.query;
    const VALID_ACTIONS = [
        'getOrganisations',
        'getOrganisationUsers',
        'updateOrganisationUser',
        'updateOrganisation',
        'addOrganisationUser',
        'addOrganisation'
    ];

    if (action && !VALID_ACTIONS.includes(action)) return res.status(400).json({ error: `Unknown action: "${action}". Did you forget to register it in VALID_ACTIONS?` });

    if (action === 'getOrganisations') return await getOrganisations(res);
    if (action === 'getOrganisationUsers') return await getOrganisationUsers(orgId, res);

    if (action === 'updateOrganisationUser'){
        if (req.method !== "PUT") {
            return res.status(405).json({ error: "Only PUT allowed" });
        }

        try {
            const { id, payload } = req.body;
            return await updateOrganisationUser(res, id, payload);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Internal error' });
        }
    }

    if (action === 'updateOrganisation'){
        if (req.method !== "PUT") {
            return res.status(405).json({ error: "Only PUT allowed" });
        }

        try {
            const { id, payload } = req.body;
            return await updateOrganisation(res, id, payload);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Internal error' });
        }
    }

    if (action === 'addOrganisationUser'){
        if (req.method !== "PUT") {
            return res.status(405).json({ error: "Only PUT allowed" });
        }

        try {
            const { organisation_id, payload } = req.body;
            return await addOrganisationUser(res, organisation_id, payload);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Internal error' });
        }
    }

    if (action === 'addOrganisation'){
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Only POST allowed" });
        }

        try {
            const { payload } = req.body;
            return await addOrganisation(res, payload);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Internal error' });
        }
    }
}

async function getOrganisations(res) {
  const { data, error } = await supabase
    .from('tbldashboardorganisations')
    .select('*');

    if (error) return res.status(500).json({ data: null, error: error.message });
    return res.status(200).json({ data });
}

async function getOrganisationUsers(orgId, res) {
  const { data, error } = await supabase
    .from('tbldashboardorganisationusers')
    .select('id, organisation_id, first_name, last_name, email, role, department, last_active, active')
    .eq('organisation_id', orgId);

    if (error) return res.status(500).json({ data: null, error: error.message });
    return res.status(200).json({ data });
}

async function updateOrganisationUser(res, id, payload) {
    const { data, error } = await supabase
        .from('tbldashboardorganisationusers')
        .update(payload)
        .eq('id', id);
    
    if (error) return res.status(500).json({ data: null, error: error.message });
    return res.status(200).json({ data });
}

async function updateOrganisation(res, id, payload) {
    const { data, error } = await supabase
        .from('tbldashboardorganisations')
        .update(payload)
        .eq('id', id);
    
    if (error) return res.status(500).json({ data: null, error: error.message });
    return res.status(200).json({ data });
}

async function addOrganisationUser(res, orgId, payload) {
    const { data: existing, error: checkError } = await supabase
        .from('tbldashboardorganisationusers')
        .select('id')
        .eq('email', payload.email)
        .eq('organisation_id', orgId);

    if (checkError) return res.status(500).json({ data: null, error: checkError.message });
    if (existing && existing.length > 0) {
        return res.status(409).json({ data: null, error: `This user already exists.` });
    }

    const { data, error } = await supabase
        .from('tbldashboardorganisationusers')
        .insert(payload)
        .select();

    if (error) return res.status(500).json({ data: null, error: error.message });
    return res.status(200).json({ data });
}

async function addOrganisation(res, payload) {
    const { data: existing, error: checkError } = await supabase
        .from('tbldashboardorganisations')
        .select('id')
        .eq('name', payload.name);

    if (checkError) return res.status(500).json({ data: null, error: checkError.message });
    if (existing && existing.length > 0) {
        return res.status(409).json({ data: null, error: `This organisation already exists.` });
    }

    const { data, error } = await supabase
        .from('tbldashboardorganisations')
        .insert(payload)
        .select();

    if (error) return res.status(500).json({ data: null, error: error.message });
    return res.status(200).json({ data });
}