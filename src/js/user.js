// user.js — user calendar logic
import { getSession, getCalendarLocal, saveCalendarLocal, checkRateLimit, commitRateLimit } from "./db.js";
import { apiGetUser } from "./api.js";
import { loadCalendarShell, renderCalendarMain, mergeCalendars, exportCalendar } from "./common.js";

export async function initUserCalendar(container) {
  await loadCalendarShell(container);

  const session = await getSession();
  if (!session) return;

  const localCalendar = await getCalendarLocal(session.userId);
  renderCalendarMain(container, session.userId, localCalendar);

  setupUserUI(container, session.userId, localCalendar);
}

function setupUserUI(container, userId, localCalendar) {
  const saveBtn = container.querySelector("#saveChanges");
  const refreshBtn = container.querySelector("#refreshCalendarBtn");
  const exportBtn = container.querySelector("#exportCalendarBtn");

  if (!saveBtn || !refreshBtn || !exportBtn) return;

  // Save button
  saveBtn.addEventListener("click", () => {
    alert("Guardar alterações (a implementar)");
  });

  // Refresh button
  refreshBtn.addEventListener("click", async () => {
    try {
      const rl = await checkRateLimit("refreshCalendar", 60000);
      if (!rl.allowed) {
        alert(`Ação demasiado rápida. Tente novamente em ${Math.ceil(rl.remainingMs / 1000)} segundos.`);
        return;
      }

      const local = await getCalendarLocal(userId);
      const userData = await apiGetUser(userId);
      const remote = userData.calendar || {};
      const merged = mergeCalendars(local, remote);

      await saveCalendarLocal(userId, { calendar: merged });
      renderCalendarMain(container, userId, merged);

      await commitRateLimit("refreshCalendar");
    } catch (err) {
      alert("Erro ao atualizar calendário.");
      console.error("[USER] Failed to refresh calendar:", err);
    }
  });

  // Export button
  exportBtn.addEventListener("click", () => {
    exportCalendar(container, userId, localCalendar);
  });
}
