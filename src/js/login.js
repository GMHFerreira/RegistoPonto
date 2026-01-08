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
      const res = await apiLogin(userId, password);

      // Dynamically import the correct calendar module based on role
      if (res.role === 'manager') {
        const { initManagerCalendar } = await import('./manager.js');
        await initManagerCalendar(container);
      } else {
        const { initUserCalendar } = await import('./user.js');
        await initUserCalendar(container);
      }

    } catch (err) {
      console.error(err);
      errorDiv.textContent = 'ID ou palavra-passe inválidos';
      errorDiv.classList.remove('hidden');
    }
  });
}
