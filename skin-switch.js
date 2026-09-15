(function () {
  const select = document.getElementById('skinSelect');
  if (!select) return;
  const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  select.value = current || 'index.html';
  select.addEventListener('change', function () {
    if (this.value) location.href = this.value;
  });
}());
