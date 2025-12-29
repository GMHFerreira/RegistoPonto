// -----------------------------
// Service Worker registration
// -----------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.error("Service Worker registration failed:", err));
  });
}

// -----------------------------
// Populate month select (12 months back)
// -----------------------------
const monthSelect = document.getElementById("monthSelect");
const now = new Date();

for (let i = 0; i < 12; i++) {
  const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
  const monthStr = date.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });
  const option = document.createElement('option');
  option.value = date.toISOString().slice(0,7);
  option.textContent = monthStr;
  monthSelect.appendChild(option);
}

// -----------------------------
// QR Modal
// -----------------------------
const qrButton = document.getElementById("qrButton");
const qrModal = document.getElementById("qrModal");
const closeQrButton = document.getElementById("closeQrButton");

qrButton.addEventListener("click", () => {
  qrModal.classList.remove("hidden");
});

closeQrButton.addEventListener("click", () => {
  qrModal.classList.add("hidden");
});

// -----------------------------
// PWA Install Prompt (Android)
// -----------------------------
let deferredPrompt;
const installButton = document.getElementById("installButton");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installButton.hidden = false; // show install button
});

installButton.addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    console.log("User choice:", choice.outcome);
    deferredPrompt = null;
    installButton.hidden = true;
  }
});
