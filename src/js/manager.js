// manager.js — manager calendar logic (cleaned & fixed)
import { getSession, getUserRecord, saveCalendarLocal, getCalendarLocal } from "./db.js";
import { getManagerSnapshot } from "./api.js";
import { loadCalendarShell, renderCalendarMain, exportCalendar, mergeCalendars } from "./common.js";

export async function initManagerCalendar(container) {
    console.log("[DEBUG] Initializing manager calendar...");
    await loadCalendarShell(container);

    const session = await getSession();
    if (!session) {
        console.log("[DEBUG] No session found.");
        return;
    }

    let managerRecord;

    const tabs = container.querySelector("#calendarTabs");
    if (!tabs) return;
    tabs.hidden = false;

    const actionsFooter = container.querySelector("#calendarActions");
    if (!actionsFooter) return;
    actionsFooter.hidden = false;

    const versionsContainer = container.querySelector("#calendarVersions");
    if (!versionsContainer) {
        console.error("[DEBUG] #calendarVersions not found in HTML!");
        return;
    }
    console.log("[DEBUG] Using existing versionsContainer:", versionsContainer);

    // ---------- Setup manager UI buttons ----------
    function setupManagerUI() {
        console.log("[DEBUG] Setting up manager UI buttons...");

        const saveBtn = container.querySelector("#saveChanges");
        const refreshBtn = container.querySelector("#refreshCalendarBtn");
        const exportBtn = container.querySelector("#exportCalendarBtn");
        const createCopyBtn = versionsContainer.querySelector("#createCopyBtn");

        if (!saveBtn || !refreshBtn || !exportBtn || !createCopyBtn) {
            console.warn("[DEBUG] Some action buttons not found!");
            return;
        }

        // Version switching buttons
        const versionButtons = versionsContainer.querySelectorAll("button[data-version]");
        versionButtons.forEach(btn => {
            btn.addEventListener("click", async () => {
                const currentTab = tabs.querySelector("button.active");
                const uid = currentTab?.dataset.userId;
                console.log("[DEBUG] Switching version for user:", uid, "to:", btn.dataset.version);
                if (!uid || uid === session.userId) return;
                renderCalendarForTab(uid, btn.dataset.version);
            });
        });

        // Create copy button
        createCopyBtn.addEventListener("click", async () => {
            const currentTab = tabs.querySelector("button.active");
            const userId = currentTab?.dataset.userId;
            if (!userId || userId === session.userId) return;

            console.log("[DEBUG] Create copy clicked for user:", userId);
            const original = managerRecord.managedUsers?.[userId] || {};
            await saveCalendarLocal(`copy-${userId}`, { calendar: structuredClone(original) });

            renderCalendarForTab(userId, "copy");
        });

        // Save button
        saveBtn.addEventListener("click", async () => {
            const currentTab = tabs.querySelector("button.active");
            const userId = currentTab?.dataset.userId || session.userId;
            console.log("[DEBUG] Save clicked for user:", userId);

            if (userId !== session.userId) {
                const copy = await getCalendarLocal(`copy-${userId}`);
                if (copy) {
                    await saveCalendarLocal(`copy-${userId}`, { calendar: copy });
                    alert("Copy saved locally");
                }
            }
        });

        // Refresh button
        refreshBtn.addEventListener("click", async () => {
            const currentTab = tabs.querySelector("button.active");
            const userId = currentTab?.dataset.userId || session.userId;
            console.log("[DEBUG] Refresh clicked for user:", userId);

            const snapshot = await getManagerSnapshot();
            const mergedCalendar = mergeCalendars(managerRecord.calendar, snapshot.manager.calendar);

            const managedUsers = {};
            for (const u of snapshot.users) managedUsers[u.userId] = u.calendar || {};

            await saveCalendarLocal(session.userId, { calendar: mergedCalendar, managedUsers });
            managerRecord = await getUserRecord(session.userId);

            renderTabs();
            renderCalendarForTab(userId);
        });

        // Export button
        exportBtn.addEventListener("click", async () => {
            const currentTab = tabs.querySelector("button.active");
            const userId = currentTab?.dataset.userId || session.userId;
            console.log("[DEBUG] Export clicked for user:", userId);

            const copy = await getCalendarLocal(`copy-${userId}`);
            const calendarToExport = copy || (userId === session.userId ? managerRecord.calendar : managerRecord.managedUsers?.[userId] || {});
            exportCalendar(container, userId, calendarToExport);
        });
    }

    // ---------- Load manager record ----------
    async function loadFromIndexedDB() {
        console.log("[DEBUG] Loading manager record from IndexedDB...");
        managerRecord = await getUserRecord(session.userId);
        renderTabs();
        renderCalendarForTab(session.userId);
        setupManagerUI();
    }

    // ---------- Render user tabs ----------
    function renderTabs() {
        tabs.innerHTML = "";

        // Manager tab
        const mgrBtn = document.createElement("button");
        mgrBtn.type = "button";
        mgrBtn.textContent = session.userId;
        mgrBtn.dataset.userId = session.userId;
        mgrBtn.classList.add("active");
        tabs.appendChild(mgrBtn);

        // Managed user tabs
        if (managerRecord.managedUsers) {
            for (const uid of Object.keys(managerRecord.managedUsers)) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = uid;
                btn.dataset.userId = uid;
                tabs.appendChild(btn);
            }
        }

        tabs.querySelectorAll("button").forEach(btn => {
            btn.addEventListener("click", () => {
                tabs.querySelectorAll("button").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                console.log("[DEBUG] Tab selected:", btn.dataset.userId);
                renderCalendarForTab(btn.dataset.userId);
            });
        });
    }

    // ---------- Render calendar for a tab ----------
    async function renderCalendarForTab(userId, version = "original") {
        console.log("[DEBUG] Rendering calendar for:", userId, "version:", version);

        let calendar;
        if (userId === session.userId) {
            versionsContainer.hidden = true;
            calendar = managerRecord.calendar;
        } else {
            versionsContainer.hidden = false;
            calendar = version === "copy"
                ? (await getCalendarLocal(`copy-${userId}`))?.calendar || {}
                : managerRecord.managedUsers[userId] || {};
        }

        // Editable: manager own or managed copies
        const isEditable = (userId === session.userId) || (version === "copy");

        renderCalendarMain(container, userId, calendar, { editable: isEditable });

        // Highlight version buttons
        versionsContainer.querySelectorAll("button[data-version]").forEach(b => b.classList.remove("active"));
        const versionBtn = versionsContainer.querySelector(`[data-version="${version}"]`);
        if (versionBtn) versionBtn.classList.add("active");

        console.log("[DEBUG] Versions container visible:", !versionsContainer.hidden);
    }

    // ---------- Refresh all users snapshot button ----------
    const refreshUsersBtn = document.createElement("button");
    refreshUsersBtn.textContent = "🔄";
    refreshUsersBtn.title = "Atualizar utilizadores";
    refreshUsersBtn.addEventListener("click", async () => {
        console.log("[DEBUG] Refresh users snapshot clicked");
        const snapshot = await getManagerSnapshot();
        const mergedCalendar = mergeCalendars(managerRecord.calendar, snapshot.manager.calendar);

        const managedUsers = {};
        for (const u of snapshot.users) managedUsers[u.userId] = u.calendar || {};

        await saveCalendarLocal(session.userId, { calendar: mergedCalendar, managedUsers });
        await loadFromIndexedDB();
    });
    tabs.appendChild(refreshUsersBtn);

    // ---------- Initial load ----------
    await loadFromIndexedDB();
    console.log("[DEBUG] Manager calendar initialization complete.");
}
