(() => {
  const form = document.querySelector('#login-form');
  const message = document.querySelector('#login-message');
  const submit = document.querySelector('#login-submit');

  document.querySelector('#login-brand').innerHTML = OT.brandHtml();
  OT.hydrateIcons();

  const showMessage = (text) => {
    message.textContent = text || '';
    message.hidden = !text;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');
    submit.disabled = true;
    submit.textContent = 'Entrando…';

    const data = new FormData(form);
    try {
      const result = await OT.api('/api/auth/login', {
        method: 'POST',
        allowUnauthorized: true,
        body: { email: data.get('email'), password: data.get('password') }
      });
      window.location.assign(result.user?.perfil === 'MECANICO' ? '/mecanico.html' : '/');
    } catch (error) {
      showMessage(error.message);
      submit.disabled = false;
      submit.textContent = 'Entrar';
    }
  });
})();
