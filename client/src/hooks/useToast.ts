let timer: ReturnType<typeof setTimeout>;

export function showToast(msg: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(timer);
  timer = setTimeout(() => { el.style.display = 'none'; }, 2500);
}
