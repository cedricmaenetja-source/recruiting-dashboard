let accessToken = null;
let currentUser = null;

export function getAccessToken() {
    return accessToken;
}

export async function getCurrentUser() {
    const res = await fetch("/api/session", {
        method: "GET",
        credentials: "include" 
    });

    if (!res.ok) {
        const { error } = await res.json();
        return JSON.stringify({'error':'Failed to get user'});
    }

    const data = await res.json();
    return data;
}

export async function login(email, password) {
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email:email, password:password })
    });
   
    const data = await res.json();
    return data;
}

export async function logout() {
    const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    const data = await res.json();
    return data;
}

export async function refresh() {
    const res = await fetch('/api/refresh', {
        method: 'POST',
        credentials: 'include'
    });
    
    if (!res.ok) {
        accessToken = null;
        currentUser = null;
        return null;
    }

    const data = await res.json();
    accessToken = data.accessToken;
    return accessToken;
}

export async function initAuth() {
    const token = await refresh();
    return token;
}