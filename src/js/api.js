import { saveSession, getSession } from './db.js';

const API_BASE = "https://registo-ponto-api.hferreira-628.workers.dev";

// Use persistent token from db.js
async function authHeaders(userIdOverride) {
  const session = await getSession();
  if (!session) throw new Error("No session found. User must log in.");
  return {
    "Authorization": `RP-Token ${session.token}`,
    "X-User-Id": userIdOverride || session.userId
  };
}

async function handleResponse(res) {
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Erro de API");
  }
  return res.json();
}

// -----------------------------
// API functions
// -----------------------------
export async function apiLogin(id, password) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password })
  });

  const data = await handleResponse(res);

  // Save token persistently using db.js
  saveSession(data.token, id, data.role);

  return data; // { token, role }
}

// -----------------------------
// Fetch a single user's full record (used by standard users to refresh themselves)
// -----------------------------
export async function apiGetUser(userId) {
  const headers = await authHeaders(userId);
  const res = await fetch(`${API_BASE}/user/${userId}`, { headers });
  return handleResponse(res); // returns full user record: { password, role, manager, calendar, managerCopy }
}

export async function saveCalendar(userId, calendar) {
  const headers = await authHeaders(userId);
  const res = await fetch(`${API_BASE}/calendar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify({ userId, calendar })
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg);
  }
}

// -----------------------------
// Fetch full manager snapshot (manager + all managed users and their calendars)
// -----------------------------
export async function getManagerSnapshot() {
  const headers = await authHeaders(); // uses current logged-in manager session
  const res = await fetch(`${API_BASE}/manager/snapshot`, { headers });
  const data = await handleResponse(res);

  // data is typed as { manager: { userId, calendar }, users: [{ userId, name, calendar }] }
  return data;
}

// -----------------------------
// Remove getManagedUsers: replaced by getManagerSnapshot
// -----------------------------
export async function getManagedUsers() {
  const snapshot = await getManagerSnapshot();
  return snapshot.users.sort((a, b) =>
    a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' })
  );
}

// -----------------------------
// Optional session check
// -----------------------------
export async function checkSession() {
  return getSession(); // return the saved persistent session
}

// -----------------------------
// Optional helper: export a snapshot as JSON
// -----------------------------
export function exportSnapshotJSON(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `manager_snapshot_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
