import { lockBtn } from '../../app.js';
import { initAuth, getCurrentUser, login, logout } from './admin-auth.js';

$(async function(){
    const token = await initAuth();
    if (!token) {
        window.location.href = `${window.location.origin}/admin/login.html`;
        return;
    }

    const user = await getCurrentUser();
    if (!user.data || user.data.role != 'admin'){
        logout();
        window.location.href = `./login.html`;
        return;
    }

    const API_URL = '/api/supabase';

    async function apiRequest(method, params, body){
        const qs = new URLSearchParams(params).toString();
        const url = `${API_URL}?${qs}`;
        console.log('[api] →', method, url, body ?? '');
        let res;
        try{
            res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
        }catch(networkErr){
            console.error('[api] network error (request never reached the server — check the URL, CORS, or that you\'re online):', networkErr);
            throw new Error('Network error — could not reach the API.');
        }
        console.log('[api] ←', res.status, method, url);
        if (!res.ok) {
            let msg = `Request failed (${res.status})`;
            try { const j = await res.json(); console.error('[api] error body:', j); if (j?.error) msg = j.error; } catch {}
            throw new Error(msg);
        }
        try { const j = await res.json(); console.log('[api] body:', j); return j; }
        catch { return null; } // some PUTs may return an empty body
    }
    const apiGet2 = (params) => apiRequest('GET', params);
    const apiPut  = (params, body) => apiRequest('PUT', params, body);
    const apiPost = (params, body) => apiRequest('POST', params, body);

    // GET supabase?action=getOrganisations
    async function fetchOrganisations(){
        const data = await apiGet2({ action: 'getOrganisations' });
        return Array.isArray(data) ? data : (data?.data ?? data?.organisations ?? []);
    }

    // GET supabase?action=getOrganisationUsers&orgId=<uuid>
    async function fetchOrganisationUsers(orgId){
        const data = await apiGet2({ action: 'getOrganisationUsers', orgId });
        return Array.isArray(data) ? data : (data?.data ?? data?.users ?? []);
    }

    // PUT supabase?action=updateOrganisation   body: { id, payload }
    async function updateOrganisation(id, payload){
        return apiPut({ action: 'updateOrganisation' }, { id, payload });
    }
    // POST supabase?action=addOrganisation   body: { payload }
    async function addOrganisation(payload){
        return apiPost({ action: 'addOrganisation' }, { payload });
    }
    // PUT supabase?action=updateOrganisationUser   body: { id, payload }
    async function updateOrganisationUser(id, payload){
        return apiPut({ action: 'updateOrganisationUser' }, { id, payload });
    }
    // PUT supabase?action=addOrganisationUser   body: { organisation_id, payload }
    async function addOrganisationUser(organisation_id, payload){
        // organisation_id is sent both top-level (per the dispatcher's contract) and inside payload —
        // belt-and-braces in case the handler inserts `payload` directly without merging it in itself.
        return apiPut({ action: 'addOrganisationUser' }, { organisation_id, payload: { ...payload, organisation_id } });
    }
    // best-effort extraction of a created row's id, whatever shape the API wraps it in
    function extractId(resp){
        return resp?.id ?? resp?.data?.id ?? resp?.organisation?.id ?? resp?.user?.id ?? resp?.result?.id ?? null;
    }

    /* ---------- row → app-shape mappers ---------- */
    // matches tbldashboardorganisations: id (uuid), name, website, active (bool), created_at, sr_reporting_id
    function mapOrg(row){
        return {
            id: row.id,
            name: row.name || '(untitled)',
            website: row.website || '',
            statusBool: !!row.active,
            status: row.active ? 'Active' : 'Suspended',
            createdDate: row.created_at ? new Date(row.created_at) : null,
            srReportingId: row.sr_reporting_id || '',
            oauthKey: row.oauth_key || '',
            jobsBi: row.jobs_bi || '',
            positionsBi: row.positions_bi || '',
            applicationsBi: row.applications_bi || '',
            dashboardPath: row.dashboard_path || ''
        };
    }
   
    function mapUser(row, orgId){
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
        return {
            id: row.id,
            orgId: row.organisation_id ?? orgId,
            firstName: row.first_name || '',
            lastName: row.last_name || '',
            name: name || '(no name)',
            email: row.email || '',
            role: row.role || null,
            department: row.department || null,
            active: !!row.active,
            status: row.active ? 'Active' : 'Inactive',
            lastActive: row.last_active ? new Date(row.last_active) : null
        };
    }

    /* ---------- loading helpers ---------- */
    const $pageLoader=document.getElementById('pageLoader');
    function hidePageLoader(){ $pageLoader.classList.add('hide'); }

    const navLoading={
        overview: document.getElementById('navLoadingOverview'),
        orgs: document.getElementById('navLoadingOrgs')
    };
    function setNavLoading(view,on){
        const el=navLoading[view]; if(!el)return;
        el.classList.toggle('show',on);
        const item=document.querySelector(`.nav-item[data-view="${view}"]`);
        if(item)item.setAttribute('aria-busy',on?'true':'false');
    }

    const CSS=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    Chart.defaults.font.family="Inter,'Helvetica Neue',Arial,sans-serif";
    Chart.defaults.font.size=11; Chart.defaults.color=CSS('--muted');
    const AX=()=>({grid:{color:CSS('--line'),drawTicks:false},ticks:{color:CSS('--muted2')},border:{color:CSS('--line')}});
    const charts={};
    function mk(id,cfg){if(charts[id])charts[id].destroy();charts[id]=new Chart(document.getElementById(id),cfg);}
    function initials(name){return (name||'?').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();}
    function fmtDay(d){return d?d.toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'}):'—';}
    function colorFor(name){const cols=[CSS('--signal'),CSS('--steel'),CSS('--amber'),CSS('--steel2'),'#7d8891','#54565b'];
    let h=0;for(let i=0;i<(name||'').length;i++)h=name.charCodeAt(i)+((h<<5)-h);return cols[Math.abs(h)%cols.length];}
    function distinctValues(arr,key){return [...new Set(arr.map(u=>u[key]).filter(Boolean))].sort();}
    function newId(){return crypto.randomUUID ? crypto.randomUUID() : 'tmp-'+Math.random().toString(36).slice(2);}

    /* ================= state ================= */
    let ORGS=[];
    let CURRENT_ORG_USERS=[];   // users of whichever org panel is currently open
    const usersCache=new Map(); // orgId -> mapped users[], avoids refetching on every open

    /* ================= ORGANIZATIONS VIEW ================= */
    const orgFilters={search:''};
    let ORG_SORT={key:'createdDate',dir:-1}, EDIT_ORG_ID=null;
    function orgsFiltered(){
    const q=orgFilters.search.toLowerCase();
    return ORGS.filter(o=>!q||o.name.toLowerCase().includes(q)||o.website.toLowerCase().includes(q));
    }
    function orgsSorted(rows){
    const {key,dir}=ORG_SORT;
    return rows.slice().sort((a,b)=>{
        let av=a[key], bv=b[key];
        if(av instanceof Date||bv instanceof Date)return ((av||0)-(bv||0))*dir;
        if(typeof av==='string')return av.localeCompare(bv)*dir;
        return ((av||0)-(bv||0))*dir;
    });
    }
    function renderOrgTable(){
        const rows=orgsSorted(orgsFiltered());
        document.getElementById('orgSub').textContent=`${rows.length.toLocaleString()} ORGANIZATION${rows.length===1?'':'S'} · CLICK A COLUMN TO SORT`;
        const arrow=k=>ORG_SORT.key===k?`<span class="arr">${ORG_SORT.dir<0?'▼':'▲'}</span>`:'';
        const th=(k,l)=>`<th class="sortable" data-k="${k}">${l} ${arrow(k)}</th>`;
        const t=document.getElementById('orgTable');
        t.innerHTML=`<thead><tr>${th('name','Organization')}${th('status','Status')}${th('createdDate','Created')}<th></th></tr></thead>
            <tbody>${rows.length?rows.map(o=>`<tr>
                    <td><div class="orgc org-open" data-id="${o.id}"><div class="org-avatar" style="background:${colorFor(o.name)}">${initials(o.name)}</div>
            <div><div class="o-name">${o.name}</div><div class="o-domain">${o.website||'—'}</div></div></div></td>
            <td><span class="stpill"><span class="dot ${o.status==='Active'?'g':'r'}"></span>${o.status}</span></td>
            <td style="color:var(--muted)">${fmtDay(o.createdDate)}</td>
            <td><div class="rowactions">
                <button class="rowbtn primary" data-act="users" data-id="${o.id}">Users</button>
                <button class="rowbtn" data-act="edit" data-id="${o.id}">Edit</button>
                <button class="rowbtn danger" data-act="delete" data-id="${o.id}">Deactivate</button>
            </div></td></tr>`).join(''):`<tr class="empty-row"><td colspan="4">No organizations match this search.</td></tr>`}</tbody>`;
        t.querySelectorAll('th.sortable').forEach(h=>h.onclick=()=>{const k=h.dataset.k;
            if(ORG_SORT.key===k)ORG_SORT.dir*=-1;else ORG_SORT={key:k,dir:1};renderOrgTable();});
        t.querySelectorAll('.rowbtn').forEach(b=>b.onclick=async ()=>{
            const id=b.dataset.id, act=b.dataset.act, o=ORGS.find(x=>x.id===id); if(!o)return;
            if(act==='users')openDrawer(o);
            else if(act==='edit')openOrgModal(o);
            else if(act==='delete'){
            const ok=await confirmDialog({
                title:'Deactivate organization?',
                message:`${o.name} will show as Suspended and can be re-activated later from Edit.`,
                confirmLabel:'Deactivate'
            });
            if(!ok)return;
            const orig=b.textContent;
            b.disabled=true; b.textContent='…';
            try{
                await updateOrganisation(o.id,{active:false});
                o.statusBool=false; o.status='Suspended';
                showToast(`${o.name} deactivated.`);
                renderOrgTable(); refreshNavCount(); renderKPIs(); renderOverviewCharts();
            }catch(err){
                console.error(err);
                showToast(err.message||'Could not deactivate organization.');
                b.disabled=false; b.textContent=orig;
            }
            }
        });

        t.querySelectorAll('.org-open').forEach(el=>el.onclick=()=>{
            const o=ORGS.find(x=>x.id===el.dataset.id); if(o)openDrawer(o);
        });
    }
    let orgSearchTimer=null;
    document.getElementById('orgSearchInp').addEventListener('input',e=>{
    clearTimeout(orgSearchTimer);
    orgSearchTimer=setTimeout(()=>{orgFilters.search=e.target.value.trim();renderOrgTable();},150);
    });

    /* ---------- add / edit organization modal ---------- */
    function openOrgModal(org){
    EDIT_ORG_ID=org?org.id:null;
    document.getElementById('orgModalTitle').textContent=org?'Edit organization':'Add organization';
    document.getElementById('oName').value=org?org.name:'';
    document.getElementById('oWebsite').value=org?org.website:'';
    document.getElementById('oSrId').value=org?org.srReportingId:'';
    document.getElementById('oStatus').value=org?String(org.statusBool):'true';
    document.getElementById('orgModalOv').classList.add('show');
    }
    function closeOrgModal(){document.getElementById('orgModalOv').classList.remove('show');}
    document.getElementById('addOrgBtn').onclick=()=>openOrgModal(null);
    document.getElementById('orgModalClose').onclick=closeOrgModal;
    document.getElementById('orgModalCancel').onclick=closeOrgModal;
    document.getElementById('orgModalOv').addEventListener('click',e=>{if(e.target.id==='orgModalOv')closeOrgModal();});
    document.getElementById('orgModalSave').onclick=async ()=>{
    const name=document.getElementById('oName').value.trim();
    const website=document.getElementById('oWebsite').value.trim();
    if(!name){showToast('Enter an organization name.');return;}
    const srReportingId=document.getElementById('oSrId').value.trim();
    const statusBool=document.getElementById('oStatus').value==='true';
    const payload={name,website,active:statusBool,sr_reporting_id:srReportingId||null};

    const btn=document.getElementById('orgModalSave'), orig=btn.textContent;
    btn.disabled=true; btn.textContent='Saving…';
    try{
        if(EDIT_ORG_ID){
        await updateOrganisation(EDIT_ORG_ID,payload);
        const o=ORGS.find(x=>x.id===EDIT_ORG_ID);
        Object.assign(o,{name,website,srReportingId,statusBool,status:statusBool?'Active':'Suspended'});
        showToast(`${name} updated.`);
        }else{
        const resp=await addOrganisation(payload);
        const id=extractId(resp)||newId();
        ORGS.push({id,name,website,srReportingId,statusBool,status:statusBool?'Active':'Suspended',createdDate:new Date()});
        showToast(`${name} added.`);
        }
        closeOrgModal(); renderOrgTable(); refreshNavCount(); renderKPIs(); renderOverviewCharts();
    }catch(err){
        console.error(err);
        showToast(err.message||'Could not save organization.');
    }finally{
        btn.disabled=false; btn.textContent=orig;
    }
    };

    document.getElementById('saveIntegrationsBtn').onclick = async () => {
        if(!CURRENT_ORG_ID) return;
        const org = ORGS.find(o=>o.id===CURRENT_ORG_ID); if(!org) return;
        const oauthKey = document.getElementById('intOauthKey').value.trim();
        const jobsBi = document.getElementById('intJobsBi').value.trim();
        const positionsBi = document.getElementById('intPositionsBi').value.trim();
        const applicationsBi = document.getElementById('intApplicationsBi').value.trim();
        const payload = {
            oauth_key: oauthKey || null,
            jobs_bi: jobsBi || null,
            positions_bi: positionsBi || null,
            applications_bi: applicationsBi || null
        };
        const btn = document.getElementById('saveIntegrationsBtn'), orig = btn.textContent;
        btn.disabled = true; btn.textContent = 'Saving…';
        try{
            await updateOrganisation(CURRENT_ORG_ID, payload);
            Object.assign(org, { oauthKey, jobsBi, positionsBi, applicationsBi });
            showToast('Integrations saved.');
        }catch(err){
            console.error(err);
            showToast(err.message || 'Could not save integrations.');
        }finally{
            btn.disabled = false; btn.textContent = orig;
        }
    };

    document.getElementById('saveConfigurationsBtn').onclick = async () => {
        if(!CURRENT_ORG_ID) return;
        const org = ORGS.find(o=>o.id===CURRENT_ORG_ID); if(!org) return;
        const dashboardPath = document.getElementById('cfgDashboardPath').value.trim();
        const payload = { dashboard_path: dashboardPath || null };

        const btn = document.getElementById('saveConfigurationsBtn'), orig = btn.textContent;
        btn.disabled = true; btn.textContent = 'Saving…';
        try{
            await updateOrganisation(CURRENT_ORG_ID, payload);
            Object.assign(org, { dashboardPath });
            showToast('Configuration saved.');
        }catch(err){
            console.error(err);
            showToast(err.message || 'Could not save configuration.');
        }finally{
            btn.disabled = false; btn.textContent = orig;
        }
    };

    /* ================= inline panel: users of one organization ================= */
    let CURRENT_ORG_ID=null;
    const userFilters={role:new Set(),department:new Set(),status:new Set(),search:''};
    let USER_SORT={key:'name',dir:1}, EDIT_USER_ID=null;

    async function openDrawer(org){
        CURRENT_ORG_ID=org.id;
        switchOupTab('users');
         populateIntegrationsTab(org);
         populateConfigurationsTab(org);
        userFilters.role.clear();userFilters.department.clear();userFilters.status.clear();userFilters.search='';
        document.getElementById('userSearchInp').value='';
        document.getElementById('dhOrgInitial').textContent=initials(org.name);
        document.getElementById('dhOrgInitial').style.background=colorFor(org.name);
        document.getElementById('dhOrgName').textContent=org.name;
        document.getElementById('bcOrgName').textContent=org.name;
        document.getElementById('orgListPanel').classList.add('hidden');
        document.getElementById('orgUsersPanel').classList.add('show');
        document.getElementById('tbOrgsActions').classList.add('hidden');

        if(usersCache.has(org.id)){
            CURRENT_ORG_USERS=usersCache.get(org.id);
            document.getElementById('dhOrgSub').textContent=`${CURRENT_ORG_USERS.length} users · ${org.website||''}`;
            buildDrawerFilters(); renderUserTable();
            return;
        }

        document.getElementById('dhOrgSub').innerHTML='<span class="spinner sm"></span> Loading users…';
        document.getElementById('userTable').innerHTML=`<tbody><tr class="empty-row"><td><span class="spinner sm"></span> Loading users…</td></tr></tbody>`;
        document.getElementById('drawerFilters').innerHTML='';
        try{
            const rows=await fetchOrganisationUsers(org.id);
            CURRENT_ORG_USERS=rows.map(r=>mapUser(r,org.id));
            usersCache.set(org.id,CURRENT_ORG_USERS);
        }catch(err){
            console.error(err);
            showToast('Could not load users for this organization.');
            CURRENT_ORG_USERS=[];
        }
        document.getElementById('dhOrgSub').textContent=`${CURRENT_ORG_USERS.length} users · ${org.website||''}`;
        buildDrawerFilters();
        renderUserTable();
    }
    function closeDrawer(){
        document.getElementById('orgUsersPanel').classList.remove('show');
        document.getElementById('orgListPanel').classList.remove('hidden');
        document.getElementById('tbOrgsActions').classList.remove('hidden');
        CURRENT_ORG_ID=null;
    }

    function switchOupTab(tab){
        document.querySelectorAll('#oupTabs .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
        document.getElementById('tabUsers').classList.toggle('show',tab==='users');
        document.getElementById('tabIntegrations').classList.toggle('show',tab==='integrations');
        document.getElementById('tabConfigurations').classList.toggle('show',tab==='configurations');
    }
    document.querySelectorAll('#oupTabs .tab-btn').forEach(b=>b.onclick=()=>switchOupTab(b.dataset.tab));

    function populateIntegrationsTab(org){
        document.getElementById('intOauthKey').value = org.oauthKey || '';
        document.getElementById('intJobsBi').value = org.jobsBi || '';
        document.getElementById('intPositionsBi').value = org.positionsBi || '';
        document.getElementById('intApplicationsBi').value = org.applicationsBi || '';
    }

    function populateConfigurationsTab(org){
        document.getElementById('cfgDashboardPath').value = org.dashboardPath || '';
    }

    document.getElementById('backToOrgs').onclick=closeDrawer;

    function usersFiltered(){
        return CURRENT_ORG_USERS.filter(u=>{
            if(userFilters.search){const q=userFilters.search.toLowerCase();
            if(!(u.name||'').toLowerCase().includes(q)&&!(u.email||'').toLowerCase().includes(q))return false;}
            if(userFilters.role.size&&!userFilters.role.has(u.role))return false;
            if(userFilters.department.size&&!userFilters.department.has(u.department))return false;
            if(userFilters.status.size&&!userFilters.status.has(u.status))return false;
            return true;
        });
    }
    function usersSorted(rows){
        const {key,dir}=USER_SORT;
        return rows.slice().sort((a,b)=>{
            let av=a[key],bv=b[key];
            if(av==null&&bv==null)return 0; if(av==null)return 1; if(bv==null)return -1;
            if(av instanceof Date)return (av-bv)*dir;
            if(typeof av==='string')return av.localeCompare(bv)*dir;
            return (av-bv)*dir;
        });
    }
    function renderUserTable(){
        const rows=usersSorted(usersFiltered());
        document.getElementById('dirSub').textContent=`${rows.length.toLocaleString()} USER${rows.length===1?'':'S'} · CLICK A COLUMN TO SORT`;
        const arrow=k=>USER_SORT.key===k?`<span class="arr">${USER_SORT.dir<0?'▼':'▲'}</span>`:'';
        const th=(k,l)=>`<th class="sortable" data-k="${k}">${l} ${arrow(k)}</th>`;
        const t=document.getElementById('userTable');
        t.innerHTML=`<thead><tr>${th('name','User')}${th('role','Role')}${th('department','Department')}
            ${th('status','Status')}${th('lastActive','Last active')}<th></th></tr></thead>
            <tbody>${rows.length?rows.map(u=>`<tr>
            <td><div class="userc"><div class="avatar" style="background:${colorFor(u.name)}">${initials(u.name)}</div>
                <div><div class="u-name">${u.name||'—'}</div><div class="u-email">${u.email||'—'}</div></div></div></td>
            <td>${u.role?`<span class="pill role-${String(u.role).toLowerCase()}">${u.role}</span>`:'—'}</td>
            <td style="color:var(--muted)">${u.department||'—'}</td>
            <td><span class="stpill"><span class="dot ${u.active?'g':'r'}"></span>${u.status}</span></td>
            <td style="color:var(--muted)">${u.lastActive?fmtDay(u.lastActive):'—'}</td>
            <td><div class="rowactions">
                <button class="rowbtn" data-act="reset" id="${u.id}" data-id="${u.id}">Send Password Reset Email</button>
                <button class="rowbtn" data-act="edit" data-id="${u.id}">Modify</button>
                <button class="rowbtn danger" data-act="delete" data-id="${u.id}">Suspend</button>
            </div></td></tr>`).join(''):`<tr class="empty-row"><td colspan="6">No users match this selection.</td></tr>`}</tbody>`;
        t.querySelectorAll('th.sortable').forEach(h=>h.onclick=()=>{const k=h.dataset.k;
            if(USER_SORT.key===k)USER_SORT.dir*=-1;else USER_SORT={key:k,dir:1};renderUserTable();});
        t.querySelectorAll('.rowbtn').forEach(b=>b.onclick=async ()=>{
            const id=b.dataset.id, act=b.dataset.act, u=CURRENT_ORG_USERS.find(x=>x.id===id); if(!u)return;
            if(act==='edit')openUserModal(u);
            else if(act==='reset'){
                const reset = lockBtn($(`#${id}`), {spinnerColor: 'var(--muted)'});
                if (!reset) return;

                const res = await fetch('/api/send-email?action=resetPasswordLink', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: token, email: u.email, link: `${window.location.origin}/reset-password.html`})
                });

                const r = await res.json();
                if (r.error) {
                    showToast(`Error: ${r.error}.`);
                    reset();
                    return;
                }
            showToast(`Password reset email sent to ${u.email}.`);
            reset();
            }else if(act==='delete'){
            const ok=await confirmDialog({
                title:'Suspend user?',
                message:`${u.name} will be marked Inactive and can be re-activated later from Modify.`,
                confirmLabel:'Suspend'
            });
            if(!ok)return;
            const orig=b.textContent;
            b.disabled=true; b.textContent='…';
            try{
                await updateOrganisationUser(u.id,{active:false});
                u.active=false; u.status='Inactive';
                showToast(`${u.name} suspended.`);
                renderUserTable(); refreshOrgHeaderCount();
            }catch(err){
                console.error(err);
                showToast(err.message||'Could not suspend user.');
                b.disabled=false; b.textContent=orig;
            }
            }
        });
    }
    function refreshOrgHeaderCount(){
        if(!CURRENT_ORG_ID)return;
        const org=ORGS.find(o=>o.id===CURRENT_ORG_ID); if(!org)return;
        document.getElementById('dhOrgSub').textContent=`${CURRENT_ORG_USERS.length} users · ${org.website||''}`;
    }

    /* ---------- filters UI (options derived from whatever data actually came back) ---------- */
    function buildDrawerFilters(){
    const host=document.getElementById('drawerFilters');host.innerHTML='';
    const OPTS={
        role: distinctValues(CURRENT_ORG_USERS,'role'),
        department: distinctValues(CURRENT_ORG_USERS,'department'),
        status: distinctValues(CURRENT_ORG_USERS,'status')
    };
    const DEFS=[['role','Role'],['department','Department'],['status','Status']];
    DEFS.forEach(([key,label])=>{
        const opts=OPTS[key]; if(!opts.length)return;
        const wrap=document.createElement('div');wrap.className='ms';
        wrap.innerHTML=`<label>${label}</label>
        <div class="ms-btn" data-k="${key}"><span class="lbl">All</span><span class="cnt">0</span><span class="car">▾</span></div>
        <div class="ms-pop">${opts.map(o=>`<label class="ms-opt"><input type="checkbox" value="${o}">${o}</label>`).join('')}</div>`;
        host.appendChild(wrap);
        const btn=wrap.querySelector('.ms-btn'),pop=wrap.querySelector('.ms-pop');
        btn.onclick=e=>{e.stopPropagation();document.querySelectorAll('.ms-pop').forEach(p=>{if(p!==pop)p.classList.remove('open');});pop.classList.toggle('open');};
        pop.querySelectorAll('input').forEach(cb=>cb.onchange=()=>{
        cb.checked?userFilters[key].add(cb.value):userFilters[key].delete(cb.value);
        const n=userFilters[key].size;btn.classList.toggle('active',n>0);
        btn.querySelector('.cnt').textContent=n;
        btn.querySelector('.lbl').textContent=n===0?'All':n===1?[...userFilters[key]][0]:`${n} selected`;
        renderUserTable();});
    });
    const rb=document.createElement('button');rb.className='reset';rb.textContent='reset all';
    rb.onclick=()=>{DEFS.forEach(([k])=>userFilters[k].clear());userFilters.search='';document.getElementById('userSearchInp').value='';buildDrawerFilters();renderUserTable();};
    host.appendChild(rb);
    }
    document.addEventListener('click',()=>document.querySelectorAll('.ms-pop').forEach(p=>p.classList.remove('open')));
    let userSearchTimer=null;
    document.getElementById('userSearchInp').addEventListener('input',e=>{
    clearTimeout(userSearchTimer);
    userSearchTimer=setTimeout(()=>{userFilters.search=e.target.value.trim();renderUserTable();},150);
    });
    document.getElementById('exportUsersBtn').onclick=()=>{
    const org=ORGS.find(o=>o.id===CURRENT_ORG_ID);
    const rows=usersSorted(usersFiltered()).map(u=>({'First name':u.firstName,'Last name':u.lastName,Email:u.email,
        Role:u.role||'',Department:u.department||'',Status:u.status,'Last active':u.lastActive?fmtDay(u.lastActive):''}));
    if(!rows.length){showToast('Nothing to export in this selection.');return;}
    const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Users');
    XLSX.writeFile(wb,`${(org?org.name:'users').toLowerCase().replace(/\s+/g,'_')}_users_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    /* ---------- add / edit user modal ---------- */
    function openUserModal(user){
    EDIT_USER_ID=user?user.id:null;
    document.getElementById('modalTitle').textContent=user?'Edit user':'Add user';
    document.getElementById('fFirstName').value=user?user.firstName:'';
    document.getElementById('fLastName').value=user?user.lastName:'';
    document.getElementById('fEmail').value=user?user.email:'';
    document.getElementById('fRole').value=user?(user.role||'Member'):'Member';
    document.getElementById('fDept').value=user?(user.department||''):'';
    document.getElementById('fActive').value=user?String(!!user.active):'true';
    document.getElementById('modalOv').classList.add('show');
    }
    function closeUserModal(){document.getElementById('modalOv').classList.remove('show');}
    document.getElementById('addUserBtn').onclick=()=>openUserModal(null);
    document.getElementById('modalClose').onclick=closeUserModal;
    document.getElementById('modalCancel').onclick=closeUserModal;
    document.getElementById('modalOv').addEventListener('click',e=>{if(e.target.id==='modalOv')closeUserModal();});
    document.getElementById('modalSave').onclick=async ()=>{
    const firstName=document.getElementById('fFirstName').value.trim();
    const lastName=document.getElementById('fLastName').value.trim();
    const email=document.getElementById('fEmail').value.trim();
    if(!firstName||!email||!email.includes('@')){showToast('Enter a first name and a valid email.');return;}
    const role=document.getElementById('fRole').value, department=document.getElementById('fDept').value;
    const active=document.getElementById('fActive').value==='true';
    const name=[firstName,lastName].filter(Boolean).join(' ');
    const payload={first_name:firstName,last_name:lastName,email,role,department,active};

    const btn=document.getElementById('modalSave'), orig=btn.textContent;
    btn.disabled=true; btn.textContent='Saving…';
    try{
        if(EDIT_USER_ID){
        await updateOrganisationUser(EDIT_USER_ID,payload);
        const u=CURRENT_ORG_USERS.find(x=>x.id===EDIT_USER_ID);
        Object.assign(u,{firstName,lastName,name,email,role,department,active,status:active?'Active':'Inactive'});
        showToast(`${name} updated.`);
        }else{
        const resp=await addOrganisationUser(CURRENT_ORG_ID,payload);
        const id=extractId(resp)||newId();
        CURRENT_ORG_USERS.push({id,orgId:CURRENT_ORG_ID,firstName,lastName,name,email,role,department,active,status:active?'Active':'Inactive',lastActive:null});
        showToast(`${name} added.`);
        }
        usersCache.set(CURRENT_ORG_ID,CURRENT_ORG_USERS);
        closeUserModal(); buildDrawerFilters(); renderUserTable(); refreshOrgHeaderCount();
    }catch(err){
        console.error(err);
        showToast(err.message||'Could not save user.');
    }finally{
        btn.disabled=false; btn.textContent=orig;
    }
    };

    /* ---------- escape key: close topmost overlay only ---------- */
    document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(document.getElementById('confirmOv').classList.contains('show'))document.getElementById('confirmCancel').click();
    else if(document.getElementById('modalOv').classList.contains('show'))closeUserModal();
    else if(document.getElementById('orgModalOv').classList.contains('show'))closeOrgModal();
    else if(document.getElementById('orgUsersPanel').classList.contains('show'))closeDrawer();
    });

    /* ---------- overview: KPIs + charts (derived from ORGS — no bulk-users endpoint yet) ---------- */
    function renderKPIs(){
    const totalOrgs=ORGS.length, activeOrgs=ORGS.filter(o=>o.status==='Active').length;
    const suspendedOrgs=totalOrgs-activeOrgs;
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);
    const newOrgs=ORGS.filter(o=>o.createdDate&&o.createdDate>=cutoff).length;
    const cards=[
        {l:'Organizations',v:totalOrgs,lead:true,n:'total accounts'},
        {l:'Active Organizations',v:activeOrgs,n:totalOrgs?Math.round(activeOrgs/totalOrgs*100)+'% of total':'—'},
        {l:'Suspended Organizations',v:suspendedOrgs,n:suspendedOrgs?'review access':'none'},
        {l:'New Orgs (30d)',v:newOrgs,n:'added this month'}
    ];
    document.getElementById('kpis').innerHTML=cards.map(c=>`<div class="kpi${c.lead?' lead':''}">
        <div class="k-label">${c.l}</div><div class="k-val">${c.v}</div>
        <div class="k-note">${c.n}</div></div>`).join('');
    }
    function renderOverviewCharts(){
    const active=ORGS.filter(o=>o.status==='Active').length, suspended=ORGS.length-active;
    mk('cStatus',{type:'doughnut',data:{labels:['Active','Suspended'],datasets:[{data:[active,suspended],
        backgroundColor:[CSS('--good'),CSS('--warn')],borderColor:'#fff',borderWidth:2}]},
        options:{maintainAspectRatio:false,cutout:'58%',
        plugins:{legend:{position:'bottom',labels:{boxWidth:9,boxHeight:9,padding:12,font:{size:10.5}}},
            tooltip:{callbacks:{label:c=>{const t=c.dataset.data.reduce((s,x)=>s+x,0);return `${c.label}: ${c.raw} (${t?(c.raw/t*100).toFixed(0):0}%)`;}}}}}});

    const mons=[];const now=new Date();
    for(let i=7;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);mons.push(d);}
    const monKey=d=>d.getFullYear()+'-'+d.getMonth();
    const counts={};mons.forEach(m=>counts[monKey(m)]=0);
    ORGS.forEach(o=>{if(!o.createdDate)return;const k=monKey(new Date(o.createdDate.getFullYear(),o.createdDate.getMonth(),1));if(k in counts)counts[k]++;});
    mk('cOrgGrowth',{type:'bar',data:{labels:mons.map(m=>m.toLocaleDateString('en',{month:'short'})+" '"+String(m.getFullYear()).slice(2)),
        datasets:[{label:'New organizations',data:mons.map(m=>counts[monKey(m)]),backgroundColor:CSS('--steel3'),
        hoverBackgroundColor:CSS('--signal'),borderRadius:2}]},
        options:{maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{...AX()},y:{...AX(),beginAtZero:true,ticks:{precision:0}}}}});
    }

    /* ---------- nav / view switching ---------- */
    function setView(view){
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    document.getElementById('viewOverview').classList.toggle('show',view==='overview');
    document.getElementById('viewOrgs').classList.toggle('show',view==='orgs');
    document.getElementById('tbOrgsActions').classList.toggle('hidden',view!=='orgs');
    if(view==='orgs')closeDrawer();
    if(view==='overview'){
        document.getElementById('tbTitle').textContent='Overview';
        document.getElementById('tbSub').textContent='Account activity at a glance';
    }else{
        document.getElementById('tbTitle').textContent='Organizations';
        document.getElementById('tbSub').textContent='Manage organizations and their users';
    }
    }

    function showToast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');
    clearTimeout(showToast._t);showToast._t=setTimeout(()=>el.classList.remove('show'),2600);}
    document.getElementById('signOutBtn').onclick=async ()=>{
        try{ showToast('Logging out...');await logout(); }
        catch(err){ console.error('[auth] logout error:', err); }
        window.location.href = `./login.html`;
    };

    /* ---------- themed confirm dialog (Promise<boolean>, replaces window.confirm) ---------- */
    function confirmDialog({title='Are you sure?', message='This action cannot be undone.', confirmLabel='Confirm'}={}){
    const ov=document.getElementById('confirmOv');
    document.getElementById('confirmTitle').textContent=title;
    document.getElementById('confirmMsg').textContent=message;
    const okBtn=document.getElementById('confirmOk'), cancelBtn=document.getElementById('confirmCancel');
    okBtn.textContent=confirmLabel;
    ov.classList.add('show');
    return new Promise(resolve=>{
        const cleanup=(result)=>{
        ov.classList.remove('show');
        okBtn.removeEventListener('click',onOk);
        cancelBtn.removeEventListener('click',onCancel);
        ov.removeEventListener('click',onBackdrop);
        resolve(result);
        };
        const onOk=()=>cleanup(true);
        const onCancel=()=>cleanup(false);
        const onBackdrop=e=>{if(e.target.id==='confirmOv')cleanup(false);};
        okBtn.addEventListener('click',onOk);
        cancelBtn.addEventListener('click',onCancel);
        ov.addEventListener('click',onBackdrop);
    });
    }

    function refreshNavCount(){document.getElementById('navOrgCount').textContent=ORGS.length;}

    /* ---------- per-section lazy loading (drives the nav-item spinners) ---------- */
    let ORGS_LOADED=false, OVERVIEW_LOADED=false;

    async function ensureOrgsLoaded(force=false){
        if(ORGS_LOADED && !force)return;
        try{
            const rows=await fetchOrganisations();
            ORGS=rows.map(mapOrg);
        }catch(err){
            console.error(err);
            showToast('Could not load organizations.');
            ORGS=[];
        }
        ORGS_LOADED=true;
    }

    async function loadOverview(force=false){
        if(OVERVIEW_LOADED && !force)return;
        const needsFetch=!ORGS_LOADED||force;
        if(needsFetch)setNavLoading('overview',true);
        await ensureOrgsLoaded(force);
        renderKPIs(); renderOverviewCharts(); refreshNavCount();
        OVERVIEW_LOADED=true;
        if(needsFetch)setNavLoading('overview',false);
    }
    async function loadOrgs(force=false){
        const needsFetch=!ORGS_LOADED||force;
        if(needsFetch){
            setNavLoading('orgs',true);
            document.getElementById('navOrgCount').innerHTML='<span class="spinner sm"></span>';
        }
        await ensureOrgsLoaded(force);
        renderOrgTable(); refreshNavCount();
        if(needsFetch)setNavLoading('orgs',false);
    }

    document.querySelectorAll('.nav-item').forEach(b=>b.onclick=async ()=>{
        const view=b.dataset.view;
        if(view==='orgs')await loadOrgs();
        else if(view==='overview')await loadOverview();
        setView(view);
    });

    /* ---------- init ---------- */
    await loadOverview();      // fetches getOrganisations once — page loader stays up until this resolves
    hidePageLoader();
    setView('overview');
});