function requireAuth() {
  const token = Api.token();
  const user = Api.getUser();
  if (!token || !user) {
    location.href = '../login.html';
    return null;
  }
  return user;
}

function logout() {
  Api.setToken(null);
  Api.setUser(null);
  location.href = '../login.html';
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function fmtDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString();
}

function fmtDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleString();
}

function fmtMoney(n) {
  const num = Number(n || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function badge(text, color = 'gray') {
  return `<span class="badge badge-${color}">${text}</span>`;
}

function statusColor(status) {
  const map = {
    active: 'green', available: 'green', completed: 'green', paid: 'green', approved: 'green', fulfilled: 'green', settled: 'green', success: 'green',
    pending: 'yellow', requested: 'yellow', partial: 'yellow', in_progress: 'yellow', under_review: 'yellow', on_call: 'yellow',
    cancelled: 'red', rejected: 'red', unpaid: 'red', occupied: 'red', critical: 'red', failed: 'red',
    confirmed: 'blue', admitted: 'blue', dispatched: 'blue', arrived: 'blue'
  };
  return map[status] || 'gray';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
