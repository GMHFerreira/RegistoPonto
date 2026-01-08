export async function loadCalendarShell(container) {
  const res = await fetch("/src/html/calendar.html");
  if (!res.ok) throw new Error("Failed to load calendar.html");
  container.innerHTML = await res.text();
}

export function mergeCalendars(localCalendar = {}, remoteCalendar = {}) {
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

export async function renderCalendarMain(container, userId, calendar, options = {}) {
  const main = container.querySelector("#calendarMain");
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

  if (options.showExport) {
    exportCalendar(calendar, userId, main);
  }
}

export function exportCalendar(calendar, userId, container) {
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Exportar calendário selecionado";
  exportBtn.addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(calendar));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `calendar-${userId}.json`);
    a.click();
  });
  container.appendChild(exportBtn);
}
