// -----------------------------
// db.js — persistent storage helper with IndexedDB
// -----------------------------

const DB_NAME = "RegistoPontoDB";
const DB_VERSION = 1;
const STORE_NAME = "sessions";
const RATE_LIMIT_PREFIX = "rateLimit:";

let dbPromise;

// -----------------------------
// IndexedDB initialization
// -----------------------------
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

// -----------------------------
// IndexedDB helpers (DRY)
// -----------------------------
async function idbGet(key) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(record) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

// -----------------------------
// Full refresh: session + calendar
// -----------------------------
export async function refreshUserData(fetchedUser) {
  // fetchedUser = { userId, token, role, managedUsers, calendar }
  const { userId, token, role, managedUsers = [], calendar: fetchedCalendar } = fetchedUser;

  // Load existing record or create template
  let record = await idbGet(userId);
  if (!record) {
    record = {
      userId,
      calendar: { columns: [], cells: [], dateRange: null },
      managedUsers: {}
    };
  }

  // --- Session / auth info ---
  record.token = token;
  record.role = role;

  // --- Manager-specific: sync managedUsers list ---
  if (role === "manager") {
    record.managedUsers ??= {};

    // Add new managed users
    for (const managedUserId of managedUsers) {
      record.managedUsers[managedUserId] ??= {
        original: null,
        copies: {}
      };
    }

    // Remove deleted managed users
    for (const existingId of Object.keys(record.managedUsers)) {
      if (!managedUsers.includes(existingId)) {
        delete record.managedUsers[existingId];
      }
    }
  }

  // --- Merge fetched calendar ---
  if (fetchedCalendar) {
    const local = record.calendar;

    // Columns: combine unique columns
    local.columns = Array.from(new Set([...local.columns, ...(fetchedCalendar.columns || [])]));

    // Cells: local edits take priority
    const localCellMap = new Map(local.cells.map(c => `${c.date}|${c.column}`));
    const mergedCells = [...local.cells];

    (fetchedCalendar.cells || []).forEach(c => {
      const key = `${c.date}|${c.column}`;
      if (!localCellMap.has(key)) {
        mergedCells.push(c);
      }
    });

    local.cells = mergedCells;

    // Date range: prefer local if it exists
    local.dateRange = local.dateRange || fetchedCalendar.dateRange || null;
  }

  // Persist everything
  await idbPut(record);
  localStorage.setItem("activeUserId", userId);

  return record; // return full up-to-date record
}

export async function getSession() {
  const activeUserId = localStorage.getItem("activeUserId");
  if (!activeUserId) return null;
  return idbGet(activeUserId);
}

export function logout() {
  localStorage.removeItem("activeUserId");
}

// -----------------------------
// Rate Limiting
// -----------------------------
export async function checkRateLimit(actionKey, cooldownMs) {
  if (!navigator.onLine) return { allowed: false, reason: "offline", remainingMs: Infinity };
  const session = await getSession();
  const record = (await idbGet(session.userId)) || {};
  const lastTs = record[RATE_LIMIT_PREFIX + actionKey] || 0;
  const elapsed = Date.now() - lastTs;

  if (elapsed >= cooldownMs) {
    return { allowed: true };
  } else {
    return { allowed: false, reason: "cooldown", remainingMs: cooldownMs - elapsed };
  }
}

export async function commitRateLimit(actionKey) {
  const session = await getSession();
  const record = (await idbGet(session.userId)) || { userId: session.userId };
  record[RATE_LIMIT_PREFIX + actionKey] = Date.now();
  await idbPut(record);
}

// -----------------------------
// Owner's calendar
// -----------------------------
export async function getOwnCalendar(userId) {
  const record = await idbGet(userId);
  return record.calendar;
}

async function updateOwnCalendar(userId, mutator) {
  const record = await idbGet(userId);
  mutator(record.calendar);
  await idbPut(record);
  return record.calendar;
}

export async function updateOwnCalendarCell(userId, date, column, value) {
  return updateOwnCalendar(userId, (calendar) => {
    const existing = calendar.cells.find(
      c => c.date === date && c.column === column
    );

    if (existing) {
      if (value === null || value === "") {
        calendar.cells.splice(calendar.cells.indexOf(existing), 1);
      } else {
        existing.value = value;
      }
    } else if (value !== null && value !== "") {
      calendar.cells.push({ date, column, value });
    }
  });
}

export async function saveOwnCalendarColumns(userId, customColumns) {
  return updateOwnCalendar(userId, (calendar) => {
    calendar.columns = customColumns;
  });
}

export async function saveOwnCalendarDateRange(userId, startDate, endDate) {
  return updateOwnCalendar(userId, (calendar) => {
    calendar.dateRange = { startDate, endDate };
  });
}

// -----------------------------
// Managed user calendars
// -----------------------------
export async function saveManagedOriginalCalendar(managerId, managedUserId, calendar) {
  const record = await idbGet(managerId);

  // Overwrite the original calendar
  record.managedUsers[managedUserId].original = calendar;

  await idbPut(record);

  return record.managedUsers[managedUserId].original;
}

export async function createManagedCopy(managerId, managedUserId, copyName, startDate, endDate) {
  const record = await idbGet(managerId);

  // Check for existing copy
  if (record.managedUsers[managedUserId].copies[copyName]) {
    alert(`A copy named "${copyName}" already exists for this managed user`);
    return null;
  }

  const original = record.managedUsers[managedUserId].original;
  const filteredCells = original.cells.filter(c => c.date >= startDate && c.date <= endDate);

  // Create the copy
  record.managedUsers[managedUserId].copies[copyName] = {
    columns: [...original.columns],
    cells: filteredCells,
    dateRange: { startDate, endDate }
  };

  await idbPut(record);
  return record.managedUsers[managedUserId].copies[copyName];
}

export async function getManagedCalendar(managerId, managedUserId, copyName) {
  const record = await idbGet(managerId);
  return record.managedUsers[managedUserId].copies[copyName];
}

export async function updateManagedCalendarCell(managerId, managedUserId, copyName, date, column, value) {
  const record = await idbGet(managerId);
  const managedCopy = record.managedUsers[managedUserId].copies[copyName];

  const existing = managedCopy.cells.find(c => c.date === date && c.column === column);

  if (existing) {
    if (value === null || value === "") {
      const idx = managedCopy.cells.indexOf(existing);
      managedCopy.cells.splice(idx, 1);
    } else {
      existing.value = value;
    }
  } else if (value !== null && value !== "") {
    managedCopy.cells.push({ date, column, value });
  }

  await idbPut(record);
}

// -----------------------------
// Managed user calendar columns
// -----------------------------

export async function addManagedCopyColumn(managerId, managedUserId, copyName, columnName) {
  const record = await idbGet(managerId);
  const managedCopy = record.managedUsers[managedUserId].copies[copyName];

  if (!managedCopy.columns.includes(columnName)) {
    managedCopy.columns.push(columnName);
  }

  await idbPut(record);
  return managedCopy.columns;
}

export async function removeManagedCopyColumn(managerId, managedUserId, copyName, columnName) {
  const record = await idbGet(managerId);
  const managedCopy = record.managedUsers[managedUserId].copies[copyName];

  const idx = managedCopy.columns.indexOf(columnName);
   managedCopy.columns.splice(idx, 1);

  await idbPut(record);
  return managedCopy.columns;
}

export async function deleteManagedCopy(managerId, managedUserId, copyName) {
  const record = await idbGet(managerId);
  const managedUser = record.managedUsers[managedUserId];

  delete managedUser.copies[copyName];
  await idbPut(record);
}