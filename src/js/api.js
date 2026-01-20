import { getOwnCalendar, getSession, refreshUserData, saveManagedOriginalCalendar  } from './db.js';

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

  const fullUser = await handleResponse(res);

  const mergedRecord = await refreshUserData({
    ...fullUser,
    userId: id,
    token: fullUser.password
  });

  return mergedRecord;
}

// -----------------------------
// Fetch a single user's full record (used by standard users to refresh themselves)
// -----------------------------
export async function apiGetUser(userId) {
  const headers = await authHeaders(userId);
  const res = await fetch(`${API_BASE}/user/${userId}`, { headers });
  const fullUser = await handleResponse(res);

  const mergedRecord = await refreshUserData({
    ...fullUser,
    userId,
    token: fullUser.password
  });

  return mergedRecord;
}

export async function saveCalendar(userId) {
  const calendar = await getOwnCalendar(userId);
  const headers = await authHeaders(userId);

  const res = await fetch(`${API_BASE}/calendar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ userId, calendar })
  });

  return handleResponse(res); // throws on error, otherwise returns "Calendar saved"
}

// -----------------------------
// Fetch a managed user's original calendar
// -----------------------------
export async function apiGetManagedOriginal(managerId, managedUserId) {
  const headers = await authHeaders(managerId);

  // GET /user/{managedUserId} from backend
  const res = await fetch(`${API_BASE}/user/${managedUserId}`, { headers });
  const fetchedUser = await handleResponse(res);

  // Save the calendar as the 'original' in IndexedDB
  const savedOriginal = await saveManagedOriginalCalendar(
    managerId,
    managedUserId,
    fetchedUser.calendar
  );

  return savedOriginal; // returns the original calendar for local use
}
