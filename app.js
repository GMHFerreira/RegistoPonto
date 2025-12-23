if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then(() => console.log("Service Worker registered"))
      .catch(err => console.error("SW registration failed", err));
  });
}

const monthSelect = document.getElementById("monthSelect");
const now = new Date();

for (let i = 0; i < 12; i++) {
  const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
  const monthStr = date.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });
  const option = document.createElement('option');
  option.value = date.toISOString().slice(0,7); // YYYY-MM
  option.textContent = monthStr;
  monthSelect.appendChild(option);
}

