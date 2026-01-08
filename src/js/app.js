// -----------------------------
// app.js — main controller (refactored for user/manager split)
// -----------------------------

import { getSession, logout } from './db.js';
import { renderLoginView } from './login.js';

const mainContainer = document.getElementById("appMain");

// -----------------------------
// QR Modal
// -----------------------------
const qrButton = document.getElementById("qrButton");
const closeQrButton = document.getElementById("closeQrButton");
const qrModal = document.getElementById("qrModal");

qrButton.addEventListener("click", () => qrModal.classList.remove("hidden"));
closeQrButton.addEventListener("click", () => qrModal.classList.add("hidden"));
qrModal.addEventListener("click", (e) => {
  if (e.target === qrModal) qrModal.classList.add("hidden");
});

// -----------------------------
// PWA Install Prompt (Android)
// -----------------------------
let deferredPrompt;
const installButton = document.getElementById("installButton");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installButton.style.display = "inline-flex"; // show install button
});

installButton.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installButton.style.display = "none";
});

// -----------------------------
// Dynamic View Loader
// -----------------------------
export function switchView(viewFunc, ...args) {
  viewFunc(mainContainer, ...args);
}

// -----------------------------
// Load initial view on DOM ready
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();

  if (!session) {
    const { renderLoginView } = await import('./login.js');
    renderLoginView(mainContainer);
    return;
  }

  // Dynamically import and initialize the correct role module
  if (session.role === 'manager') {
    const { initManagerCalendar } = await import('./manager.js');
    await initManagerCalendar(mainContainer);
  } else {
    const { initUserCalendar } = await import('./user.js');
    await initUserCalendar(mainContainer);
  }

  setupGlobalLogout();
});

// -----------------------------
// Service Worker registration
// -----------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("../sw.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.error("Service Worker registration failed:", err));
  });
}

// -----------------------------
// Global logout setup
// -----------------------------
function setupGlobalLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.hidden = false; // always show once a user is logged in

  // Remove any old listeners to prevent double-binding
  const newLogoutBtn = logoutBtn.cloneNode(true);
  logoutBtn.replaceWith(newLogoutBtn);

  newLogoutBtn.addEventListener("click", () => {
    logout();                     // clear active session
    switchView(renderLoginView);  // return to login
  });
}
