// -----------------------------
// app.js — main controller
// -----------------------------

import { getSession, logout } from './db.js';
import { renderLoginView } from './login.js';

const mainContainer = document.getElementById("appMain");
const toggleBtn = document.getElementById("toggleManagerViewBtn");

document.addEventListener('DOMContentLoaded', async () => {
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
  // PWA Install Handling
  // -----------------------------
  let deferredPrompt;
  const installButton = document.getElementById("installButton");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      return;
    }

    alert(
      "Se a aplicação ainda não estiver instalada:\n" +
      "• Android/Chrome: use o botão 'Instalar' do navegador ou o menu → 'Adicionar à tela inicial'\n" +
      "• iPhone: use 'Adicionar ao ecrã principal'\n\n" +
      "Se já estiver instalada, não é necessária qualquer ação."
    );
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    alert("A aplicação foi instalada com sucesso.");
  });

  // -----------------------------
  // Dynamic view loaders
  // -----------------------------
  async function loadOwnCalendar() {
    const { initOwnCalendar } = await import('./ownCalendar.js');
    await initOwnCalendar(mainContainer);
  }

  async function loadManagerDashboard() {
    const { initManagerDashboard } = await import('./managerDashboard.js');
    await initManagerDashboard(mainContainer);
  }

  // -----------------------------
  // Load initial view
  // -----------------------------
  const session = await getSession();

  if (!session) {
    renderLoginView(mainContainer);
    toggleBtn?.classList.add('hidden'); // hide toggle if exists
  } else {
    // always show own calendar by default
    await loadOwnCalendar();

    if (session.role === 'manager' && toggleBtn) {
      toggleBtn.classList.remove('hidden');
      toggleBtn.textContent = "Painel de Gestão";

      let showingOwn = true;

      toggleBtn.addEventListener('click', async () => {
        if (showingOwn) {
          await loadManagerDashboard();
          toggleBtn.textContent = "Meu Calendário";
        } else {
          await loadOwnCalendar();
          toggleBtn.textContent = "Painel de Gestão";
        }
        showingOwn = !showingOwn;
      });
    }
  }

  // -----------------------------
  // Global Logout Button
  // -----------------------------
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", () => {
    logout();
    switchView(renderLoginView);
    toggleBtn?.classList.add('hidden'); // hide toggle after logout
  });
});

// -----------------------------
// Dynamic View Loader
// -----------------------------
export function switchView(viewFunc, ...args) {
  viewFunc(mainContainer, ...args);
}

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
