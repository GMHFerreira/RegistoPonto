// -----------------------------
// db.js — persistent storage helper with IndexedDB
// -----------------------------

const DB_NAME = "RegistoPontoDB";
const DB_VERSION = 1;
const STORE_NAME = "sessions";
const RATE_LIMIT_PREFIX = "rateLimit:";

let dbPromise;

function initDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "userId" });
          store.createIndex("userId", "userId", { unique: true });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }
  return dbPromise;
}

/**
 * Save a login session
 */
export async function saveSession(token, userId, role, setActive = true) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  // Fetch existing record
  const req = store.get(userId);
  const record = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || {});
    req.onerror = () => reject(req.error);
  });

  // Merge new session info without deleting existing rate limits or calendar
  const newRecord = {
    ...record,
    userId,
    token,
    role
  };

  store.put(newRecord);
  await tx.complete;

  if (setActive) localStorage.setItem("activeUserId", userId);
}

/**
 * Get the currently active session
 */
export async function getSession() {
  const activeUserId = localStorage.getItem("activeUserId");
  if (!activeUserId) return null;

  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(activeUserId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Switch to a different saved session
 */
export async function switchSession(userId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(userId);

    request.onsuccess = () => {
      if (request.result) {
        localStorage.setItem("activeUserId", userId);
      }
      resolve(request.result || null);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Logout current user (only removes active pointer)
 */
export function logout() {
  localStorage.removeItem("activeUserId");
}

/**
 * List all stored sessions
 */
export async function listSessions() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ------------------------------------------------------------------
   Rate limiting (persistent, per user, per action)
------------------------------------------------------------------ */

/**
 * Check whether an action is allowed under a cooldown
 * @param {string} actionKey
 * @param {number} cooldownMs
 */
export async function checkRateLimit(actionKey, cooldownMs) {
  if (!navigator.onLine) {
    return { allowed: false, reason: "offline", remainingMs: Infinity };
  }

  const session = await getSession();
  if (!session) {
    return { allowed: false, reason: "offline", remainingMs: Infinity };
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(session.userId);

    request.onsuccess = () => {
      const record = request.result || {};

      const key = RATE_LIMIT_PREFIX + actionKey;
      const lastTs = record[key] || 0;

      const elapsed = Date.now() - lastTs;

      if (elapsed >= cooldownMs) {
        resolve({ allowed: true });
      } else {
        resolve({
          allowed: false,
          reason: "cooldown",
          remainingMs: cooldownMs - elapsed
        });
      }
    };

    request.onerror = (err) => {
      console.error("[RateLimit] DB read error", err);
      reject(err);
    };
  });
}

export async function commitRateLimit(actionKey) {
  const session = await getSession();
  if (!session) {
    return;
  }

  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const req = store.get(session.userId);
  const record = await new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result || { userId: session.userId });
    };
    req.onerror = () => reject(req.error);
  });

  record[RATE_LIMIT_PREFIX + actionKey] = Date.now();

  await new Promise((resolve, reject) => {
    const putReq = store.put(record);
    putReq.onsuccess = () => {
      resolve();
    };
    putReq.onerror = (err) => {
      console.error(`[RateLimit] commitRateLimit: error saving record`, err);
      reject(err);
    };
  });
}


/**
 * Save calendar locally (persistent)
 */
export async function saveCalendarLocal(userId, calendarData) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  // Get full record first
  const record = await new Promise((resolve, reject) => {
    const req = store.get(userId);
    req.onsuccess = () => resolve(req.result || { userId });
    req.onerror = () => reject(req.error);
  });

  // Update calendar or managedUsers if provided
  if (calendarData.calendar) record.calendar = calendarData.calendar;
  if (calendarData.managedUsers) record.managedUsers = calendarData.managedUsers;

  // Save the updated record
  await new Promise((resolve, reject) => {
    const putReq = store.put(record);
    putReq.onsuccess = resolve;
    putReq.onerror = reject;
  });
}

/**
 * Load calendar from IndexedDB
 * If userId === managerId, returns manager's own calendar
 * If userId is a managed user, returns that user's calendar
 */
export async function getCalendarLocal(userId, managerId = null) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const request = store.get(managerId || userId);

    request.onsuccess = () => {
      const record = request.result || {};
      // If managerId is provided, fetch from managedUsers
      if (managerId && record.managedUsers && record.managedUsers[userId]) {
        resolve(record.managedUsers[userId]);
      } else {
        resolve(record.calendar || {});
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getUserRecord(userId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(userId);

    req.onsuccess = () => resolve(req.result || { userId });
    req.onerror = () => reject(req.error);
  });
}
