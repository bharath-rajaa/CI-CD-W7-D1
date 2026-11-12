const variant = document.querySelector('meta[name="app-variant"]')?.content ?? 'stable';

const form = document.querySelector('#login-form');
if (form) {
  const errorEl = document.querySelector('#error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value.trim(),
        password: form.password.value,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      sessionStorage.setItem('user', data.user);
      location.href = 'dashboard.html';
      return;
    }
    // The 'defect' variant shows a generic message instead of the specified one.
    // That is the controlled product defect the lab uses.
    errorEl.textContent = variant === 'defect'
      ? 'Something went wrong. Please try again.'
      : 'Invalid username or password.';
    errorEl.hidden = false;
  });
}

const welcome = document.querySelector('#welcome');
if (welcome) {
  const user = sessionStorage.getItem('user');
  if (!user) {
    location.href = 'login.html';
  } else {
    welcome.textContent = `Welcome, ${user}`;
  }
}

document.querySelector('#logout')?.addEventListener('click', () => sessionStorage.removeItem('user'));
