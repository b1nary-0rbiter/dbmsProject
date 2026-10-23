# PARATHI — Full Project Report

## 1. Project Overview

PARATHI is a web-based Public Complaint Management System developed as a Database Management Systems (DBMS) course project. The system enables citizens to submit grievances to government departments, track complaint status in real time, and receive updates, while officers from different departments manage, resolve, and forward complaints assigned to their offices. It demonstrates relational database design, normalization, foreign key relationships, complex SQL queries, and role-based access control in a real-world full-stack application.

## 2. Objectives

- Design and implement a normalized relational database schema with foreign key constraints
- Build a RESTful API backend that executes SQL queries against SQLite
- Create a responsive frontend for citizens and officers with role-based views
- Demonstrate CRUD operations, JOINs, GROUP BY aggregates, and datetime functions
- Implement complaint routing, status tracking with history, and file attachments
- Enforce access control at the SQL level (officers only see their office's complaints)

## 3. Technologies Used

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend Runtime | Node.js (v20+) | Server-side JavaScript execution |
| Web Framework | Express.js 4.x | HTTP routing, middleware, static file serving |
| Database | SQLite (via sql.js) | File-based relational database |
| Frontend Structure | HTML5 | Page layout and content |
| Frontend Styling | CSS3 | Responsive design, cards, forms, badges, modals |
| Frontend Logic | Vanilla JavaScript (ES6+) | DOM manipulation, API calls, form handling, navigation |
| Authentication | JSON Web Tokens (JWT) | Stateless session tokens for login |
| Password Security | bcryptjs | Password hashing and comparison |
| File Uploads | Multer | Handles multipart form data for complaint attachments |
| Environment Config | process.env | PORT, HOST, JWT_SECRET configuration |

## 4. Database Design

### 4.1 Tables

**offices** — Government departments
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| name | TEXT | NOT NULL |
| office_type | TEXT | NOT NULL |
| district | TEXT | NOT NULL |
| address | TEXT | NOT NULL |
| latitude | REAL | NOT NULL |
| longitude | REAL | NOT NULL |
| email | TEXT | |

**users** — Citizens and officers
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| full_name | TEXT | NOT NULL |
| email | TEXT | UNIQUE, NOT NULL |
| phone | TEXT | |
| password_hash | TEXT | NOT NULL |
| role | TEXT | NOT NULL, CHECK(role IN ('citizen','officer')) |
| office_id | INTEGER | FK → offices.id |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP |

**complaints** — Submitted complaints
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| tracking_code | TEXT | UNIQUE, NOT NULL |
| citizen_id | INTEGER | NOT NULL, FK → users.id |
| office_id | INTEGER | NOT NULL, FK → offices.id |
| subject | TEXT | NOT NULL |
| description | TEXT | NOT NULL |
| location_text | TEXT | NOT NULL |
| latitude | REAL | |
| longitude | REAL | |
| attachment | TEXT | |
| status | TEXT | NOT NULL, DEFAULT 'Submitted' |
| priority | TEXT | NOT NULL, DEFAULT 'Normal' |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TEXT | DEFAULT CURRENT_TIMESTAMP |

**complaint_history** — Status change timeline
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| complaint_id | INTEGER | NOT NULL, FK → complaints.id |
| actor_id | INTEGER | NOT NULL, FK → users.id |
| status | TEXT | NOT NULL |
| note | TEXT | |
| from_office_id | INTEGER | FK → offices.id |
| to_office_id | INTEGER | FK → offices.id |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP |

### 4.2 Foreign Key Relationships

| Child Table | FK Column | Parent Table | Parent PK |
|-------------|-----------|--------------|-----------|
| users | office_id | offices | id |
| complaints | citizen_id | users | id |
| complaints | office_id | offices | id |
| complaint_history | complaint_id | complaints | id |
| complaint_history | actor_id | users | id |
| complaint_history | from_office_id | offices | id |
| complaint_history | to_office_id | offices | id |

### 4.3 Normalization
- **1NF:** All attributes are atomic. Complaint history separated into its own table.
- **2NF:** No partial dependencies. Each table's non-key attributes depend on the entire primary key.
- **3NF:** No transitive dependencies. Office details stored once in offices table, referenced by FK.

## 5. SQL Features Demonstrated

- **CREATE TABLE** with constraints (CHECK, UNIQUE, NOT NULL, FOREIGN KEY)
- **JOINs** — complaints JOIN offices, complaint_history JOIN users
- **GROUP BY** — status counts for dashboards
- **INSERT/UPDATE/DELETE** — complaint submission, status updates, forwarding
- **Datetime functions** — `datetime('now', '-60 seconds')` for duplicate detection
- **Migration** — ALTER TABLE ADD COLUMN, backfill via UPDATE
- **Aggregate functions** — COUNT(*) for statistics

## 6. Key Features

1. **Citizen Portal** — Register, login, submit complaints, track status, view history
2. **Officer Portal** — View assigned complaints, update status, forward to other offices
3. **Complaint Routing** — Manual office selection from dropdown
4. **Status Tracking** — Full timeline with actor, note, and office transfer history
5. **File Attachments** — Upload and view supporting documents (protected by auth)
6. **Role-Based Access** — Citizens see only their complaints; officers see only their office's complaints
7. **Authentication** — JWT tokens with bcrypt password hashing
8. **Profile Page** — View name, email, role, and office ID
9. **Access Control** — Enforced at SQL level, not just UI

## 7. Project Structure

```
parathi/
├── server.js          # Backend: Express server + all SQL queries (~530 lines)
├── package.json       # Dependencies (express, sql.js, bcryptjs, jsonwebtoken, multer)
├── parathi.db         # SQLite database file
├── public/
│   ├── index.html     # Frontend structure
│   ├── app.js         # Frontend logic
│   └── style.css      # Styling
├── uploads/           # User-uploaded attachments
├── credentials.txt    # Login credentials (gitignored)
├── .gitignore
└── README.md
```

## 8. Access Control

Officers can only view complaints where `complaints.office_id = users.office_id`. This is enforced in every SQL query, not just the UI. Cross-office access returns 403/404 at the API level.

## 9. Seed Data

- 5 offices (Municipality, Village Office, Police, KSEB, PWD)
- 6 users (1 citizen + 5 officers)
- 3 sample complaints across different offices

## 10. How to Run

```bash
npm install
npm start
# Open http://localhost:3000
```

## 11. Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Citizen | citizen@parathi | citizen123 |
| Municipality Officer | municipalityofficer@parathi | officer123 |
| Police Officer | policeofficer@parathi | officer123 |
| KSEB Officer | ksebofficer@parathi | officer123 |
| PWD Officer | pwdofficer@parathi | officer123 |
| Village Officer | villageofficer@parathi | officer123 |

## 12. DBMS Concepts Demonstrated

- Entity-Relationship modeling
- Relational schema design with foreign keys
- Normalization (1NF, 2NF, 3NF)
- CRUD operations (Create, Read, Update, Delete)
- JOIN queries across multiple tables
- Aggregate functions (COUNT, GROUP BY)
- Transaction safety (saveDb after every mutation)
- Data integrity via constraints (CHECK, UNIQUE, NOT NULL, FOREIGN KEY)
- Schema migration (ALTER TABLE, backfill)
- Role-based data access (SQL-level filtering)

## 13. Conclusion

PARATHI demonstrates a complete database-driven web application where the database is the core component. The project covers all essential DBMS concepts — from schema design and normalization to complex queries and data integrity — implemented in a real-world public complaint management scenario. The application is production-ready with authentication, file uploads, role-based access, and a responsive frontend.