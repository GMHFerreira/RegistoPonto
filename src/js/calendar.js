// -----------------------------
// calendar.js — calendar shell loader with dynamic user tabs
// -----------------------------

import { checkRateLimit, commitRateLimit, getSession, getCalendarLocal, saveCalendarLocal, getUserRecord } from "./db.js";
import { apiGetUser, getManagerSnapshot } from "./api.js";

/**
 * Load calendar.html into the container
 */
async function loadCalendarShell(container) {
  const res = await fetch("/src/html/calendar.html");
  if (!res.ok) throw new Error("Failed to load calendar.html");

  container.innerHTML = await res.text();
}

/**
 * User-specific UI (footer actions)
 */
function setupUserUI() {
  const actions = document.getElementById("calendarActions");
  if (!actions) return;

  actions.hidden = false;

  actions.innerHTML = `
    <button type="button" id="saveChanges">
      Guardar Alterações
    </button>
    <button type="button" id="refreshCalendarBtn" title="Atualizar calendário">
      &#x21bb;
    </button>
  `;

  document.getElementById("saveChanges").addEventListener("click", () => {
    alert("Guardar Alterações (a implementar)");
  });

document.getElementById("refreshCalendarBtn").addEventListener("click", async () => {
  try {
    const rl = await checkRateLimit("refreshCalendar", 60000);
    if (!rl.allowed) {
      const secondsLeft = Math.ceil(rl.remainingMs / 1000);
      alert(`Ação demasiado rápida. Tente novamente em ${secondsLeft} segundos.`);
      return;
    }
    const session = await getSession();
    if (session.role === "manager") {
      const snapshot = await getManagerSnapshot();

      // Persist all calendars with debug logs
      await persistManagerSnapshot(snapshot);

      // Reload tabs and render manager
      renderTabs(snapshot);
      renderCalendarMain(snapshot.manager.userId, snapshot.manager.calendar);

    } else {
      const localCalendar = await getCalendarLocal(session.userId);
      renderCalendarMain(session.userId, localCalendar);

      const userData = await apiGetUser(session.userId);
      const remoteCalendar = userData.calendar || {};
      const mergedCalendar = mergeCalendars(localCalendar, remoteCalendar);

      await saveCalendarLocal(session.userId, mergedCalendar);
      renderCalendarMain(session.userId, mergedCalendar);
    }

    await commitRateLimit("refreshCalendar");

  } catch (err) {
    console.error("[ERROR] Failed to refresh calendar:", err);
    alert("Erro ao atualizar calendário.");
  }
});
}

/**
 * Manager-specific UI
 */
export async function setupManagerUI() {
  const tabs = document.getElementById("calendarTabs");
  if (!tabs) {
    return;
  }

  tabs.hidden = false;
  tabs.innerHTML = "";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.id = "refreshUsersBtn";
  refreshBtn.title = "Atualizar utilizadores";
  refreshBtn.innerHTML = "&#x21bb;";
  tabs.appendChild(refreshBtn);

  let managerRecord;

  async function loadFromIndexedDB() {
    const session = await getSession();
    if (!session) {
      return;
    }

    // ✅ Load full record including managedUsers
    managerRecord = await getUserRecord(session.userId);

    // Build all users list
    const allUsers = [{ userId: session.userId, calendar: managerRecord.calendar }];

    if (managerRecord.managedUsers) {
      for (const [uid, cal] of Object.entries(managerRecord.managedUsers)) {
        allUsers.push({ userId: uid, calendar: cal });
      }
    }

    renderTabs(allUsers);
    renderCalendarMain(session.userId, managerRecord.calendar);
  }


  async function renderTabs(allUsers) {
    tabs.innerHTML = "";

    for (const user of allUsers) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = user.userId;
      btn.dataset.userId = user.userId;
      tabs.appendChild(btn);
    }

    tabs.appendChild(refreshBtn);

    // Tab click listener
    tabs.addEventListener("click", async e => {
      const btn = e.target.closest("button");
      if (!btn || btn.id === "refreshUsersBtn") return;

      const userId = btn.dataset.userId;

      let calendar;
      if (userId === managerRecord.userId) {
        calendar = managerRecord.calendar;
      } else {
        calendar = managerRecord.managedUsers?.[userId] || {};
      }
      renderCalendarMain(userId, calendar);
    });
  }

  // Manual refresh button only
  refreshBtn.addEventListener("click", async () => {
    try {
      const snapshot = await getManagerSnapshot();
      await persistManagerSnapshot(snapshot);
      loadFromIndexedDB();
    } catch (err) {
      console.error("[ERROR] Failed to fetch snapshot online:", err);
      alert("Erro ao atualizar snapshot online.");
    }
  });

  // Initial load from IndexedDB
  await loadFromIndexedDB();
}

/**
 * Public entry point
 */
export async function renderCalendarView(container, role) {
  await loadCalendarShell(container);

  // ✅ AUTO-LOAD cached calendar on view entry
  const session = await getSession();
  if (session) {
    const localCalendar = await getCalendarLocal(session.userId);
    renderCalendarMain(session.userId, localCalendar);
  }

  // Then wire UI
  if (role === "manager") {
    setupManagerUI();
  } else {
    setupUserUI();
  }
}

/**
 * Render main calendar area
 */
async function renderCalendarMain(userId, calendar) {
  const main = document.getElementById("calendarMain");
  if (!main) return;

  main.innerHTML = `<h3>${userId}</h3>`;

  if (!calendar || Object.keys(calendar).length === 0) {
    main.innerHTML += "<p>Sem dados.</p>";
    return;
  }

  const ul = document.createElement("ul");
  for (const [week, events] of Object.entries(calendar)) {
    const li = document.createElement("li");
    li.textContent = `${week}: ${JSON.stringify(events)}`;
    ul.appendChild(li);
  }
  main.appendChild(ul);

  // Optional: Manager can export local copy
  const session = await getSession();
  if (session.role === "manager") {
    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Exportar calendário selecionado";
    exportBtn.addEventListener("click", () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(calendar));
      const a = document.createElement("a");
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `calendar-${userId}.json`);
      a.click();
    });
    main.appendChild(exportBtn);
  }
}

/**
 * Deep merge calendars:
 * localCalendar ALWAYS wins conflicts
 *
 * Structure assumed:
 * calendar[day][sector] = value
 */
async function persistManagerSnapshot(snapshot) {
  const managedUsers = {};
  for (const user of snapshot.users) {
    managedUsers[user.userId] = user.calendar || {};
  }

  // Save using new structure
  await saveCalendarLocal(snapshot.manager.userId, {
    calendar: snapshot.manager.calendar,
    managedUsers
  });
}

/**
 * Deep merge calendars:
 * localCalendar ALWAYS wins conflicts
 *
 * Structure assumed:
 * calendar[day][sector] = value
 */
function mergeCalendars(localCalendar = {}, remoteCalendar = {}) {
  const merged = structuredClone(remoteCalendar);

  for (const [day, localSectors] of Object.entries(localCalendar)) {
    if (!merged[day]) {
      merged[day] = localSectors;
      continue;
    }

    for (const [sector, localValue] of Object.entries(localSectors)) {
      merged[day][sector] = localValue;
    }
  }

  return merged;
}