# SmartShelf - Library Management System (Minor Project)

Only **HTML + CSS + JavaScript**. No Node.js, no PHP, nothing to install.

## How to run
Double-click **index.html** (opens in Chrome / Edge / Firefox). That's it.

## Demo logins
| Side      | Username  | Password     |
|-----------|-----------|--------------|
| Student   | `student` | `student123` |
| Librarian | `admin`   | `admin123`   |

New students: login page -> **New user? Register here**.

## The database (very simple)
The database is the file `js/db.js`. Think of it as Excel sheets - every "table" is a list of rows:

| Table           | What it stores                      |
|-----------------|-------------------------------------|
| `students`      | registered students + passwords     |
| `librarians`    | librarian account                   |
| `books`         | all books and copies available      |
| `loans`         | borrow requests and issued/returned books |
| `book_requests` | books students want the library to acquire |
| `wishlist`      | books a student saved               |
| `notifications` | bell messages                       |

Only two commands are used everywhere:
```js
const books = DB.get('books');   // read a table
DB.save('books', books);         // save a table
```
Data is saved inside your browser (localStorage), so it stays after you close the page.
It is stored per browser: data made in Chrome is not visible in Edge.
To SEE the data: open **database_viewer.html** (or click "View Database" at the bottom of the welcome page).
To reset everything: open database_viewer.html and click "Reset database".

## Files (what each one does)
```
library_html/
├── index.html              Welcome page
├── login.html              Login (Student / Librarian) + "New user? Register here"
├── register.html           Student registration
├── database_viewer.html    See all database tables as simple tables
├── student/dashboard.html  Student side page
├── admin/dashboard.html    Librarian side page
├── css/
│   ├── auth.css            Design of welcome, login, register
│   └── app.css             Design of both dashboards (light + dark mode)
└── js/
    ├── db.js               DATABASE: tables + demo data + date/password helpers
    ├── api.js              LOGIC: register, login, borrow, issue, return, add book ...
    ├── common.js           Shared helpers: popups, toast, dark mode, notification bell
    ├── auth.js             Login + register page code
    ├── student.js          Student dashboard screens
    └── admin.js            Librarian dashboard screens
```

## Features
Student: register, login (wrong password -> "Invalid username or password"), Home summary,
Browse Books (search, category chips, availability filter), View / request to borrow, Wishlist,
My Books (pending requests, due + overdue), Profile edit, Settings (notifications, dark/light mode,
reminders, change password), and request books not currently in the catalog.

Librarian: Dashboard stats, Manage Books (add with cover photo / URL / emoji, edit, delete),
Issue Book (7 / 14 / 30 day buttons), approve or decline student borrow requests, review student
book requests and notify them when a matching title is available, Loans & Returns, Students list,
Profile. Borrow requests become active loans only after librarian approval.
