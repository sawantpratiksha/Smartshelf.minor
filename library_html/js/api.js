// ============================================================
//  API.JS  -  THE LIBRARY LOGIC (replaces the server)
//
//  The pages call  api('/books', 'GET')  etc.  This file answers those
//  calls by reading / writing the tables in db.js.
//  Each block below is one feature:
//     route(method, path, who-can-use-it, function)
// ============================================================
const MAX_LOANS = 5;     // a student can hold 5 books at a time
const LOAN_DAYS = 14;    // normal borrowing time

const routes = [];
function addRoute(method, pattern, role, handler) {
  routes.push({
    method, role, handler,
    regex: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'),
    keys: [...pattern.matchAll(/:(\w+)/g)].map(m => m[1]),
  });
}
function fail(message) { throw new Error(message); }

// ---------- who is logged in ----------
function getSession() {
  try { return JSON.parse(localStorage.getItem('ss_session')); } catch (e) { return null; }
}
function currentUser(s) {
  return DB.get(s.role === 'librarian' ? 'librarians' : 'students').find(u => u.id === s.id);
}
function notify(userId, message) {
  DB.insert('notifications', { user_type: 'student', user_id: userId, message, is_read: 0, created_at: new Date().toLocaleString() });
}
const findBook = id => DB.get('books').find(b => b.id === Number(id));

// ---------- main entry used by the pages ----------
async function handleRequest(path, method, body) {
  const [p, qs] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(p);
    if (!m) continue;

    let session = null;
    if (r.role) {
      session = getSession();
      if (!session || !currentUser(session)) { const e = new Error('Please login first'); e.auth = true; throw e; }
      if (r.role !== 'any' && session.role !== r.role) fail('Access denied');
    }
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return r.handler({ body, query, params, session });
  }
  fail('Not found: ' + p);
}

// ============================================================
//  1. REGISTER + LOGIN
// ============================================================
addRoute('POST', '/auth/register', null, ({ body: b }) => {
  const need = ['full_name', 'student_id', 'email', 'department', 'year', 'phone', 'username', 'password'];
  for (const f of need) if (!String(b[f] || '').trim()) fail('Please fill all fields');
  if (!/^\S+@\S+\.\S+$/.test(b.email)) fail('Enter a valid email');
  if (b.username.trim().length < 3) fail('Username must be at least 3 characters');
  if (b.password.length < 6) fail('Password must be at least 6 characters');

  const username = b.username.trim().toLowerCase();
  const students = DB.get('students');
  if (students.some(s => s.username === username) || DB.get('librarians').some(l => l.username === username)) fail('Username already taken');
  if (students.some(s => s.student_id === b.student_id.trim())) fail('Student ID already registered');
  if (students.some(s => s.email === b.email.trim().toLowerCase())) fail('Email already registered');

  DB.insert('students', {
    student_id: b.student_id.trim(), full_name: b.full_name.trim(), email: b.email.trim().toLowerCase(),
    department: b.department, year: b.year, phone: b.phone.trim(), username,
    password_hash: hashPassword(b.password), notifications: 1, reminders: 1,
  });
  return { message: 'Registration successful! Please login.' };
});

addRoute('POST', '/auth/login', null, ({ body }) => {
  const { role, username, password } = body;
  if (!['student', 'librarian'].includes(role) || !username || !password) fail('Enter username and password');
  const users = DB.get(role === 'librarian' ? 'librarians' : 'students');
  const user = users.find(u => u.username === String(username).trim().toLowerCase());
  // check the username AND password match what is saved in the database
  if (!user || user.password_hash !== hashPassword(password)) fail('Invalid username or password');
  localStorage.setItem('ss_session', JSON.stringify({ role, id: user.id }));
  return { role, name: user.full_name };
});

addRoute('POST', '/auth/logout', 'any', () => {
  localStorage.removeItem('ss_session');
  return { message: 'Logged out' };
});

addRoute('GET', '/auth/me', 'any', ({ session }) => {
  const u = { ...currentUser(session) };
  delete u.password_hash;
  return { role: session.role, ...u };
});

// ============================================================
//  2. PROFILE, PASSWORD, SETTINGS, NOTIFICATIONS
// ============================================================
addRoute('PUT', '/auth/profile', 'any', ({ body: b, session }) => {
  if (!String(b.full_name || '').trim() || !/^\S+@\S+\.\S+$/.test(b.email || '')) fail('Name and a valid email are required');
  const table = session.role === 'librarian' ? 'librarians' : 'students';
  const rows = DB.get(table);
  const email = b.email.trim().toLowerCase();
  if (rows.some(u => u.email === email && u.id !== session.id)) fail('That email is already used');
  const u = rows.find(x => x.id === session.id);
  u.full_name = b.full_name.trim(); u.email = email; u.department = b.department || ''; u.phone = b.phone || '';
  if (session.role === 'student') u.year = b.year || '';
  DB.save(table, rows);
  return { message: 'Profile updated' };
});

addRoute('POST', '/auth/password', 'any', ({ body, session }) => {
  if (!body.next || body.next.length < 6) fail('New password must be at least 6 characters');
  const table = session.role === 'librarian' ? 'librarians' : 'students';
  const rows = DB.get(table);
  const u = rows.find(x => x.id === session.id);
  if (u.password_hash !== hashPassword(body.current || '')) fail('Current password is wrong');
  u.password_hash = hashPassword(body.next);
  DB.save(table, rows);
  return { message: 'Password changed' };
});

addRoute('PUT', '/auth/settings', 'student', ({ body, session }) => {
  const rows = DB.get('students');
  const u = rows.find(x => x.id === session.id);
  u.notifications = body.notifications ? 1 : 0;
  u.reminders = body.reminders ? 1 : 0;
  DB.save('students', rows);
  return { message: 'Settings saved' };
});

// create "due soon / overdue" reminders for a student (only if they turned reminders on)
function addReminders(student) {
  if (!student.notifications || !student.reminders) return;
  const books = DB.get('books');
  const limit = addDays(today(), 2);
  DB.get('loans').filter(l => l.student_id === student.id && l.status === 'issued' && l.due_date <= limit).forEach(l => {
    const title = books.find(b => b.id === l.book_id)?.title;
    const msg = l.due_date < today()
      ? `⚠️ Overdue: "${title}" was due on ${l.due_date}`
      : `⏰ Reminder: "${title}" is due on ${l.due_date}`;
    const exists = DB.get('notifications').some(n => n.user_id === student.id && n.message === msg);
    if (!exists) notify(student.id, msg);
  });
}

addRoute('GET', '/auth/notifications', 'any', ({ session }) => {
  if (session.role === 'student') addReminders(currentUser(session));
  const list = DB.get('notifications')
    .filter(n => n.user_type === session.role && n.user_id === session.id)
    .sort((a, b) => b.id - a.id).slice(0, 30);
  return { unread: list.filter(n => !n.is_read).length, list };
});

addRoute('POST', '/auth/notifications/read', 'any', ({ session }) => {
  const rows = DB.get('notifications');
  rows.forEach(n => { if (n.user_type === session.role && n.user_id === session.id) n.is_read = 1; });
  DB.save('notifications', rows);
  return { message: 'ok' };
});

// ============================================================
//  3. BROWSE / SEARCH BOOKS
// ============================================================
addRoute('GET', '/books/categories', 'any', () => {
  return [...new Set(DB.get('books').map(b => b.category))].sort();
});

addRoute('GET', '/books', 'any', ({ query, session }) => {
  const q = (query.q || '').trim().toLowerCase();
  const wished = session.role === 'student'
    ? DB.get('wishlist').filter(w => w.student_id === session.id).map(w => w.book_id) : [];
  const loans = session.role === 'student'
    ? DB.get('loans').filter(l => l.student_id === session.id && ['pending', 'issued'].includes(l.status)) : [];
  return DB.get('books')
    .filter(b => !q || [b.title, b.author, b.isbn, b.book_id].some(v => String(v || '').toLowerCase().includes(q)))
    .filter(b => !query.category || query.category === 'All' || b.category === query.category)
    .filter(b => query.availability === 'available' ? b.available_copies > 0
               : query.availability === 'unavailable' ? b.available_copies === 0 : true)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(b => ({
      ...b,
      wished: wished.includes(b.id) ? 1 : 0,
      requestStatus: loans.find(l => l.book_id === b.id)?.status || '',
    }));
});

// ============================================================
//  4. STUDENT: summary, my books, borrow, wishlist
// ============================================================
addRoute('GET', '/student/summary', 'student', ({ session }) => {
  const t = today();
  const mine = DB.get('loans').filter(l => l.student_id === session.id && l.status === 'issued');
  return {
    active: mine.length,
    dueSoon: mine.filter(l => l.due_date >= t && l.due_date <= addDays(t, 3)).length,
    overdue: mine.filter(l => l.due_date < t).length,
    wishlist: DB.get('wishlist').filter(w => w.student_id === session.id).length,
    today: t,
  };
});

addRoute('GET', '/student/loans', 'student', ({ session }) => {
  const books = DB.get('books');
  const loans = DB.get('loans').filter(l => l.student_id === session.id)
    .sort((a, b) => (a.status === 'issued' ? 0 : 1) - (b.status === 'issued' ? 0 : 1) || b.id - a.id)
    .map(l => { const b = books.find(x => x.id === l.book_id) || {}; return { ...l, title: b.title, author: b.author, cover: b.cover, book_code: b.book_id }; });
  return { today: today(), loans };
});

addRoute('POST', '/student/borrow/:id', 'student', ({ params, session }) => {
  const books = DB.get('books');
  const book = books.find(b => b.id === Number(params.id));
  if (!book) fail('Book not found');
  if (book.available_copies < 1) fail('No copies available right now');

  const loans = DB.get('loans');
  const mine = loans.filter(l => l.student_id === session.id);
  const active = mine.filter(l => l.status === 'issued');
  const pending = mine.filter(l => l.status === 'pending');
  if (active.length + pending.length >= MAX_LOANS) fail(`You can have only ${MAX_LOANS} active or pending book requests at a time`);
  if (mine.some(l => l.book_id === book.id && ['issued', 'pending'].includes(l.status))) {
    fail('You already have this book borrowed or awaiting approval');
  }

  DB.insert('loans', {
    book_id: book.id, student_id: session.id, request_date: today(),
    issue_date: null, due_date: null, return_date: null, status: 'pending',
  });
  notify(session.id, `📚 Your request to borrow "${book.title}" was sent to the librarian.`);
  return { message: `Your request for "${book.title}" was sent to the librarian for approval.` };
});

function normalizeBookTitle(title) {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

addRoute('GET', '/student/book-requests', 'student', ({ session }) => {
  const books = DB.get('books');
  return DB.get('book_requests')
    .filter(r => r.student_id === session.id)
    .sort((a, b) => b.id - a.id)
    .map(r => ({
      ...r,
      notifiedBook: books.find(b => b.id === r.notified_book_id)?.title || '',
    }));
});

addRoute('POST', '/student/book-requests', 'student', ({ body, session }) => {
  const title = String(body.title || '').trim();
  const author = String(body.author || '').trim();
  const notes = String(body.notes || '').trim();
  if (!title) fail('Enter the book title you are looking for');
  if (title.length > 150 || author.length > 120 || notes.length > 500) fail('Please keep the title, author, and details within the allowed length');
  if (DB.get('books').some(b => normalizeBookTitle(b.title) === normalizeBookTitle(title))) {
    fail('This title is already in the library catalog. Try Browse Books first.');
  }

  const requests = DB.get('book_requests');
  const duplicate = requests.some(r =>
    r.student_id === session.id &&
    ['pending', 'notified'].includes(r.status) &&
    normalizeBookTitle(r.title) === normalizeBookTitle(title)
  );
  if (duplicate) fail('You already have an open request for this title');

  DB.insert('book_requests', {
    student_id: session.id, title, author, notes, status: 'pending', request_date: today(),
    notified_book_id: null, notified_date: null,
  });
  return { message: `Your request for "${title}" was sent to the librarian.` };
});

addRoute('GET', '/student/wishlist', 'student', ({ session }) => {
  const ids = DB.get('wishlist').filter(w => w.student_id === session.id).map(w => w.book_id);
  return DB.get('books').filter(b => ids.includes(b.id)).map(b => ({ ...b, wished: 1 })).sort((a, b) => a.title.localeCompare(b.title));
});
addRoute('POST', '/student/wishlist/:id', 'student', ({ params, session }) => {
  const id = Number(params.id);
  const rows = DB.get('wishlist');
  if (!rows.some(w => w.student_id === session.id && w.book_id === id)) {
    rows.push({ student_id: session.id, book_id: id });
    DB.save('wishlist', rows);
  }
  return { message: 'Added to wishlist' };
});
addRoute('DELETE', '/student/wishlist/:id', 'student', ({ params, session }) => {
  DB.save('wishlist', DB.get('wishlist').filter(w => !(w.student_id === session.id && w.book_id === Number(params.id))));
  return { message: 'Removed from wishlist' };
});

// ============================================================
//  5. LIBRARIAN: dashboard numbers
// ============================================================
function loansWithNames(list) {
  const books = DB.get('books'), students = DB.get('students');
  return list.map(l => {
    const b = books.find(x => x.id === l.book_id) || {};
    const s = students.find(x => x.id === l.student_id) || {};
    return { ...l, title: b.title, cover: b.cover, full_name: s.full_name, student_code: s.student_id };
  });
}

addRoute('GET', '/admin/stats', 'librarian', () => {
  const t = today();
  const books = DB.get('books'), loans = DB.get('loans');
  const active = loans.filter(l => l.status === 'issued');
  return {
    totalBooks: books.length,
    available: books.reduce((sum, b) => sum + b.available_copies, 0),
    students: DB.get('students').length,
    activeLoans: active.length,
    overdue: active.filter(l => l.due_date < t).length,
    recent: loansWithNames(loans.filter(l => l.status === 'issued' || l.status === 'returned').sort((a, b) => b.id - a.id).slice(0, 6)),
    overdueList: loansWithNames(active.filter(l => l.due_date < t).sort((a, b) => a.due_date.localeCompare(b.due_date))),
    today: t,
  };
});

// ============================================================
//  6. LIBRARIAN: add / edit / delete books
// ============================================================
function readBook(b) {
  const copies = parseInt(b.total_copies, 10);
  if (!String(b.book_id || '').trim() || !String(b.title || '').trim() || !String(b.author || '').trim()) fail('Book ID, title and author are required');
  if (!copies || copies < 1) fail('Copies must be 1 or more');
  return {
    book_id: b.book_id.trim(), title: b.title.trim(), author: b.author.trim(),
    publisher: (b.publisher || '').trim(), isbn: (b.isbn || '').trim(),
    category: b.category || 'Other', shelf: (b.shelf || '').trim(),
    total_copies: copies, cover: b.cover || '📘',
  };
}

addRoute('POST', '/admin/books', 'librarian', ({ body }) => {
  const d = readBook(body);
  if (DB.get('books').some(b => b.book_id === d.book_id)) fail('This Book ID already exists');
  DB.insert('books', { ...d, available_copies: d.total_copies });
  return { message: 'Book added successfully' };
});

addRoute('PUT', '/admin/books/:id', 'librarian', ({ body, params }) => {
  const books = DB.get('books');
  const old = books.find(b => b.id === Number(params.id));
  if (!old) fail('Book not found');
  const d = readBook(body);
  if (books.some(b => b.book_id === d.book_id && b.id !== old.id)) fail('This Book ID already exists');
  const issued = old.total_copies - old.available_copies;
  if (d.total_copies < issued) fail(`${issued} copies are currently issued. Copies cannot be less than that.`);
  Object.assign(old, d, { available_copies: d.total_copies - issued });
  DB.save('books', books);
  return { message: 'Book updated' };
});

addRoute('DELETE', '/admin/books/:id', 'librarian', ({ params }) => {
  const id = Number(params.id);
  const loans = DB.get('loans');
  if (loans.some(l => l.book_id === id && l.status === 'issued')) fail('This book is currently issued to a student');
  if (loans.some(l => l.book_id === id && l.status === 'pending')) fail('Resolve pending borrow requests before deleting this book');
  DB.save('books', DB.get('books').filter(b => b.id !== id));
  DB.save('loans', loans.filter(l => l.book_id !== id));
  DB.save('wishlist', DB.get('wishlist').filter(w => w.book_id !== id));
  return { message: 'Book deleted' };
});

// ============================================================
//  7. LIBRARIAN: students, loans, issue, return
// ============================================================
addRoute('GET', '/admin/students', 'librarian', ({ query }) => {
  const q = (query.q || '').trim().toLowerCase();
  const loans = DB.get('loans');
  return DB.get('students')
    .filter(s => !q || [s.full_name, s.student_id, s.email].some(v => String(v).toLowerCase().includes(q)))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map(s => { const x = { ...s, active_loans: loans.filter(l => l.student_id === s.id && l.status === 'issued').length }; delete x.password_hash; return x; });
});

addRoute('GET', '/admin/loans', 'librarian', ({ query }) => {
  const t = today();
  let list = DB.get('loans').filter(l => l.status === 'issued' || l.status === 'returned');
  if (query.status === 'active') list = list.filter(l => l.status === 'issued');
  if (query.status === 'returned') list = list.filter(l => l.status === 'returned');
  if (query.status === 'overdue') list = list.filter(l => l.status === 'issued' && l.due_date < t);
  return { today: t, loans: loansWithNames([...list].sort((a, b) => b.id - a.id)) };
});

addRoute('GET', '/admin/borrow-requests', 'librarian', () => {
  const pending = DB.get('loans').filter(l => l.status === 'pending').sort((a, b) => a.id - b.id);
  return loansWithNames(pending);
});

function matchingAvailableBooks(request) {
  const title = normalizeBookTitle(request.title);
  const author = normalizeBookTitle(request.author);
  return DB.get('books')
    .filter(book =>
      book.available_copies > 0 &&
      normalizeBookTitle(book.title) === title &&
      (!author || normalizeBookTitle(book.author) === author)
    )
    .map(book => ({ id: book.id, title: book.title, author: book.author, available_copies: book.available_copies }));
}

addRoute('GET', '/admin/book-requests', 'librarian', () => {
  const students = DB.get('students');
  const books = DB.get('books');
  return DB.get('book_requests')
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.id - a.id)
    .map(request => {
      const student = students.find(s => s.id === request.student_id) || {};
      return {
        ...request,
        full_name: student.full_name || 'Unknown student',
        student_code: student.student_id || '',
        availableBooks: request.status === 'pending' ? matchingAvailableBooks(request) : [],
        notifiedBook: books.find(b => b.id === request.notified_book_id)?.title || '',
      };
    });
});

addRoute('POST', '/admin/book-requests/:id/notify', 'librarian', ({ body, params }) => {
  const requests = DB.get('book_requests');
  const request = requests.find(r => r.id === Number(params.id));
  if (!request || request.status !== 'pending') fail('This book request is no longer pending');

  const bookId = Number(body.book_id);
  const book = matchingAvailableBooks(request).find(b => b.id === bookId);
  if (!book) fail('Choose an available catalog book with the requested title');

  const student = DB.get('students').find(s => s.id === request.student_id);
  if (!student) fail('The requesting student could not be found');

  request.status = 'notified';
  request.notified_book_id = book.id;
  request.notified_date = today();
  DB.save('book_requests', requests);
  notify(student.id, `📚 "${book.title}" is now available in the library, matching your book request. You can find it in Browse Books.`);
  return { message: `Availability notification sent to ${student.full_name}.` };
});

addRoute('POST', '/admin/borrow-requests/:id', 'librarian', ({ body, params }) => {
  const loans = DB.get('loans');
  const request = loans.find(l => l.id === Number(params.id) && l.status === 'pending');
  if (!request) fail('This borrow request is no longer pending');

  const books = DB.get('books');
  const book = books.find(b => b.id === request.book_id);
  const student = DB.get('students').find(s => s.id === request.student_id);
  if (!book || !student) fail('The requested book or student could not be found');

  if (body.action === 'reject') {
    request.status = 'rejected';
    DB.save('loans', loans);
    notify(student.id, `Your request to borrow "${book.title}" was declined by the librarian.`);
    return { message: `Request for "${book.title}" declined` };
  }
  if (body.action !== 'approve') fail('Choose approve or reject');
  if (book.available_copies < 1) fail('No copies are available to approve this request');

  const active = loans.filter(l => l.student_id === student.id && l.status === 'issued');
  if (active.length >= MAX_LOANS) fail(`Student already has ${MAX_LOANS} books`);
  if (active.some(l => l.book_id === book.id)) fail('Student already has this book');

  const issueDate = today();
  const due = addDays(issueDate, LOAN_DAYS);
  Object.assign(request, { status: 'issued', issue_date: issueDate, due_date: due });
  book.available_copies -= 1;
  DB.save('loans', loans);
  DB.save('books', books);
  DB.save('wishlist', DB.get('wishlist').filter(w => !(w.student_id === student.id && w.book_id === book.id)));
  notify(student.id, `✅ The librarian approved your request for "${book.title}". Due on ${due}`);
  return { message: `"${book.title}" approved and issued to ${student.full_name}.`, due };
});

addRoute('POST', '/admin/issue', 'librarian', ({ body }) => {
  const student = DB.get('students').find(s => s.id === Number(body.student_id));
  const books = DB.get('books');
  const book = books.find(b => b.id === Number(body.book_id));
  const loans = DB.get('loans');
  if (!student) fail('Select a valid student');
  if (!book) fail('Select a valid book');
  if (!body.due_date || body.due_date < today()) fail('Choose a valid due date');
  if (book.available_copies < 1) fail('No copies available');
  if (loans.some(l => l.student_id === student.id && l.book_id === book.id && l.status === 'pending')) {
    fail('This student has a pending request for this book. Review it in Borrow Requests first.');
  }

  const mine = loans.filter(l => l.student_id === student.id);
  const active = mine.filter(l => l.status === 'issued');
  const pending = mine.filter(l => l.status === 'pending');
  if (active.length + pending.length >= MAX_LOANS) fail(`Student already has ${MAX_LOANS} active or pending books`);
  if (active.some(l => l.book_id === book.id)) fail('Student already has this book');

  DB.insert('loans', { book_id: book.id, student_id: student.id, issue_date: today(), due_date: body.due_date, return_date: null, status: 'issued' });
  book.available_copies -= 1;
  DB.save('books', books);
  notify(student.id, `📚 Librarian issued "${book.title}" to you. Due on ${body.due_date}`);
  return { message: `"${book.title}" issued to ${student.full_name}` };
});

addRoute('POST', '/admin/return/:id', 'librarian', ({ params }) => {
  const loans = DB.get('loans');
  const loan = loans.find(l => l.id === Number(params.id));
  if (!loan || loan.status !== 'issued') fail('This loan is not active');
  const books = DB.get('books');
  const book = books.find(b => b.id === loan.book_id);
  loan.status = 'returned'; loan.return_date = today();
  if (book) book.available_copies += 1;
  DB.save('loans', loans);
  DB.save('books', books);
  notify(loan.student_id, `✅ "${book ? book.title : 'Book'}" was returned. Thank you!`);
  return { message: 'Book returned' };
});
