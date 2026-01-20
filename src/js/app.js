// -----------------------------
// app.js — main controller
// -----------------------------

import { getSession, logout } from './db.js';
import { renderLoginView } from './login.js';

const mainContainer = document.getElementById("appMain");

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
    e.preventDefault(); // prevent default mini-infobar
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
  // Load initial view based on session
  // -----------------------------
  const session = await getSession();

  if (!session) {
    const { renderLoginView } = await import('./login.js');
    renderLoginView(mainContainer);
  } else if (session.role === 'manager') {
    const { initManagerCalendar } = await import('./manager.js');
    await initManagerCalendar(mainContainer);
  } else {
    const { initOwnCalendar } = await import('./ownCalendar.js');
    await initOwnCalendar(mainContainer);
  }


  // -----------------------------
  // Global Logout Button
  // -----------------------------
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", () => {
    logout();
    switchView(renderLoginView);
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
