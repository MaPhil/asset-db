async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

async function rebuildAssets(event) {
  event.preventDefault();
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await postJson('/api/v1/assets/rebuild', {});
    window.location.reload();
  } catch (err) {
    alert(err.message);
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('[data-rebuild]')?.forEach((button) => {
  button.addEventListener('click', rebuildAssets);
});
