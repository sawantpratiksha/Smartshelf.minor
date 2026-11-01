// ============================================================
//  COMMON.JS - helper functions used by BOTH dashboards
//  api calls, login check, toast, modal, dark mode, formatting
// ============================================================
const $ = (sel, root = document) => root.querySelector(sel);

// ---------- Talk to the "database" (see api.js and db.js) ----------
async function api(path, method = 'GET', body) {
  try {
    return await handleRequest(path, method, body || {});
  } catch (e) {
    if (e.auth) { location.href = ROOT + 'login.html'; }
    throw e;
  }
}

// ---------- Make sure the right person is logged in ----------
async function guard(role) {
  const s = getSession();
  if (!s || !currentUser(s)) { location.href = ROOT + 'login.html'; throw new Error('no login'); }
  if (s.role !== role) {
    location.href = ROOT + (s.role === 'librarian' ? 'admin/dashboard.html' : 'student/dashboard.html');
    throw new Error('wrong role');
  }
  return api('/auth/me');
}

async function logout() {
  localStorage.removeItem('ss_session');
  location.href = ROOT + 'login.html';
}

// ---------- Small helpers ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initials(name) {
  return String(name || '?').replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
// show a book cover: photo (url / uploaded) or emoji
function coverHtml(c) {
  c = c || '📘';
  return /^(https?:|data:image)/.test(c) ? `<img src="${esc(c)}" alt="cover" onerror="this.replaceWith('📘')">` : esc(c);
}
function fmtDate(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function daysBetween(a, b) {            // b - a  in days (strings YYYY-MM-DD)
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDaysStr(date, n) {
  const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// status badge for a loan row
function loanBadge(loan, today) {
  if (loan.status === 'returned') return '<span class="tag ok">Returned</span>';
  if (loan.status === 'pending') return '<span class="tag warn">Awaiting approval</span>';
  if (loan.status === 'rejected') return '<span class="tag bad">Request declined</span>';
  const left = daysBetween(today, loan.due_date);
  if (left < 0) return `<span class="tag bad">Overdue ${-left}d</span>`;
  if (left <= 3) return `<span class="tag warn">Due in ${left}d</span>`;
  return `<span class="tag cat">${left} days left</span>`;
}

// ---------- Toast message ----------
function toast(text, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : '');
  t.textContent = text;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ---------- Modal popup ----------
function openModal(title, bodyHtml, onMount) {
  closeModal();
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'modalOverlay';
  o.innerHTML = `<div class="modal"><div class="modal-head"><h3>${title}</h3><button class="x" id="modalX">✕</button></div>${bodyHtml}</div>`;
  document.body.appendChild(o);
  o.addEventListener('mousedown', e => { if (e.target === o) closeModal(); });
  $('#modalX').onclick = closeModal;
  if (onMount) onMount(o.querySelector('.modal'));
}
function closeModal() { document.getElementById('modalOverlay')?.remove(); }

// ---------- Dark / light mode ----------
function applyTheme() {
  let dark = false;
  try { dark = localStorage.getItem('ss_theme') === 'dark'; } catch {}
  document.body.classList.toggle('dark', dark);
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = dark ? '☀️' : '🌙';
}
function toggleTheme() {
  const dark = !document.body.classList.contains('dark');
  try { localStorage.setItem('ss_theme', dark ? 'dark' : 'light'); } catch {}
  applyTheme();
  if (typeof onThemeChange === 'function') onThemeChange();
}

// ---------- Notification bell (both dashboards) ----------
async function refreshBell() {
  try {
    const n = await api('/auth/notifications');
    const b = $('#bellCount');
    b.textContent = n.unread; b.style.display = n.unread ? 'grid' : 'none';
    return n;
  } catch {}
}
async function showNotifications() {
  const n = await refreshBell();
  const list = n.list.length
    ? n.list.map(x => `<div class="notif ${x.is_read ? '' : 'new'}">${esc(x.message)}<small>${esc(x.created_at)}</small></div>`).join('')
    : '<div class="empty"><div class="big">🔔</div>No notifications yet</div>';
  openModal('Notifications', list);
  await api('/auth/notifications/read', 'POST');
  refreshBell();
}

// ---------- Change password popup (both dashboards) ----------
function changePasswordModal() {
  openModal('Change Password', `
    <label class="f">Current password</label><input id="cp1" type="password">
    <label class="f">New password <small>(min 6 characters)</small></label><input id="cp2" type="password">
    <label class="f">Confirm new password</label><input id="cp3" type="password">
    <button class="btn primary big" id="cpSave" style="margin-top:20px">Update Password</button>`,
    m => {
      $('#cpSave', m).onclick = async () => {
        if ($('#cp2', m).value !== $('#cp3', m).value) return toast('New passwords do not match', 'error');
        try {
          await api('/auth/password', 'POST', { current: $('#cp1', m).value, next: $('#cp2', m).value });
          closeModal(); toast('Password changed');
        } catch (e) { toast(e.message, 'error'); }
      };
    });
}

// ---------- Edit profile popup (both dashboards) ----------
function editProfileModal(me, isStudent, onSaved) {
  openModal('Edit Profile', `
    <label class="f">Full name</label><input id="ep1" value="${esc(me.full_name)}">
    <label class="f">Email</label><input id="ep2" value="${esc(me.email)}">
    <label class="f">Department</label><input id="ep3" value="${esc(me.department)}">
    ${isStudent ? `<label class="f">Year / Division</label><input id="ep4" value="${esc(me.year)}">` : ''}
    <label class="f">Phone</label><input id="ep5" value="${esc(me.phone)}">
    <button class="btn primary big" id="epSave" style="margin-top:20px">Save Changes</button>`,
    m => {
      $('#epSave', m).onclick = async () => {
        try {
          await api('/auth/profile', 'PUT', {
            full_name: $('#ep1', m).value, email: $('#ep2', m).value, department: $('#ep3', m).value,
            year: isStudent ? $('#ep4', m).value : '', phone: $('#ep5', m).value,
          });
          closeModal(); toast('Profile updated'); onSaved();
        } catch (e) { toast(e.message, 'error'); }
      };
    });
}

// ---------- Shared shell setup (sidebar, bell, theme, logout) ----------
function setupShell(me) {
  applyTheme();
  $('#avatar').textContent = initials(me.full_name);
  $('#userName').textContent = me.full_name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(' ')[0];
  $('#themeBtn').onclick = toggleTheme;
  $('#bell').onclick = showNotifications;
  $('#logoutBtn').onclick = logout;
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  refreshBell();
}
