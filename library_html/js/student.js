// ============================================================
//  STUDENT.JS - everything on the student dashboard
//  Home, Browse Books, Book Requests, My Books, Wishlist, Profile, Settings
// ============================================================
let me;                                   // logged-in student
let current = 'home';
const filters = { q: '', category: 'All', availability: '' };
const content = document.getElementById('content');

const titles = { home: 'Home', browse: 'Browse Books', bookrequests: 'Request a Book', mybooks: 'My Books', wishlist: 'My Wishlist', profile: 'Profile', settings: 'Settings' };
const sections = { home: renderHome, browse: renderBrowse, bookrequests: renderBookRequests, mybooks: renderMyBooks, wishlist: renderWishlist, profile: renderProfile, settings: renderSettings };

// ---------- Start ----------
(async function init() {
  me = await guard('student');
  setupShell(me);
  window.addEventListener('hashchange', route);
  content.addEventListener('click', onClick);
  route();
})();

function route() {
  const sec = location.hash.slice(1);
  current = sections[sec] ? sec : 'home';
  document.querySelectorAll('[data-sec]').forEach(a => a.classList.toggle('active', a.dataset.sec === current));
  document.getElementById('pageTitle').textContent = titles[current];
  document.getElementById('sidebar').classList.remove('open');
  sections[current]();
}
function onThemeChange() { if (current === 'settings') renderSettings(); }

// ---------- Book card (used in browse + wishlist) ----------
function bookCard(b, inWishlist) {
  const avail = b.available_copies > 0;
  const borrowLabel = b.requestStatus === 'pending' ? 'Awaiting approval'
    : b.requestStatus === 'issued' ? 'Already borrowed' : avail ? 'Request to borrow' : 'Unavailable';
  return `
  <div class="book-card">
    <div class="cover">${coverHtml(b.cover)}
      ${inWishlist ? '' : `<button class="heart ${b.wished ? 'on' : ''}" data-act="wish" data-id="${b.id}" title="Wishlist">♥</button>`}
    </div>
    <div class="info">
      <h4>${esc(b.title)}</h4>
      <div class="by">by ${esc(b.author)}</div>
      <div class="tags">
        <span class="tag cat">${esc(b.category)}</span>
        <span class="tag ${avail ? 'ok' : 'bad'}">${avail ? b.available_copies + ' available' : 'Unavailable'}</span>
      </div>
      <small>ID: ${esc(b.book_id)}</small>
      <div class="actions">
        <button class="btn" data-act="view" data-id="${b.id}">View</button>
        ${inWishlist
          ? `<button class="btn danger" data-act="unwish" data-id="${b.id}">Remove</button>`
          : `<button class="btn primary" data-act="borrow" data-id="${b.id}" ${avail && !b.requestStatus ? '' : 'disabled'}>${borrowLabel}</button>`}
      </div>
    </div>
  </div>`;
}

// ---------- HOME ----------
async function renderHome() {
  const [s, loans, books] = await Promise.all([api('/student/summary'), api('/student/loans'), api('/books?availability=available')]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const active = loans.loans.filter(l => l.status === 'issued');
  content.innerHTML = `
    <div class="greet"><h1>${greet}, ${esc(me.full_name.split(' ')[0])} 👋</h1><p>Here's your library summary for today.</p></div>
    <div class="stats">
      <div class="stat"><div class="ico">📚</div><div class="num">${s.active}</div><div class="lbl">Books borrowed</div></div>
      <div class="stat"><div class="ico">⏰</div><div class="num">${s.dueSoon}</div><div class="lbl">Due in 3 days</div></div>
      <div class="stat"><div class="ico">⚠️</div><div class="num">${s.overdue}</div><div class="lbl">Overdue books</div></div>
      <div class="stat"><div class="ico">💜</div><div class="num">${s.wishlist}</div><div class="lbl">In wishlist</div></div>
    </div>
    <div class="panel"><h3>Currently borrowed</h3><p class="hint">Return these on time to avoid being overdue.</p>
      ${active.length ? `<div class="table-wrap"><table><tr><th>Book</th><th>Due date</th><th>Status</th></tr>
        ${active.map(l => `<tr><td><span class="mini-cover">${coverHtml(l.cover)}</span>${esc(l.title)}</td><td>${fmtDate(l.due_date)}</td><td>${loanBadge(l, loans.today)}</td></tr>`).join('')}
      </table></div>` : '<p class="hint">You have no borrowed books. Go to Browse Books to borrow one 📖</p>'}
    </div>
    <h3 style="margin:8px 0 14px">Available now</h3>
    <div class="grid">${books.slice(0, 4).map(b => bookCard(b)).join('')}</div>`;
}

// ---------- BROWSE ----------
async function renderBrowse() {
  const cats = await api('/books/categories');
  content.innerHTML = `
    <div class="toolbar">
      <div class="search"><span>🔍 Search</span><input id="q" placeholder="Search title, author, or ISBN..." value="${esc(filters.q)}"></div>
      <select id="avail">
        <option value="">All availability</option>
        <option value="available">Available only</option>
        <option value="unavailable">Unavailable</option>
      </select>
    </div>
    <div class="chips">${['All', ...cats].map(c => `<button class="chip ${filters.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="grid" id="grid"></div>`;
  $('#avail').value = filters.availability;

  let timer;
  $('#q').addEventListener('input', e => { filters.q = e.target.value; clearTimeout(timer); timer = setTimeout(loadBooks, 250); });
  $('#avail').addEventListener('change', e => { filters.availability = e.target.value; loadBooks(); });
  content.querySelectorAll('.chip').forEach(ch => ch.onclick = () => {
    filters.category = ch.dataset.cat;
    content.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === ch));
    loadBooks();
  });
  loadBooks();
}
async function loadBooks() {
  const qs = new URLSearchParams(filters).toString();
  const books = await api('/books?' + qs);
  $('#grid').innerHTML = books.length ? books.map(b => bookCard(b)).join('')
    : '<div class="empty"><div class="big">🔎</div><p>No books found. Try another search.</p></div>';
}

// ---------- REQUEST A BOOK ----------
async function renderBookRequests() {
  const requests = await api('/student/book-requests');
  content.innerHTML = `
    <div class="panel form-card">
      <h3>Can't find a book?</h3>
      <p class="hint">Tell the librarian which book you are looking for. We'll notify you when it becomes available.</p>
      <form id="bookRequestForm">
        <label class="f" for="requestTitle">Book title *</label>
        <input id="requestTitle" name="title" maxlength="150" required placeholder="Enter the book title">
        <label class="f" for="requestAuthor">Author (optional)</label>
        <input id="requestAuthor" name="author" maxlength="120" placeholder="Enter the author's name">
        <label class="f" for="requestNotes">Additional details (optional)</label>
        <textarea id="requestNotes" name="notes" maxlength="500" rows="3" placeholder="Edition, publisher, or other details"></textarea>
        <button class="btn primary big" type="submit">Send book request</button>
      </form>
    </div>
    <div class="panel"><h3>Your book requests</h3>
      ${requests.length ? `<div class="table-wrap"><table>
        <tr><th>Requested book</th><th>Date</th><th>Status</th></tr>
        ${requests.map(r => `<tr>
          <td><b>${esc(r.title)}</b>${r.author ? `<br><small style="color:var(--muted)">by ${esc(r.author)}</small>` : ''}
            ${r.notes ? `<br><small style="color:var(--muted)">${esc(r.notes)}</small>` : ''}
            ${r.notifiedBook ? `<br><small style="color:var(--muted)">Available title: ${esc(r.notifiedBook)}</small>` : ''}
          </td>
          <td>${fmtDate(r.request_date)}</td>
          <td>${r.status === 'notified' ? '<span class="tag ok">Availability notification sent</span>' : '<span class="tag warn">Waiting for librarian</span>'}</td>
        </tr>`).join('')}
      </table></div>` : '<div class="empty"><div class="big">📚</div><p>You have not requested any books yet.</p></div>'}
    </div>`;
  $('#bookRequestForm').addEventListener('submit', submitBookRequest);
}

async function submitBookRequest(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const body = {
    title: $('#requestTitle', form).value,
    author: $('#requestAuthor', form).value,
    notes: $('#requestNotes', form).value,
  };
  try {
    const result = await api('/student/book-requests', 'POST', body);
    toast(result.message);
    renderBookRequests();
  } catch (error) { toast(error.message, 'error'); }
}

// ---------- MY BOOKS ----------
async function renderMyBooks() {
  const { today, loans } = await api('/student/loans');
  content.innerHTML = `<div class="panel"><h3>My Books &amp; Requests</h3><p class="hint">Borrow requests appear here while awaiting librarian approval. Approved books become active loans.</p>
    ${loans.length ? `<div class="table-wrap"><table>
      <tr><th>Book</th><th>Issued / Requested</th><th>Due</th><th>Returned</th><th>Status</th></tr>
      ${loans.map(l => `<tr>
        <td><span class="mini-cover">${coverHtml(l.cover)}</span><b>${esc(l.title)}</b><br><small style="color:var(--muted)">${esc(l.author)}</small></td>
        <td>${fmtDate(l.issue_date || l.request_date)}</td><td>${fmtDate(l.due_date)}</td><td>${fmtDate(l.return_date)}</td><td>${loanBadge(l, today)}</td></tr>`).join('')}
    </table></div>` : '<div class="empty"><div class="big">📚</div><p>You have no borrowed books or pending requests yet.</p></div>'}
  </div>`;
}

// ---------- WISHLIST ----------
async function renderWishlist() {
  const books = await api('/student/wishlist');
  content.innerHTML = books.length
    ? `<div class="grid">${books.map(b => bookCard(b, true)).join('')}</div>`
    : '<div class="empty"><div class="big">💜</div><p>Your wishlist is empty. Tap the ♥ on any book to save it.</p></div>';
}

// ---------- PROFILE ----------
async function renderProfile() {
  me = await api('/auth/me');
  content.innerHTML = `
    <div class="panel">
      <div class="profile-head"><div class="avatar">${esc(initials(me.full_name))}</div>
        <div><h2>${esc(me.full_name)}</h2><p>${esc(me.student_id)} · ${esc(me.department)}</p></div></div>
      <h3 style="margin-bottom:12px">Personal Information</h3>
      <div class="info-grid">
        <div class="info"><small>Full name</small><b>${esc(me.full_name)}</b></div>
        <div class="info"><small>Student ID</small><b>${esc(me.student_id)}</b></div>
        <div class="info"><small>Email</small><b>${esc(me.email)}</b></div>
        <div class="info"><small>Department</small><b>${esc(me.department)}</b></div>
        <div class="info"><small>Year / Division</small><b>${esc(me.year)}</b></div>
        <div class="info"><small>Phone</small><b>${esc(me.phone)}</b></div>
        <div class="info"><small>Username</small><b>${esc(me.username)}</b></div>
      </div>
      <div class="row-btns">
        <button class="btn primary" id="editProfile">✏️ Edit Profile</button>
        <button class="btn danger" id="logout2">🚪 Logout</button>
      </div>
    </div>`;
  $('#editProfile').onclick = () => editProfileModal(me, true, async () => { me = await api('/auth/me'); setupShell(me); renderProfile(); });
  $('#logout2').onclick = logout;
}

// ---------- SETTINGS ----------
async function renderSettings() {
  me = await api('/auth/me');
  const dark = document.body.classList.contains('dark');
  content.innerHTML = `
    <div style="max-width:640px">
      <div class="panel"><h3>Account</h3><br><a class="btn" href="#profile">Profile Information →</a></div>
      <div class="panel"><h3>Preferences</h3>
        <div class="setting"><div><b>Notifications</b><span>Library updates and alerts</span></div>
          <input type="checkbox" id="setNotif" ${me.notifications ? 'checked' : ''}></div>
        <div class="setting"><div><b>Appearance</b><span>${dark ? 'Dark mode' : 'Light mode'}</span></div>
          <button class="btn primary" id="setTheme">Change</button></div>
      </div>
      <div class="panel"><h3>Library</h3>
        <div class="setting"><div><b>Due Date Reminders</b><span>Reminders for books due soon</span></div>
          <input type="checkbox" id="setRem" ${me.reminders ? 'checked' : ''}></div>
      </div>
      <div class="panel"><h3>Security</h3><br><button class="btn" id="setPw">Change Password →</button></div>
    </div>`;
  const save = async () => {
    try { await api('/auth/settings', 'PUT', { notifications: $('#setNotif').checked, reminders: $('#setRem').checked }); toast('Settings saved'); }
    catch (e) { toast(e.message, 'error'); }
  };
  $('#setNotif').onchange = save;
  $('#setRem').onchange = save;
  $('#setTheme').onclick = toggleTheme;
  $('#setPw').onclick = changePasswordModal;
}

// ---------- Click handling for all buttons inside content ----------
async function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.dataset.act === 'view') return viewBook(id);
    if (btn.dataset.act === 'borrow') { const r = await api('/student/borrow/' + id, 'POST'); toast(r.message); refreshBell(); return sections[current](); }
    if (btn.dataset.act === 'wish') {
      const on = btn.classList.contains('on');
      await api('/student/wishlist/' + id, on ? 'DELETE' : 'POST');
      btn.classList.toggle('on'); toast(on ? 'Removed from wishlist' : 'Added to wishlist 💜'); return;
    }
    if (btn.dataset.act === 'unwish') { await api('/student/wishlist/' + id, 'DELETE'); toast('Removed from wishlist'); return renderWishlist(); }
  } catch (err) { toast(err.message, 'error'); }
}

async function viewBook(id) {
  const books = await api('/books');
  const b = books.find(x => String(x.id) === String(id));
  if (!b) return;
  const avail = b.available_copies > 0;
  const canRequest = avail && !b.requestStatus;
  const borrowLabel = b.requestStatus === 'pending' ? 'Awaiting librarian approval'
    : b.requestStatus === 'issued' ? 'Already borrowed' : avail ? 'Request to borrow' : 'Currently unavailable';
  openModal(esc(b.title), `
    <div class="cover big">${coverHtml(b.cover)}</div>
    <p style="color:var(--muted);margin:10px 0">by ${esc(b.author)}</p>
    <div class="info-grid">
      <div class="info"><small>Category</small><b>${esc(b.category)}</b></div>
      <div class="info"><small>Book ID</small><b>${esc(b.book_id)}</b></div>
      <div class="info"><small>Publisher</small><b>${esc(b.publisher || '-')}</b></div>
      <div class="info"><small>ISBN</small><b>${esc(b.isbn || '-')}</b></div>
      <div class="info"><small>Shelf</small><b>${esc(b.shelf || '-')}</b></div>
      <div class="info"><small>Copies available</small><b>${b.available_copies} of ${b.total_copies}</b></div>
    </div>
    <button class="btn primary big" id="mBorrow" ${canRequest ? '' : 'disabled'}>${borrowLabel}</button>`,
    m => {
      $('#mBorrow', m).onclick = async () => {
        try { const r = await api('/student/borrow/' + b.id, 'POST'); closeModal(); toast(r.message); refreshBell(); sections[current](); }
        catch (err) { toast(err.message, 'error'); }
      };
    });
}
