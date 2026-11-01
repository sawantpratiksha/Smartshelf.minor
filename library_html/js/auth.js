// ============================================================
//  AUTH.JS - logic for Login page and Register page
// ============================================================
const msg = document.getElementById('msg');

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = 'msg ' + type;
}
function goToDashboard(role) {
  location.href = role === 'librarian' ? 'admin/dashboard.html' : 'student/dashboard.html';
}

// ---------------- LOGIN PAGE ----------------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  let role = 'student';
  const demos = { student: ['student', 'student123'], librarian: ['admin', 'admin123'] };

  // already logged in? go to dashboard
  const sess = getSession();
  if (sess && currentUser(sess)) goToDashboard(sess.role);

  function setRole(r) {
    role = r;
    document.getElementById('tabStudent').classList.toggle('active', r === 'student');
    document.getElementById('tabLibrarian').classList.toggle('active', r === 'librarian');
    document.getElementById('loginBtn').textContent = 'Login as ' + (r === 'student' ? 'Student' : 'Librarian');
    document.getElementById('demoText').textContent = demos[r].join(' / ');
    document.getElementById('registerLink').style.display = r === 'student' ? 'block' : 'none';
    msg.className = 'msg';
  }
  document.getElementById('tabStudent').onclick = () => setRole('student');
  document.getElementById('tabLibrarian').onclick = () => setRole('librarian');
  document.getElementById('demo').onclick = () => {
    document.getElementById('username').value = demos[role][0];
    document.getElementById('password').value = demos[role][1];
  };

  const params = new URLSearchParams(location.search);
  if (params.get('role') === 'librarian') setRole('librarian');
  if (params.get('registered')) showMsg('Registration successful! Please login.', 'success');

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      // handleRequest checks the username + password against the database (api.js)
      const data = await handleRequest('/auth/login', 'POST', {
        role,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      });
      goToDashboard(data.role);
    } catch (err) {
      showMsg(err.message, 'error');
    }
  });
}

// ---------------- REGISTER PAGE ----------------
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const v = id => document.getElementById(id).value.trim();
    if (document.getElementById('password').value !== document.getElementById('confirm').value)
      return showMsg('Passwords do not match', 'error');

    try {
      const data = await handleRequest('/auth/register', 'POST', {
        full_name: v('full_name'), student_id: v('student_id'), email: v('email'), phone: v('phone'),
        department: v('department'), year: v('year'), username: v('username'),
        password: document.getElementById('password').value,
      });
      showMsg(data.message, 'success');
      setTimeout(() => (location.href = 'login.html?registered=1'), 1200);
    } catch (err) {
      showMsg(err.message, 'error');
    }
  });
}
