// ============================================================
//  DB.JS  -  THE DATABASE (very simple)
//
//  Think of the database as Excel sheets. Each sheet is a "table":
//     students, librarians, books, loans, book_requests, wishlist, notifications
//  Every table is a list of rows, saved in the browser (localStorage),
//  so the data stays even after you close the page.
//
//  Only 2 things you need to know:
//     DB.get('books')            -> gives the list (all rows) of a table
//     DB.save('books', rows)     -> saves the list back
//
//  To RESET the whole database: open the browser console and run
//     DB.reset()
// ============================================================
const DB = {
  get(table) {
    try { return JSON.parse(localStorage.getItem('ss_' + table)) || []; }
    catch (e) { return []; }
  },
  save(table, rows) {
    localStorage.setItem('ss_' + table, JSON.stringify(rows));
  },
  // next free id for a new row (1, 2, 3 ...)
  nextId(rows) {
    return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  },
  // add one row to a table and return it
  insert(table, row) {
    const rows = DB.get(table);
    row.id = DB.nextId(rows);
    rows.push(row);
    DB.save(table, rows);
    return row;
  },
  reset() {
    ['students', 'librarians', 'books', 'loans', 'book_requests', 'wishlist', 'notifications', 'seeded', 'session']
      .forEach(t => localStorage.removeItem('ss_' + t));
    location.reload();
  },
};

// ---------- Simple password scrambling (so the password is not stored as plain text) ----------
function hashPassword(pw) {
  let h = 5381;
  for (const ch of String(pw)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return 'h' + h.toString(16) + '_' + String(pw).length;
}

// ---------- Date helpers (format YYYY-MM-DD) ----------
function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ---------- Demo data (added only the first time) ----------
if (!localStorage.getItem('ss_seeded')) {
  DB.save('librarians', [{
    id: 1, lib_id: 'LIB001', full_name: 'Mr. Rajesh Verma', email: 'rajesh.verma@college.edu',
    department: 'Library', phone: '+91 98123 45678', role_title: 'Head Librarian',
    username: 'admin', password_hash: hashPassword('admin123'),
  }]);

  DB.save('students', [{
    id: 1, student_id: 'STU2024001', full_name: 'Aditi Sharma', email: 'aditi.sharma@college.edu',
    department: 'Computer Science', year: '3rd Year', phone: '+91 90000 11111',
    username: 'student', password_hash: hashPassword('student123'), notifications: 1, reminders: 1,
  }]);

  //   book_id, title, author, publisher, isbn, category, shelf, copies, cover
  const seed = [
    ['TEST_CS99', 'Intro to Neural Networks', 'Andrew Ng', 'Stanford Press', '978-0000000011', 'Coding', 'A1', 3, '📘'],
    ['B012', '1984', 'George Orwell', 'Secker & Warburg', '978-0451524935', 'Literature', 'C2', 5, '📗'],
    ['B001', 'Clean Code', 'Robert C. Martin', 'Prentice Hall', '978-0132350884', 'Coding', 'A2', 4, '📙'],
    ['B002', 'The Pragmatic Programmer', 'Andrew Hunt', 'Addison-Wesley', '978-0135957059', 'Coding', 'A2', 3, '📕'],
    ['B003', 'Introduction to Algorithms', 'Thomas Cormen', 'MIT Press', '978-0262033848', 'Coding', 'A3', 2, '📘'],
    ['B004', 'Python Crash Course', 'Eric Matthes', 'No Starch Press', '978-1593279288', 'Coding', 'A3', 4, '🐍'],
    ['B005', 'Nature - Weekly Journal', 'Nature Editors', 'Springer Nature', '978-0000000005', 'Journals', 'J1', 2, '📰'],
    ['B006', 'IEEE Computer Journal', 'IEEE', 'IEEE', '978-0000000006', 'Journals', 'J1', 2, '📑'],
    ['B007', 'To Kill a Mockingbird', 'Harper Lee', 'J. B. Lippincott', '978-0061120084', 'Literature', 'C1', 3, '📗'],
    ['B008', 'Pride and Prejudice', 'Jane Austen', 'T. Egerton', '978-0141439518', 'Literature', 'C1', 2, '📖'],
    ['B009', 'National Geographic', 'NatGeo Society', 'NatGeo', '978-0000000009', 'Magazines', 'M1', 3, '🗞️'],
    ['B010', 'Wired Magazine', 'Wired Staff', 'Condé Nast', '978-0000000010', 'Magazines', 'M1', 2, '📓'],
  ];
  DB.save('books', seed.map((b, i) => ({
    id: i + 1, book_id: b[0], title: b[1], author: b[2], publisher: b[3], isbn: b[4],
    category: b[5], shelf: b[6], total_copies: b[7], available_copies: b[7], cover: b[8],
  })));

  DB.save('loans', []);
  DB.save('wishlist', []);
  DB.save('notifications', []);
  localStorage.setItem('ss_seeded', '1');
}
