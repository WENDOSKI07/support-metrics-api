const form = document.getElementById('login-form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  const error = document.getElementById('login-error');
  button.disabled = true; button.textContent = 'Verificando…'; error.textContent = '';
  try {
    const response = await fetch('/auth/login', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'support-metrics' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
    form.reset(); location.replace('/');
  } catch (cause) { error.textContent = cause.message; }
  finally { button.disabled = false; button.textContent = 'Iniciar sesión'; }
});
