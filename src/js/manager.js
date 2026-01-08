// manager.js — manager calendar logic
import { getSession, getUserRecord, saveCalendarLocal } from "./db.js";
import { getManagerSnapshot } from "./api.js";
import { loadCalendarShell, renderCalendarMain, exportCalendar, mergeCalendars } from "./common.js";

export async function initManagerCalendar(container) {
  await loadCalendarShell(container);

  const session = await getSession();
  if (!session) return;

  let managerRecord;

  const tabs = container.querySelector("#calendarTabs");
  if (!tabs) return;
  tabs.hidden = false;

  const actionsFooter = container.querySelector("#calendarActions");
  if (!actionsFooter) return;
  actionsFooter.hidden = false;

  // ---------- attach button logic ----------
  function setupManagerUI() {
    const saveBtn = container.querySelector("#saveChanges");
    const refreshBtn = container.querySelector("#refreshCalendarBtn");
    const exportBtn = container.querySelector("#exportCalendarBtn");

    if (!saveBtn || !refreshBtn || !exportBtn) return;

    const localCalendar = managerRecord.calendar;

    saveBtn.addEventListener("click", () => {
      alert("Guardar alterações (a implementar para manager)");
    });

    // Refresh currently visible calendar
    refreshBtn.addEventListener("click", async () => {
      try {
        const currentTabBtn = tabs.querySelector("button.active");
        const userIdToRender = currentTabBtn?.dataset.userId || session.userId;

        // Fetch latest snapshot
        const snapshot = await getManagerSnapshot();

        // Merge manager's own calendar
        const mergedManagerCalendar = mergeCalendars(managerRecord.calendar, snapshot.manager.calendar);

        // Persist merged + overwrite managed users
        const managedUsers = {};
        for (const user of snapshot.users) {
          managedUsers[user.userId] = user.calendar || {};
        }

        await saveCalendarLocal(session.userId, {
          calendar: mergedManagerCalendar,
          managedUsers
        });

        // Reload managerRecord from IndexedDB
        managerRecord = await getUserRecord(session.userId);

        // Re-render all tabs (so any new managed users appear)
        renderTabs();

        // Render currently selected tab
        const calendarToRender =
          userIdToRender === session.userId
            ? managerRecord.calendar
            : managerRecord.managedUsers?.[userIdToRender] || {};

        renderCalendarMain(container, userIdToRender, calendarToRender, { showExport: true });
      } catch (err) {
        alert("Erro ao atualizar calendário.");
        console.error("[MANAGER] Failed to refresh calendar:", err);
      }
    });

    exportBtn.addEventListener("click", () => {
      exportCalendar(container, session.userId, localCalendar);
    });
  }

  // ---------- load from IndexedDB ----------
  async function loadFromIndexedDB() {
    managerRecord = await getUserRecord(session.userId);
    renderTabs();

    // Default render: manager's own calendar
    renderCalendarMain(container, session.userId, managerRecord.calendar, { showExport: true });

    setupManagerUI();
  }

  // ---------- render tabs ----------
  function renderTabs() {
    if (!managerRecord) return;

    tabs.innerHTML = "";

    // Manager tab first
    const managerBtn = document.createElement("button");
    managerBtn.type = "button";
    managerBtn.textContent = session.userId;
    managerBtn.dataset.userId = session.userId;
    managerBtn.classList.add("active"); // default selected
    tabs.appendChild(managerBtn);

    // Managed users
    if (managerRecord.managedUsers) {
      for (const [uid] of Object.entries(managerRecord.managedUsers)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = uid;
        btn.dataset.userId = uid;
        tabs.appendChild(btn);
      }
    }

    // Attach click listener
    tabs.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const uid = btn.dataset.userId;
        const cal = uid === session.userId
          ? managerRecord.calendar
          : managerRecord.managedUsers?.[uid] || {};

        renderCalendarMain(container, uid, cal, { showExport: true });
      });
    });
  }

  // ---------- refresh users snapshot button ----------
  const refreshUsersBtn = document.createElement("button");
  refreshUsersBtn.textContent = "🔄";
  refreshUsersBtn.title = "Atualizar utilizadores";
  refreshUsersBtn.addEventListener("click", async () => {
    try {
      const snapshot = await getManagerSnapshot();
      const mergedManagerCalendar = mergeCalendars(managerRecord.calendar, snapshot.manager.calendar);

      const managedUsers = {};
      for (const user of snapshot.users) {
        managedUsers[user.userId] = user.calendar || {};
      }

      await saveCalendarLocal(session.userId, {
        calendar: mergedManagerCalendar,
        managedUsers
      });

      await loadFromIndexedDB();
    } catch (err) {
      alert("Erro ao atualizar snapshot online.");
    }
  });
  tabs.appendChild(refreshUsersBtn);

  // Initial load
  await loadFromIndexedDB();
}
