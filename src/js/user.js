// user.js — user calendar logic with auto-save and date range persistence
import {
  getSession,
  getCalendarLocal,
  saveCalendarLocal,
  checkRateLimit,
  commitRateLimit
} from "./db.js";
import { apiGetUser } from "./api.js";
import { renderCalendarMain, mergeCalendars, exportCalendar } from "./common.js";

export async function initUserCalendar(container) {
  const session = await getSession();
  if (!session) return;

  // Inject user.html if container is empty or missing main structure
  if (!container.querySelector("#calendarMain")) {
    try {
      const res = await fetch("/src/html/user.html");
      if (!res.ok) throw new Error("Failed to load user.html");
      container.innerHTML = await res.text();
    } catch (err) {
      console.error("[USER] Failed to inject user HTML:", err);
      container.innerHTML = "<p>Erro ao carregar o calendário do utilizador.</p>";
      return;
    }
  }

  // Load local calendar + date range from IndexedDB
  const record = await getCalendarLocal(session.userId);
  const localCalendar = record?.calendar || {};

  let startDate = record?.startDate ? new Date(record.startDate) : undefined;
  let endDate = record?.endDate ? new Date(record.endDate) : undefined;

  // Validate dates
  if (startDate && isNaN(startDate)) startDate = undefined;
  if (endDate && isNaN(endDate)) endDate = undefined;

  // Render calendar with stored range
  renderCalendarMain(container, session.userId, localCalendar, {
    editable: true,
    startDate,
    endDate
  });

  // Set input fields after render
  const startInput = container.querySelector("#startDate");
  const endInput = container.querySelector("#endDate");
  if (startInput && startDate) startInput.value = startDate.toISOString().slice(0, 10);
  if (endInput && endDate) endInput.value = endDate.toISOString().slice(0, 10);

  // Setup UI interactions
  setupUserUI(container, session.userId, localCalendar);
}

/**
 * Setup event listeners for user actions and auto-save.
 */
function setupUserUI(container, userId, calendar) {
  const saveBtn = container.querySelector("#saveChanges");
  const refreshBtn = container.querySelector("#refreshCalendarBtn");
  const exportBtn = container.querySelector("#exportCalendarBtn");
  const startInput = container.querySelector("#startDate");
  const endInput = container.querySelector("#endDate");
  const applyBtn = container.querySelector("#applyDateRange");

  if (!saveBtn || !refreshBtn || !exportBtn || !startInput || !endInput || !applyBtn) return;

  // --- Manual save ---
  saveBtn.addEventListener("click", async () => {
    try {
      await saveCalendarLocal(userId, {
        calendar,
        startDate: startInput.value,
        endDate: endInput.value
      });
      alert("Calendário guardado localmente.");
    } catch (err) {
      console.error("[USER] Failed to save calendar:", err);
      alert("Erro ao guardar o calendário.");
    }
  });

  // --- Refresh calendar from API ---
  refreshBtn.addEventListener("click", async () => {
    try {
      const rl = await checkRateLimit("refreshCalendar", 60000);
      if (!rl.allowed) {
        alert(`Ação demasiado rápida. Tente novamente em ${Math.ceil(rl.remainingMs / 1000)}s.`);
        return;
      }

      const local = (await getCalendarLocal(userId))?.calendar || {};
      const remote = (await apiGetUser(userId))?.calendar || {};
      const merged = mergeCalendars(local, remote);

      await saveCalendarLocal(userId, {
        calendar: merged,
        startDate: startInput.value,
        endDate: endInput.value
      });

      renderCalendarMain(container, userId, merged, {
        editable: true,
        startDate: new Date(startInput.value),
        endDate: new Date(endInput.value)
      });

      calendar = merged;
      await commitRateLimit("refreshCalendar");
    } catch (err) {
      console.error("[USER] Failed to refresh calendar:", err);
      alert("Erro ao atualizar calendário.");
    }
  });

  // --- Export calendar ---
  exportBtn.addEventListener("click", () => {
    exportCalendar(container, userId, calendar);
  });

  // --- Apply date range ---
  applyBtn.addEventListener("click", async () => {
    let startDate = new Date(startInput.value);
    let endDate = new Date(endInput.value);

    if (startDate > endDate) {
      alert("A data inicial deve ser anterior à data final.");
      return;
    }

    // Save only the date range along with current calendar
    await saveCalendarLocal(userId, {
      calendar,
      startDate: startInput.value,
      endDate: endInput.value
    });

    renderCalendarMain(container, userId, calendar, {
      editable: true,
      startDate,
      endDate
    });
  });

  // --- Auto-save on any input in the calendar table ---
  container.addEventListener("input", async (e) => {
    if (e.target.tagName !== "INPUT") return;

    const inputs = container.querySelectorAll("table.calendar-table input");
    inputs.forEach(input => {
      const td = input.closest("td");
      const tr = td.closest("tr");
      const date = tr.querySelector("td:first-child").textContent;
      const colIndex = Array.from(tr.children).indexOf(td) - 1;
      const colName = calendar[date] ? Object.keys(calendar[date])[colIndex] : null;
      if (colName) {
        if (!calendar[date]) calendar[date] = {};
        calendar[date][colName] = input.value;
      }
    });

    try {
      await saveCalendarLocal(userId, {
        calendar,
        startDate: startInput.value,
        endDate: endInput.value
      });
    } catch (err) {
      console.error("[AUTO-SAVE] Failed to persist calendar:", err);
    }
  });
}
