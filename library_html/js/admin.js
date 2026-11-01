// ============================================================
//  ADMIN.JS - everything on the librarian dashboard
//  Dashboard, Manage Books (add/edit/delete), Issue Book,
//  Loans & Returns, Students, Profile
// ============================================================
let me;
let current = 'dashboard';
const content = document.getElementById('content');

const titles = { dashboard: 'Librarian Dashboard', books: 'Manage Books', issue: 'Issue Book', requests: 'Borrow Requests', bookrequests: 'Student Book Requests', loans: 'Loans & Returns', students: 'Students', profile: 'Librarian Profile' };
const sections = { dashboard: renderDashboard, books: renderBooks, issue: renderIssue, requests: renderBorrowRequests, bookrequests: renderBookRequests, loans: renderLoans, students: renderStudents, profile: renderProfile };
const CATEGORIES = ['Coding', 'Journals', 'Literature', 'Magazines', 'Science', 'History', 'Other'];

(async function init() {
  me = await guard('librarian');
  setupShell(me);
  window.addEventListener('hashchange', route);
  route();
})();

function route() {
  const sec = location.hash.slice(1);
  current = sections[sec] ? sec : 'dashboard';
  document.querySelectorAll('[data-sec]').forEach(a => a.classList.toggle('active', a.dataset.sec === current));
  document.getElementById('pageTitle').textContent = titles[current];
  document.getElementById('sidebar').classList.remove('open');
  sections[current]();
}

// small reusable pieces
function loanRows(list, today, withReturn) {
  return list.map(l => `<tr>
    <td><span class="mini-cover">${coverHtml(l.cover)}</span>${esc(l.title)}</td>
    <td>${esc(l.full_name)}<br><small style="color:var(--muted)">${esc(l.student_code)}</small></td>
    <td>${fmtDate(l.issue_date)}</td><td>${fmtDate(l.due_date)}</td><td>${loanBadge(l, today)}</td>
    ${withReturn ? `<td>${l.status === 'issued' ? `<button class="btn primary" data-return="${l.id}">Return</button>` : '-'}</td>` : ''}
  </tr>`).join('');
}
async function doReturn(id) {
  try { const r = await api('/admin/return/' + id, 'POST'); toast(r.message); sections[current](); }
  catch (e) { toast(e.message, 'error'); }
}
content.addEventListener('click', e => {
  const r = e.target.closest('[data-return]');
  if (r) doReturn(r.dataset.return);
  const request = e.target.closest('[data-request-action]');
  if (request) processBorrowRequest(request.dataset.requestId, request.dataset.requestAction);
  const notifyRequest = e.target.closest('[data-notify-book-request]');
  if (notifyRequest) processBookRequestNotification(notifyRequest.dataset.notifyBookRequest);
});

async function processBorrowRequest(id, action) {
  try {
    const r = await api('/admin/borrow-requests/' + id, 'POST', { action });
    toast(r.message);
    renderBorrowRequests();
  } catch (e) { toast(e.message, 'error'); }
}

async function processBookRequestNotification(id) {
  const bookId = $(`#bookMatch-${id}`)?.value;
  if (!bookId) return toast('There is no matching available book to notify about', 'error');
  try {
    const result = await api('/admin/book-requests/' + id + '/notify', 'POST', { book_id: bookId });
    toast(result.message);
    renderBookRequests();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- DASHBOARD ----------
async function renderDashboard() {
  const s = await api('/admin/stats');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  content.innerHTML = `
    <div class="greet"><h1>${greet}, Librarian 👋</h1><p>Here's what's happening in your library today.</p></div>
    <div class="stats">
      <div class="stat"><div class="ico">📚</div><div class="num">${s.totalBooks}</div><div class="lbl">Total Books</div></div>
      <div class="stat"><div class="ico">📦</div><div class="num">${s.available}</div><div class="lbl">Available Copies</div></div>
      <div class="stat"><div class="ico">🎓</div><div class="num">${s.students}</div><div class="lbl">Total Students</div></div>
      <div class="stat"><div class="ico">📖</div><div class="num">${s.activeLoans}</div><div class="lbl">Active Loans</div></div>
      <div class="stat"><div class="ico">⚠️</div><div class="num">${s.overdue}</div><div class="lbl">Overdue Books</div></div>
    </div>
    <div class="panel"><h3>Overdue books</h3><p class="hint">Students who should return these books.</p>
      ${s.overdueList.length ? `<div class="table-wrap"><table><tr><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th>Status</th><th></th></tr>
        ${loanRows(s.overdueList, s.today, true)}</table></div>` : '<p class="hint">🎉 No overdue books.</p>'}
    </div>
    <div class="panel"><h3>Recent activity</h3><p class="hint">Last 6 issued books.</p>
      ${s.recent.length ? `<div class="table-wrap"><table><tr><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th>Status</th></tr>
        ${loanRows(s.recent, s.today, false)}</table></div>` : '<p class="hint">No loans yet.</p>'}
    </div>`;
}

// ---------- MANAGE BOOKS ----------
let bookSearch = '';
async function renderBooks() {
  content.innerHTML = `
    <div class="toolbar">
      <div class="search"><span>🔍 Search</span><input id="bq" placeholder="Search title, author, ISBN or ID..." value="${esc(bookSearch)}"></div>
      <button class="btn primary" id="addBook">➕ Add New Book</button>
    </div>
    <div class="panel"><div class="table-wrap" id="bookTable"></div></div>`;
  $('#addBook').onclick = () => bookForm(null);
  let t; $('#bq').oninput = e => { bookSearch = e.target.value; clearTimeout(t); t = setTimeout(loadBookTable, 250); };
  loadBookTable();
}
async function loadBookTable() {
  const books = await api('/books?q=' + encodeURIComponent(bookSearch));
  $('#bookTable').innerHTML = books.length ? `<table>
    <tr><th>Book</th><th>ID</th><th>Category</th><th>Shelf</th><th>Copies</th><th>Actions</th></tr>
    ${books.map(b => `<tr>
      <td><span class="mini-cover">${coverHtml(b.cover)}</span><b>${esc(b.title)}</b><br><small style="color:var(--muted)">by ${esc(b.author)}</small></td>
      <td>${esc(b.book_id)}</td><td><span class="tag cat">${esc(b.category)}</span></td><td>${esc(b.shelf || '-')}</td>
      <td><span class="tag ${b.available_copies ? 'ok' : 'bad'}">${b.available_copies} / ${b.total_copies}</span></td>
      <td><div class="row-btns"><button class="btn" data-edit="${b.id}">Edit</button><button class="btn danger" data-del="${b.id}">Delete</button></div></td>
    </tr>`).join('')}</table>` : '<div class="empty"><div class="big">📖</div><p>No books found.</p></div>';
  $('#bookTable').querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => bookForm(books.find(b => b.id == btn.dataset.edit)));
  $('#bookTable').querySelectorAll('[data-del]').forEach(btn => btn.onclick = async () => {
    const b = books.find(x => x.id == btn.dataset.del);
    if (!confirm(`Delete "${b.title}"? This cannot be undone.`)) return;
    try { const r = await api('/admin/books/' + b.id, 'DELETE'); toast(r.message); loadBookTable(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

// Add / Edit book popup (with cover: upload photo, image URL or emoji)
function bookForm(book) {
  let cover = book ? book.cover : '📘';
  const cats = CATEGORIES.includes(book?.category) || !book ? CATEGORIES : [...CATEGORIES, book.category];
  openModal(book ? 'Edit Book' : 'Add New Book', `
    <div class="two">
      <div><label class="f">Book ID *</label><input id="b_id" placeholder="e.g. BK101" value="${esc(book?.book_id)}"></div>
      <div><label class="f">Category</label><select id="b_cat">${cats.map(c => `<option ${book?.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    </div>
    <div class="cover-box">
      <b style="font-size:14px">📷 Book Cover Picture</b>
      <div class="cover-tabs">
        <button class="btn primary" type="button" data-ct="upload">📁 Upload Photo</button>
        <button class="btn" type="button" data-ct="url">🌐 Image URL</button>
        <button class="btn" type="button" data-ct="emoji">😀 Emoji</button>
      </div>
      <div id="coverInput"></div>
      <div class="cover-preview"><div class="pv" id="pv"></div><div><small style="color:var(--muted)">Preview</small><br><button class="btn" type="button" id="coverReset">Reset</button></div></div>
    </div>
    <label class="f">Book Name / Title *</label><input id="b_title" placeholder="e.g. Clean Code" value="${esc(book?.title)}">
    <div class="two">
      <div><label class="f">Author *</label><input id="b_author" placeholder="e.g. Robert C. Martin" value="${esc(book?.author)}"></div>
      <div><label class="f">Publisher</label><input id="b_pub" placeholder="e.g. Prentice Hall" value="${esc(book?.publisher)}"></div>
      <div><label class="f">ISBN</label><input id="b_isbn" placeholder="e.g. 978-0132350884" value="${esc(book?.isbn)}"></div>
      <div><label class="f">Shelf Number</label><input id="b_shelf" placeholder="e.g. Shelf B2" value="${esc(book?.shelf)}"></div>
    </div>
    <label class="f">Number of copies *</label><input id="b_copies" type="number" min="1" value="${book ? book.total_copies : 1}">
    <button class="btn primary big" id="b_save" style="margin-top:20px">${book ? 'Save Changes' : 'Add Book'}</button>`,
  m => {
    const pv = $('#pv', m), box = $('#coverInput', m);
    const paint = () => { pv.innerHTML = coverHtml(cover); };
    const tab = name => {
      m.querySelectorAll('[data-ct]').forEach(b => b.classList.toggle('primary', b.dataset.ct === name));
      if (name === 'upload') {
        box.innerHTML = '<input type="file" id="cFile" accept="image/png,image/jpeg,image/webp"><small style="color:var(--muted)">JPG, PNG, WEBP</small>';
        $('#cFile', m).onchange = e => {
          const f = e.target.files[0]; if (!f) return;
          const img = new Image();
          img.onload = () => {                         // shrink the photo so it stays small in the database
            const s = Math.min(1, 300 / Math.max(img.width, img.height));
            const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            cover = c.toDataURL('image/jpeg', 0.8); paint();
          };
          img.src = URL.createObjectURL(f);
        };
      } else if (name === 'url') {
        box.innerHTML = '<input id="cUrl" placeholder="https://example.com/cover.jpg">';
        $('#cUrl', m).oninput = e => { cover = e.target.value.trim() || '📘'; paint(); };
      } else {
        box.innerHTML = '<input id="cEmoji" maxlength="4" placeholder="Type or paste an emoji, e.g. 📗">';
        $('#cEmoji', m).oninput = e => { cover = e.target.value.trim() || '📘'; paint(); };
      }
    };
    m.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => tab(b.dataset.ct));
    $('#coverReset', m).onclick = () => { cover = '📘'; paint(); };
    tab('upload'); paint();

    $('#b_save', m).onclick = async () => {
      const body = {
        book_id: $('#b_id', m).value, category: $('#b_cat', m).value, title: $('#b_title', m).value,
        author: $('#b_author', m).value, publisher: $('#b_pub', m).value, isbn: $('#b_isbn', m).value,
        shelf: $('#b_shelf', m).value, total_copies: $('#b_copies', m).value, cover,
      };
      try {
        const r = book ? await api('/admin/books/' + book.id, 'PUT', body) : await api('/admin/books', 'POST', body);
        closeModal(); toast(r.message); if (current === 'books') loadBookTable();
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

// ---------- ISSUE BOOK ----------
async function renderIssue() {
  const [students, books] = await Promise.all([api('/admin/students'), api('/books?availability=available')]);
  const sLabel = s => `${s.full_name} (${s.student_id})`;
  const bLabel = b => `${b.title} (${b.book_id}) - ${b.available_copies} left`;
  content.innerHTML = `
    <div class="panel form-card">
      <h3>📚 Issue a Library Book</h3>
      <p class="hint">Select a registered student and an available book from the library catalog.</p>
      <label class="f">1. Select Student *</label>
      <input id="i_student" list="studentList" placeholder="-- Choose Student (by Name or Student ID) --">
      <datalist id="studentList">${students.map(s => `<option value="${esc(sLabel(s))}">`).join('')}</datalist>
      <label class="f">2. Select Book *</label>
      <input id="i_book" list="bookList" placeholder="-- Choose Book (by Title or Book ID) --">
      <datalist id="bookList">${books.map(b => `<option value="${esc(bLabel(b))}">`).join('')}</datalist>
      <label class="f">3. Due Date *</label>
      <input id="i_due" type="date" value="${addDaysStr(localToday(), 14)}" min="${localToday()}">
      <div class="quick">
        <button class="btn" type="button" data-days="7">7 Days</button>
        <button class="btn" type="button" data-days="14">14 Days (Default)</button>
        <button class="btn" type="button" data-days="30">30 Days</button>
      </div>
      <button class="btn primary big" id="i_go" style="margin-top:22px">📚 Confirm &amp; Issue Book</button>
    </div>`;
  content.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { $('#i_due').value = addDaysStr(localToday(), +b.dataset.days); });
  $('#i_go').onclick = async () => {
    const s = students.find(x => sLabel(x) === $('#i_student').value);
    const b = books.find(x => bLabel(x) === $('#i_book').value);
    if (!s) return toast('Please choose a student from the list', 'error');
    if (!b) return toast('Please choose a book from the list', 'error');
    try { const r = await api('/admin/issue', 'POST', { student_id: s.id, book_id: b.id, due_date: $('#i_due').value }); toast(r.message); renderIssue(); }
    catch (e) { toast(e.message, 'error'); }
  };
}

// ---------- BORROW REQUESTS ----------
async function renderBorrowRequests() {
  const requests = await api('/admin/borrow-requests');
  content.innerHTML = `<div class="panel"><h3>Student borrow requests</h3>
    <p class="hint">Approve a request to issue the book. Availability and the student's active-loan limit are checked when approved.</p>
    ${requests.length ? `<div class="table-wrap"><table>
      <tr><th>Book</th><th>Student</th><th>Requested</th><th>Action</th></tr>
      ${requests.map(r => `<tr>
        <td><span class="mini-cover">${coverHtml(r.cover)}</span><b>${esc(r.title)}</b></td>
        <td>${esc(r.full_name)}<br><small style="color:var(--muted)">${esc(r.student_code)}</small></td>
        <td>${fmtDate(r.request_date)}</td>
        <td><div class="row-btns">
          <button class="btn primary" data-request-action="approve" data-request-id="${r.id}">Approve &amp; Issue</button>
          <button class="btn danger" data-request-action="reject" data-request-id="${r.id}">Decline</button>
        </div></td>
      </tr>`).join('')}
    </table></div>` : '<div class="empty"><div class="big">📭</div><p>No pending borrow requests.</p></div>'}
  </div>`;
}

// ---------- STUDENT BOOK REQUESTS ----------
async function renderBookRequests() {
  const requests = await api('/admin/book-requests');
  content.innerHTML = `<div class="panel"><h3>Books students are looking for</h3>
    <p class="hint">When a requested title has an available copy in the catalog, select it and send the student a notification.</p>
    ${requests.length ? `<div class="table-wrap"><table>
      <tr><th>Requested book</th><th>Student</th><th>Date</th><th>Status / Action</th></tr>
      ${requests.map(r => `<tr>
        <td><b>${esc(r.title)}</b>${r.author ? `<br><small style="color:var(--muted)">by ${esc(r.author)}</small>` : ''}
          ${r.notes ? `<br><small style="color:var(--muted)">${esc(r.notes)}</small>` : ''}
        </td>
        <td>${esc(r.full_name)}<br><small style="color:var(--muted)">${esc(r.student_code)}</small></td>
        <td>${fmtDate(r.request_date)}</td>
        <td>${r.status === 'notified'
          ? `<span class="tag ok">Notified ${esc(r.notified_date)}</span><br><small>${esc(r.notifiedBook)}</small>`
          : r.availableBooks.length
            ? `<select id="bookMatch-${r.id}" aria-label="Available matching book">${r.availableBooks.map(b => `<option value="${b.id}">${esc(b.title)} — ${esc(b.author)} (${b.available_copies} available)</option>`).join('')}</select>
              <button class="btn primary" data-notify-book-request="${r.id}">Notify student</button>`
            : '<span class="tag warn">Waiting for book to become available</span>'}
        </td>
      </tr>`).join('')}
    </table></div>` : '<div class="empty"><div class="big">📭</div><p>No student book requests yet.</p></div>'}
  </div>`;
}

// ---------- LOANS & RETURNS ----------
let loanFilter = 'active';
async function renderLoans() {
  const data = await api('/admin/loans?status=' + loanFilter);
  content.innerHTML = `
    <div class="toolbar"><select id="lf">
      <option value="all">All loans</option><option value="active">Active loans</option>
      <option value="overdue">Overdue</option><option value="returned">Returned</option></select></div>
    <div class="panel">${data.loans.length ? `<div class="table-wrap"><table>
      <tr><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th>Status</th><th>Action</th></tr>
      ${loanRows(data.loans, data.today, true)}</table></div>`
      : '<div class="empty"><div class="big">📭</div><p>No loans to show.</p></div>'}</div>`;
  $('#lf').value = loanFilter;
  $('#lf').onchange = e => { loanFilter = e.target.value; renderLoans(); };
}

// ---------- STUDENTS ----------
let studentSearch = '';
async function renderStudents() {
  content.innerHTML = `
    <div class="toolbar"><div class="search"><span>🔍 Search</span><input id="sq" placeholder="Search name, student ID or email..." value="${esc(studentSearch)}"></div></div>
    <div class="panel"><div class="table-wrap" id="stTable"></div></div>`;
  let t; $('#sq').oninput = e => { studentSearch = e.target.value; clearTimeout(t); t = setTimeout(loadStudents, 250); };
  loadStudents();
}
async function loadStudents() {
  const list = await api('/admin/students?q=' + encodeURIComponent(studentSearch));
  $('#stTable').innerHTML = list.length ? `<table>
    <tr><th>Student</th><th>ID</th><th>Department</th><th>Year</th><th>Email</th><th>Phone</th><th>Books</th></tr>
    ${list.map(s => `<tr><td><span class="avatar" style="display:inline-grid;width:30px;height:30px;font-size:12px;margin-right:8px;vertical-align:middle">${esc(initials(s.full_name))}</span>${esc(s.full_name)}</td>
      <td>${esc(s.student_id)}</td><td>${esc(s.department)}</td><td>${esc(s.year)}</td><td>${esc(s.email)}</td><td>${esc(s.phone)}</td>
      <td><span class="tag ${s.active_loans ? 'cat' : 'ok'}">${s.active_loans} borrowed</span></td></tr>`).join('')}</table>`
    : '<div class="empty"><div class="big">🎓</div><p>No students found.</p></div>';
}

// ---------- PROFILE ----------
async function renderProfile() {
  me = await api('/auth/me');
  content.innerHTML = `
    <div class="panel" style="max-width:760px">
      <div class="profile-head"><div class="avatar">${esc(initials(me.full_name))}</div>
        <div><h2>${esc(me.full_name)}</h2><p>Role: <span class="role-tag">${esc(me.role_title)}</span></p><p>ID: ${esc(me.lib_id)}</p></div></div>
      <div class="info-grid">
        <div class="info"><small>Librarian name</small><b>${esc(me.full_name)}</b></div>
        <div class="info"><small>Librarian ID</small><b>${esc(me.lib_id)}</b></div>
        <div class="info"><small>Email address</small><b>${esc(me.email)}</b></div>
        <div class="info"><small>Library / Department</small><b>${esc(me.department)}</b></div>
        <div class="info"><small>Contact phone</small><b>${esc(me.phone)}</b></div>
        <div class="info"><small>System role</small><b>Administrator</b></div>
      </div>
      <div class="row-btns">
        <button class="btn primary" id="editP">✏️ Edit Profile</button>
        <button class="btn" id="pwP">🔑 Change Password</button>
        <button class="btn danger" id="outP">🚪 Logout</button>
      </div>
    </div>`;
  $('#editP').onclick = () => editProfileModal(me, false, async () => { me = await api('/auth/me'); setupShell(me); renderProfile(); });
  $('#pwP').onclick = changePasswordModal;
  $('#outP').onclick = logout;
}
