# PARATHI - Public Complaint Management Portal

A full-stack web application for managing public complaints, built for a Database Management Systems (DBMS) course project.

## Overview

PARATHI is a complaint management portal where citizens can submit grievances, track their status, and officers from different departments can manage and resolve them. It features role-based access control, complaint routing, status tracking with history, and file attachments.

## Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** SQLite (file-based, via sql.js)
- **Frontend:** HTML, CSS, JavaScript (vanilla, no frameworks)
- **Auth:** JWT (JSON Web Tokens) + bcrypt password hashing
- **File Uploads:** Multer

## Features

- Citizen registration and login
- Submit complaints with location, priority, and attachments
- GPS-based office routing
- Officer dashboard with department-specific complaints
- Status updates with timeline/history
- Forward complaints between departments
- Complaint tracking by tracking code
- Role-based access control (citizen vs officer)
- Dark/light UI with responsive design

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `offices` | Government offices (name, type, location, GPS coords) |
| `users` | Citizens and officers (name, email, role, office link) |
| `complaints` | Submitted complaints (subject, description, location, status, priority, attachment) |
| `complaint_history` | Status change timeline (actor, status, note, from/to office) |
| `auth_tokens` | Login sessions (PHP backend only) |

### Relationships
- `complaints.citizen_id` → `users.id`
- `complaints.office_id` → `offices.id`
- `complaint_history.complaint_id` → `complaints.id`
- `complaint_history.actor_id` → `users.id`
- `users.office_id` → `offices.id`

## Default Credentials

### Citizen
- Email: `citizen@parathi`
- Password: `citizen123`

### Officers (password: `officer123` for all)
| Office | Email |
|--------|-------|
| Municipality | `municipalityofficer@parathi` |
| Village Office (Lalam) | `villageofficer@parathi` |
| Police Station | `policeofficer@parathi` |
| KSEB (Electricity) | `ksebofficer@parathi` |
| PWD (Roads) | `pwdofficer@parathi` |

## How to Run

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
http://localhost:3000
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `JWT_SECRET` | `parathi-college-project-secret` | JWT signing secret (change in production) |

## Project Structure

```
parathi/
├── server.js          # Node.js backend (Express + SQLite)
├── package.json       # Dependencies
├── parathi.db         # SQLite database file
├── public/            # Frontend
│   ├── index.html
│   ├── app.js
│   └── style.css
├── uploads/           # User-uploaded attachments
└── .gitignore
```

## Deployment

### Render (recommended)
1. Push to GitHub
2. Create Web Service on Render
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add a Disk (mount path: `/opt/render/project/src`) for `parathi.db`
6. Set env var: `JWT_SECRET=your-secret-key`

## License

MIT - For educational purposes (DBMS course project).