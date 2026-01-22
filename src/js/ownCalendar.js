// ownCalendar.js — personal calendar logic

import {
  getSession,
  getOwnCalendar,
  updateOwnCalendar,
  saveOwnCalendarDateRange,
  saveOwnCalendarColumns,
  updateOwnCalendarCell
} from "./db.js";
import { apiGetUser, saveCalendar } from "./api.js";

/* ----------------- Constants ----------------- */

const FIXED_COLUMNS = ["Férias", "Extra 75", "Extra 100", "PE", "Total"];
const EXCLUDED_FROM_TOTAL = ["Extra 75", "Extra 100", "PE"];
const MONTHS_PT_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/* ----------------- Date helpers ----------------- */

function parseLocalDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayShort(dateStr) {
  const d = new Date(dateStr + "T00:00");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS_PT_SHORT[d.getMonth()]}`;
}

function generateDays(start, end) {
  const days = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/* ----------------- Init ----------------- */

export async function initOwnCalendar(container) {
  const session = await getSession();
  if (!session) return;

  if (!container.querySelector("#calendarMain")) {
    const res = await fetch("/src/html/ownCalendar.html");
    container.innerHTML = await res.text();
  }

  const calendar = await getOwnCalendar(session.userId);
  setupOwnCalendarUI(container, session.userId, calendar);
}

/* ----------------- UI Setup ----------------- */

function setupOwnCalendarUI(container, userId, calendar) {
  const startInput = container.querySelector("#startDate");
  const endInput = container.querySelector("#endDate");
  const addColumnBtn = container.querySelector("#addColumnBtn");

  const syncBtn = container.querySelector("#syncCalendarBtn");
  syncBtn.onclick = async () => {
    await syncOwnCalendar(userId);
  };

  const refreshBtn = container.querySelector("#refreshCalendarBtn");
  refreshBtn.onclick = async () => {
    const remote = (await apiGetUser(userId)).calendar;
    Object.assign(calendar, remote);
    renderOwnCalendar(container, userId, calendar);
    alert("Calendário atualizado com sucesso!");
  };

  const exportBtn = container.querySelector("#exportCalendarBtn");
  exportBtn.onclick = () => exportCalendar(calendar, userId);

  startInput.value = calendar.dateRange?.startDate || "";
  endInput.value = calendar.dateRange?.endDate || "";

  const today = new Date();
  const minSelectable = new Date(today);
  minSelectable.setDate(today.getDate() - 90); // 90 days ago
  const maxSelectable = new Date(today);
  maxSelectable.setDate(today.getDate() + 45); // 45 days in future

  startInput.min = minSelectable.toISOString().slice(0, 10);
  startInput.max = maxSelectable.toISOString().slice(0, 10);
  endInput.min = minSelectable.toISOString().slice(0, 10);
  endInput.max = maxSelectable.toISOString().slice(0, 10);

  renderOwnCalendar(container, userId, calendar);

  addColumnBtn.onclick = async () => {
    const name = prompt("Nome da nova coluna:");
    if (!name) return;
    calendar.columns ??= [];
    calendar.columns.push(name);
    await saveOwnCalendarColumns(userId, calendar.columns);
    renderOwnCalendar(container, userId, calendar);
  };

  [startInput, endInput].forEach((input) => {
    input.addEventListener("change", async () => {
      // update in-memory calendar object
      calendar.dateRange ??= {};
      calendar.dateRange[input.id === "startDate" ? "startDate" : "endDate"] = input.value;

      // persist immediately to IndexedDB
      await saveOwnCalendarDateRange(
        userId,
        calendar.dateRange.startDate,
        calendar.dateRange.endDate
      );

      // re-render the calendar with new date range
      renderOwnCalendar(container, userId, calendar);
    });
  });

}

/* ----------------- Rendering ----------------- */

function renderOwnCalendar(container, userId, calendar) {
  const startStr = container.querySelector("#startDate").value;
  const endStr = container.querySelector("#endDate").value;
  if (!startStr || !endStr) return;

  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);

  const days = generateDays(start, end);
  const customColumns = calendar.columns || [];
  const columns = [...customColumns, ...FIXED_COLUMNS];

  // Build a lookup for cell values
  const cellLookup = {}; // day -> column -> value
  (calendar.cells || []).forEach(({ date, column, value }) => {
    cellLookup[date] ??= {};
    cellLookup[date][column] = value;
  });

  const grid = container.querySelector("#calendarGrid");
  grid.innerHTML = "";

  const table = document.createElement("table");
  table.className = "calendar-table";

  /* -----------------------------
     Helper: update the totals row
  ----------------------------- */
  function updateTotalsRow() {
    const tfoot = table.querySelector("tfoot");
    if (!tfoot) return;

    const totals = {};
    columns.forEach(c => totals[c] = 0);

    days.forEach(day => {
      columns.forEach(col => {
        if (col === "Total") {
          let rowSum = 0;
          columns.forEach(c => {
            if (c === "Total" || EXCLUDED_FROM_TOTAL.includes(c)) return;
            rowSum += parseFloat(cellLookup[day]?.[c] || 0);
          });
          totals[col] += rowSum;
        } else {
          totals[col] += parseFloat(cellLookup[day]?.[col] || 0);
        }
      });
    });

    const trTotal = tfoot.querySelector("tr");
    columns.forEach((col, i) => {
      trTotal.children[i + 1].textContent = totals[col] || 0;
    });
  }

  /* ---- Header ---- */
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  hr.innerHTML = "<th>Data</th>";

  columns.forEach((col, idx) => {
    const th = document.createElement("th");
    th.textContent = col;

    if (idx < customColumns.length) {
      const btn = document.createElement("button");
      btn.textContent = "⋮";
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleColumnMenu(btn, th, idx, customColumns, userId, container, calendar);
      };
      th.appendChild(btn);
    }

    // Separator after last custom column
    if (idx === customColumns.length - 1) th.classList.add("custom-separator");

    hr.appendChild(th);
  });

  thead.appendChild(hr);
  table.appendChild(thead);

  /* ---- Body ---- */
  const tbody = document.createElement("tbody");

  // Object to hold column totals for initial render
  const columnTotals = {};
  columns.forEach(c => columnTotals[c] = 0);

  days.forEach((day) => {
    const tr = document.createElement("tr");

    // Weekend highlighting for entire row
    const d = new Date(day + "T00:00");
    if ([0, 6].includes(d.getDay())) tr.classList.add("weekend-row");

// First cell: date
const dateTd = document.createElement("td");
dateTd.textContent = formatDayShort(day);

const todayStr = new Date().toISOString().slice(0, 10);
if (day === todayStr) tr.classList.add("today"); // highlight entire row

tr.appendChild(dateTd);

    // Remaining columns
    columns.forEach((col, idx) => {
      const td = document.createElement("td");

      // Apply vertical separator for last custom column
      if (idx === customColumns.length - 1) td.classList.add("custom-separator-td");

      if (col === "Total") {
        // sum only columns not excluded and not "Total"
        let sum = 0;
        columns.forEach((c) => {
          if (c === "Total" || EXCLUDED_FROM_TOTAL.includes(c)) return;
          sum += parseFloat(cellLookup[day]?.[c] || 0);
        });
        td.textContent = sum;
        columnTotals[col] += sum;
        td.classList.add("total-column"); // mark totals column visually
      } else {
        const input = document.createElement("input");
        input.type = "number";
        input.value = cellLookup[day]?.[col] || "";
        columnTotals[col] += parseFloat(input.value) || 0;

        input.oninput = async () => {
          const value = input.value;
          cellLookup[day] ??= {};
          cellLookup[day][col] = value;

          // Update calendar.cells in memory
          let existing = calendar.cells.find(c => c.date === day && c.column === col);
          if (existing) {
            existing.value = value;
          } else {
            calendar.cells.push({ date: day, column: col, value });
          }

          // Save to IndexedDB
          await updateOwnCalendarCell(userId, day, col, value);

          // Update totals
          const trRow = input.parentElement.parentElement;
          const totalTd = trRow.querySelector("td:last-child");
          let sum = 0;
          columns.forEach(c => {
            if (c === "Total" || EXCLUDED_FROM_TOTAL.includes(c)) return;
            sum += parseFloat(cellLookup[day]?.[c] || 0);
          });
          totalTd.textContent = sum;

          updateTotalsRow();
        };

        td.appendChild(input);
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  /* ---- Footer: Totals Row ---- */
  const tfoot = document.createElement("tfoot");
  const trTotal = document.createElement("tr");
  trTotal.innerHTML = "<td>Total</td>";

  columns.forEach((col) => {
    const td = document.createElement("td");
    td.textContent = columnTotals[col] || 0;

    // Mark totals column visually
    if (col === "Total") td.classList.add("total-column");

    // Also add separator for last custom column in totals row
    if (columns.indexOf(col) === customColumns.length - 1) td.classList.add("custom-separator-td");

    trTotal.appendChild(td);
  });

  tfoot.appendChild(trTotal);
  table.appendChild(tfoot);

  grid.appendChild(table);
}


/* ----------------- Column Menu ----------------- */

function toggleColumnMenu(button, th, idx, columns, userId, container, calendar) {
  // Close existing menus first
  document.querySelectorAll(".column-menu").forEach((m) => m.remove());

  const menu = document.createElement("div");
  menu.className = "column-menu";

  const actions = [
    ["Mover esquerda", () => idx > 0 && swap(columns, idx, idx - 1)],
    ["Mover direita", () => idx < columns.length - 1 && swap(columns, idx, idx + 1)],
    ["Eliminar", () => columns.splice(idx, 1)]
  ];

  actions.forEach(([label, fn]) => {
    const item = document.createElement("div");
    item.textContent = label;

    item.onclick = async (e) => {
      e.stopPropagation(); // prevent global listener from closing too early
      fn();
      await saveOwnCalendarColumns(userId, columns);
      renderOwnCalendar(container, userId, calendar);

      // Close the menu after the action runs
      closeMenu();
    };

    menu.appendChild(item);
  });

  // Append menu to body
  document.body.appendChild(menu);

  // Position menu below the button
  const btnRect = button.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${btnRect.bottom + 4}px`;
  menu.style.left = `${btnRect.left}px`;

  // Function to close menu and cleanup listeners
  function closeMenu() {
    menu.remove();
    document.removeEventListener("mousedown", handleGlobalClick);
    document.removeEventListener("touchstart", handleGlobalClick);
    document.removeEventListener("dragstart", handleGlobalClick);
  }

  // Only close if click/touch/drag is outside menu or the button
  function handleGlobalClick(e) {
    if (!menu.contains(e.target) && e.target !== button) {
      closeMenu();
    }
  }

  // Add global listeners
  document.addEventListener("mousedown", handleGlobalClick);
  document.addEventListener("touchstart", handleGlobalClick);
  document.addEventListener("dragstart", handleGlobalClick);
}

function swap(arr, a, b) {
  [arr[a], arr[b]] = [arr[b], arr[a]];
}

/* ----------------- Export ----------------- */

async function exportCalendar(calendar, userId) {
  if (!window.ExcelJS) {
    alert("ExcelJS não carregado!");
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(userId);

    const customCols = calendar.columns || [];
    const FIXED_COLUMNS = ["Férias", "Extra 75", "Extra 100", "PE", "Total"];
    const allColumns = ["Data", ...customCols, ...FIXED_COLUMNS];
    const lastColIndex = allColumns.length;

    // Helper: 1-based index → Excel column letter
    const getExcelColLetter = (colIndex) => {
      let dividend = colIndex;
      let columnName = '';
      let modulo;
      while (dividend > 0) {
        modulo = (dividend - 1) % 26;
        columnName = String.fromCharCode(65 + modulo) + columnName;
        dividend = Math.floor((dividend - modulo) / 26);
      }
      return columnName;
    };

    // Set Excel columns
    sheet.columns = allColumns.map(col => ({ header: col, key: col, width: 15 }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      cell.alignment = { horizontal: "center" };
    });

    // Prepare cell lookup
    const cellLookup = {};
    (calendar.cells || []).forEach(({ date, column, value }) => {
      cellLookup[date] ??= {};
      cellLookup[date][column] = value;
    });

    // Generate date range
    const start = new Date(calendar.dateRange?.startDate || new Date());
    const end = new Date(calendar.dateRange?.endDate || new Date());
    const days = [];
    const current = new Date(start);
    while (current <= end) {
      days.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    // Fill rows
    days.forEach((day, rowIndex) => {
      const rowValues = [day];
      const excelRow = rowIndex + 2; // +2 because header is row 1

      allColumns.slice(1).forEach((col, colIndex) => {
        const excelCol = colIndex + 2; // B=2

        if (col === "Total") {
          // Row total formula: exclude Extra columns and Total itself
          const includedCols = allColumns.slice(1, -4).map((_, idx) => getExcelColLetter(idx + 2));
          rowValues.push({ formula: `SUM(${includedCols.map(c => `${c}${excelRow}`).join(",")})` });
        } else {
          const val = cellLookup[day]?.[col];
          rowValues.push(val !== undefined && val !== "" ? Number(val) : null);
        }
      });

      const row = sheet.addRow(rowValues);

      // Style cells
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.alignment = { horizontal: "center" };

        // Fill weekend rows
        const d = new Date(day + "T00:00");
        if ([0, 6].includes(d.getDay())) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
        }

        // Fill Total column
        if (colNumber === lastColIndex) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
        }
      });
    });

    // Add totals row at bottom
    const lastDataRow = sheet.rowCount;
    const totalRowValues = ["Total"];

    allColumns.slice(1).forEach((col, colIndex) => {
      const colLetter = getExcelColLetter(colIndex + 2);
      // Sum all rows for this column
      totalRowValues.push({ formula: `SUM(${colLetter}2:${colLetter}${lastDataRow})` });
    });

    const totalRow = sheet.addRow(totalRowValues);
    totalRow.font = { bold: true };
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1D5DB" } };
    });

    // Apply borders to all used cells
    sheet.eachRow(row => {
      row.eachCell({ includeEmpty: false }, cell => {
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      });
    });

    // Export Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendario.xlsx";
    a.click();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error("Erro ao exportar Excel:", err);
    alert("Erro ao exportar Excel: " + err.message);
  }
}

export async function syncOwnCalendar(userId) {
  const syncBtn = document.querySelector("#syncCalendarBtn");
  if (!syncBtn) return;

  syncBtn.disabled = true;

  try {
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() - 90); // 90 days ago
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 10); // 10 days in future

    // Trim cells permanently in IndexedDB
    await updateOwnCalendar(userId, (calendar) => {
      calendar.cells = (calendar.cells || []).filter(({ date }) => {
        const d = new Date(date + "T00:00");
        return d >= minDate && d <= maxDate;
      });
    });

    // Now fetch the trimmed calendar (optional, for sending)
    const calendar = await getOwnCalendar(userId);

    // Send trimmed calendar to the server
    await saveCalendar(userId);

    alert("Calendário sincronizado com sucesso!");
  } catch (err) {
    console.error("Erro ao sincronizar calendário:", err);
    alert("Erro ao sincronizar calendário: " + err.message);
  }
}