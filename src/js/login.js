import { apiLogin } from './api.js';

export async function renderLoginView(container) {
  const resp = await fetch('/src/html/login.html');
  const html = await resp.text();
  container.innerHTML = html;

  const form = document.getElementById('loginForm');
  const errorDiv = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');

    const userId = document.getElementById('userId').value.trim();
    const password = document.getElementById('password').value;

    try {
      await apiLogin(userId, password);
      const { initOwnCalendar } = await import('./ownCalendar.js');
      await initOwnCalendar(container);
    } catch (err) {
      console.error(err);
      errorDiv.textContent = 'ID ou palavra-passe inválidos';
      errorDiv.classList.remove('hidden');
    }
  });
}
