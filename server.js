const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const initSqlJs = require("sql.js");

const app = express();
const PORT = process.env.PORT || 3000;
// Bind to every network interface so other computers can reach the site.
// Override with HOST if you ever want to restrict it (e.g. HOST=127.0.0.1).
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "parathi-college-project-secret";
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "parathi.db");
const UPLOAD_DIR = path.join(ROOT, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let db;

function stmtRows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function all(sql, params = []) { return stmtRows(sql, params); }
function get(sql, params = []) { return stmtRows(sql, params)[0]; }
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
}
function insert(sql, params = []) {
  run(sql, params);
  return Number(get("SELECT last_insert_rowid() AS id").id);
}
function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// Descriptive email addresses for each office's officer account.  The numeric
// prefix scheme ("3.officer@...") is only kept for migrating legacy data.
const OFFICER_EMAILS = {
  1: "municipalityofficer@parathi",
  2: "villageofficer@parathi",
  3: "policeofficer@parathi",
  4: "ksebofficer@parathi",
  5: "pwdofficer@parathi"
};

function createSchema() {
  db.run(`
CREATE TABLE IF NOT EXISTS offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  office_type TEXT NOT NULL,
  district TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  email TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('citizen','officer')),
  office_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(office_id) REFERENCES offices(id)
);
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_code TEXT UNIQUE NOT NULL,
  citizen_id INTEGER NOT NULL,
  office_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  location_text TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  attachment TEXT,
  status TEXT NOT NULL DEFAULT 'Submitted',
  priority TEXT NOT NULL DEFAULT 'Normal',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(citizen_id) REFERENCES users(id),
  FOREIGN KEY(office_id) REFERENCES offices(id)
);
CREATE TABLE IF NOT EXISTS complaint_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  from_office_id INTEGER,
  to_office_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(complaint_id) REFERENCES complaints(id),
  FOREIGN KEY(actor_id) REFERENCES users(id),
  FOREIGN KEY(from_office_id) REFERENCES offices(id),
  FOREIGN KEY(to_office_id) REFERENCES offices(id)
);`);
}

// Older versions of this project had no users.office_id column and derived the
// officer's office from the numeric prefix of their email ("3.officer@...").
// SQLite cannot add a column with a foreign key to an existing table, so the
// column is added here and the legacy mapping is backfilled once.
function ensureColumn(table, column, ddl) {
  const cols = all(`PRAGMA table_info(${table})`);
  if (!cols.some(c => c.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    return true;
  }
  return false;
}

function migrate() {
  // Backfill office_id for legacy databases that predate the column.
  if (ensureColumn("users", "office_id", "INTEGER")) {
    const officers = all("SELECT id,email,office_id FROM users WHERE role='officer'");
    for (const o of officers) {
      if (o.office_id != null) continue;
      const n = Number((o.email || "").split(".")[0]);
      if (Number.isInteger(n) && n > 0 && get("SELECT id FROM offices WHERE id=?", [n])) {
        run("UPDATE users SET office_id=? WHERE id=?", [n, o.id]);
      }
    }
  }
  // Rename legacy officer emails (N.officer@parathi...) to descriptive ones.
  const legacy = all("SELECT id,email FROM users WHERE role='officer'");
  for (const o of legacy) {
    const email = o.email || "";
    const atIdx = email.indexOf(".officer@parathi");
    if (atIdx < 1) continue;
    const prefix = email.slice(0, atIdx);
    if (!/^\d+$/.test(prefix)) continue;
    const n = Number(prefix);
    const newEmail = OFFICER_EMAILS[n];
    if (!newEmail) continue;
    const taken = get("SELECT id FROM users WHERE email=? AND id<>?", [newEmail, o.id]);
    if (taken) continue;
    run("UPDATE users SET email=? WHERE id=?", [newEmail, o.id]);
  }
  // Migrate all @parathi.local addresses to @parathi.
  const locals = all("SELECT id,email FROM users WHERE email LIKE '%@parathi.local'");
  for (const u of locals) {
    const newEmail = (u.email || "").replace("@parathi.local", "@parathi");
    const taken = get("SELECT id FROM users WHERE email=? AND id<>?", [newEmail, u.id]);
    if (taken) continue;
    run("UPDATE users SET email=? WHERE id=?", [newEmail, u.id]);
  }
}

function seed() {
  const officeCount = Number(get("SELECT COUNT(*) AS c FROM offices").c);
  if (!officeCount) {
    const offices = [
      ["Palai Municipality Office", "Local Government / Municipality", "Kottayam", "Municipal Office, Palai", 9.7045, 76.6857, "municipality@parathi"],
      ["Village Office - Lalam", "Village Office", "Kottayam", "Lalam Village Office, Palai", 9.7004, 76.6915, "lalam@parathi"],
      ["Palai Police Station", "Police Station", "Kottayam", "Palai Police Station", 9.7049, 76.6870, "police@parathi"],
      ["KSEB Electrical Section Palai", "Utility / KSEB", "Kottayam", "KSEB Section Office, Palai", 9.7101, 76.6840, "kseb@parathi"],
      ["Public Works Department - Palai", "PWD", "Kottayam", "PWD Office, Palai", 9.7055, 76.6788, "pwd@parathi"]
    ];
    for (const x of offices) insert(`INSERT INTO offices(name,office_type,district,address,latitude,longitude,email) VALUES(?,?,?,?,?,?,?)`, x);
  }
  const userCount = Number(get("SELECT COUNT(*) AS c FROM users").c);
  if (!userCount) {
    const citizen = bcrypt.hashSync("citizen123", 10);
    const officer = bcrypt.hashSync("officer123", 10);
    insert(`INSERT INTO users(full_name,email,phone,password_hash,role,office_id) VALUES(?,?,?,?,?,?)`, ["Demo Citizen", "citizen@parathi", "9876543210", citizen, "citizen", null]);
    for (const o of all("SELECT id,name FROM offices ORDER BY id")) {
      const email = OFFICER_EMAILS[o.id] || `${o.id}.officer@parathi`;
      insert(`INSERT INTO users(full_name,email,phone,password_hash,role,office_id) VALUES(?,?,?,?,?,?)`, [`${o.name} Officer`, email, "", officer, "officer", o.id]);
    }
  }
  // Hardcoded default logins: guarantee they always exist, even if the DB
  // already had users from an earlier run.  Citizen -> citizen123,
  // Officer -> officer123.  The officer's office is stored in users.office_id.
  const defaults = [
    ["Demo Citizen", "citizen@parathi", "9876543210", "citizen123", "citizen", null],
    ["Palai Municipality Office Officer", "municipalityofficer@parathi", "", "officer123", "officer", 1]
  ];
  for (const [full_name, email, phone, password, role, officeId] of defaults) {
    const existing = get("SELECT id,office_id FROM users WHERE email=?", [email]);
    if (!existing) {
      insert(`INSERT INTO users(full_name,email,phone,password_hash,role,office_id) VALUES(?,?,?,?,?,?)`,
        [full_name, email, phone, bcrypt.hashSync(password, 10), role, officeId]);
    } else if (existing.office_id == null && officeId != null) {
      run("UPDATE users SET office_id=? WHERE id=?", [officeId, existing.id]);
    }
  }
  saveDb();
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function nearestOffice(lat, lon, type) {
  let offices = all("SELECT * FROM offices");
  if (type && type !== "auto") {
    const filtered = offices.filter(o => o.office_type.toLowerCase().includes(type.toLowerCase()) || o.name.toLowerCase().includes(type.toLowerCase()));
    if (filtered.length) offices = filtered;
  }
  return offices.sort((a,b)=>distanceKm(lat,lon,a.latitude,a.longitude)-distanceKm(lat,lon,b.latitude,b.longitude))[0];
}
// The office an officer works for. Stored in users.office_id; 0 means the
// account is not linked to any office (never match a complaint).
function ownOfficeId(user) {
  const id = Number(user && user.office_id);
  return Number.isInteger(id) && id > 0 ? id : 0;
}
// Parse a user-supplied number. Returns null for anything that is not a
// finite number, so "abc" is never silently treated as a coordinate.
function toFiniteNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "-" + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// The Content-Type sent by the browser is attacker-controlled, so the real
// file type is decided from the file's magic bytes after it has been written.
const FILE_SIGNATURES = [
  { ext: "jpg",  mime: "image/jpeg",       test: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: "png",  mime: "image/png",        test: b => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
  { ext: "gif",  mime: "image/gif",        test: b => b.slice(0, 6).toString("ascii") === "GIF87a" || b.slice(0, 6).toString("ascii") === "GIF89a" },
  { ext: "bmp",  mime: "image/bmp",        test: b => b.slice(0, 2).toString("ascii") === "BM" },
  { ext: "webp", mime: "image/webp",       test: b => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP" },
  { ext: "pdf",  mime: "application/pdf",  test: b => b.slice(0, 5).toString("ascii") === "%PDF-" },
  { ext: "zip",  mime: "application/zip",  test: b => b[0] === 0x50 && b[1] === 0x4B && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
  { ext: "txt",  mime: "text/plain",       test: b => {
      const head = b.slice(0, 1024);
      if (head.includes(0)) return false;
      let printable = 0;
      for (const byte of head) { if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte !== 127)) printable++; }
      return head.length === 0 || printable / head.length > 0.9;
    } }
];

// Returns the detected type of a saved upload, or null when the content is not
// one of the allowed kinds.
function detectUploadType(filePath) {
  let head;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    head = buf.slice(0, n);
  } catch { return null; }
  for (const sig of FILE_SIGNATURES) if (sig.test(head)) return sig;
  return null;
}

// Give the stored file the extension of its real content, not the one the
// client claimed.
function renameToDetectedExtension(filePath, detected) {
  const currentExt = path.extname(filePath);
  const wantedExt = "." + detected.ext;
  if (currentExt.toLowerCase() === wantedExt) return filePath;
  const target = filePath.slice(0, -currentExt.length) + wantedExt;
  try { fs.renameSync(filePath, target); } catch { /* keep the original name */ }
  return target;
}

function removeUpload(file) {
  if (!file || !file.path) return;
  try { fs.unlinkSync(file.path); } catch { /* already gone */ }
}

// Allow the page to reach the API even when it is opened from another origin
// (e.g. opened directly from disk as file:// or via a Live Server preview port).
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, "public")));

function auth(req,res,next){
  try {
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!token) return res.status(401).json({error:"Login required"});
    const payload=jwt.verify(token,JWT_SECRET);
    req.user=get("SELECT id,full_name,email,phone,role,office_id FROM users WHERE id=?",[payload.id]);
    if(!req.user) return res.status(401).json({error:"User not found"});
    next();
  } catch { res.status(401).json({error:"Invalid or expired session"}); }
}
function officerOnly(req,res,next){
  if(req.user.role!=="officer") return res.status(403).json({error:"Officer access required"});
  if(!ownOfficeId(req.user)) return res.status(403).json({error:"This officer account is not linked to an office"});
  next();
}

// Attachments are private: only the citizen who filed the complaint and the
// office it is assigned to may download them.
app.get("/uploads/:name",auth,(req,res)=>{
  const name=path.basename(req.params.name);
  const c=get("SELECT id,citizen_id,office_id FROM complaints WHERE attachment=?",[name]);
  if(!c) return res.status(404).json({error:"Attachment not found"});
  if(req.user.role==="citizen"){
    if(Number(c.citizen_id)!==Number(req.user.id)) return res.status(403).json({error:"Access denied"});
  } else if(Number(c.office_id)!==ownOfficeId(req.user)){
    return res.status(403).json({error:"This attachment belongs to another office"});
  }
  const file=path.join(UPLOAD_DIR,name);
  if(!fs.existsSync(file)) return res.status(404).json({error:"Attachment file is missing on the server"});
  res.sendFile(file);
});

// Brute-force protection: only failed logins are counted, and a successful
// login clears the counter, so a real user can never be locked out by typing
// the right password.
const MAX_FAILED_LOGINS = 20;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function loginKey(req) {
  return String(req.body && req.body.email || "").trim().toLowerCase();
}
function noteFailedLogin(key) {
  const now = Date.now();
  const rec = loginFailures.get(key);
  if (!rec || now - rec.first > LOGIN_LOCK_MS) loginFailures.set(key, { count: 1, first: now });
  else rec.count++;
  if (loginFailures.size > 500) {
    for (const [k, v] of loginFailures) if (now - v.first > LOGIN_LOCK_MS) loginFailures.delete(k);
  }
}
function loginBlocked(key) {
  const rec = loginFailures.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_LOCK_MS) { loginFailures.delete(key); return false; }
  return rec.count >= MAX_FAILED_LOGINS;
}

app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body||{};
  const key=loginKey(req);
  if(loginBlocked(key)) return res.status(429).json({error:"Too many failed attempts. Please wait a few minutes and try again."});
  const user=get("SELECT * FROM users WHERE email=?",[(email||"").trim().toLowerCase()]);
  if(!user || !bcrypt.compareSync(password||"",user.password_hash)){
    noteFailedLogin(key);
    return res.status(401).json({error:"Invalid email or password"});
  }
  loginFailures.delete(key);
  const token=jwt.sign({id:user.id},JWT_SECRET,{expiresIn:"8h"});
  res.json({token,user:{id:user.id,full_name:user.full_name,email:user.email,phone:user.phone,role:user.role}});
});

app.post("/api/auth/register",(req,res,next)=>{
  const {full_name,email,phone,password}=req.body||{};
  if(!full_name||!email||!password) return res.status(400).json({error:"Name, email and password are required"});
  const mail=String(email).trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({error:"Please enter a valid email address"});
  try {
    const hash=bcrypt.hashSync(password,10);
    const id=insert(`INSERT INTO users(full_name,email,phone,password_hash,role,office_id) VALUES(?,?,?,?,'citizen',NULL)`,[full_name,mail,phone||"",hash]);
    saveDb();
    const token=jwt.sign({id},JWT_SECRET,{expiresIn:"8h"});
    res.json({token,user:{id,full_name,email:mail,phone:phone||"",role:"citizen"}});
  } catch(e) {
    if(/UNIQUE constraint failed/i.test(e.message||"")) return res.status(400).json({error:"Email is already registered"});
    next(e);
  }
});

app.get("/api/me",auth,(req,res)=>res.json(req.user));
app.get("/api/offices",(req,res)=>res.json(all("SELECT * FROM offices ORDER BY name")));

app.post("/api/complaints",auth,upload.single("attachment"),(req,res,next)=>{
  // Any rejection after multer has written the file must delete it again,
  // otherwise uploads/ collects files that no complaint ever references.
  const discardUpload=()=>removeUpload(req.file);
  try{
    if(req.user.role!=="citizen"){ discardUpload(); return res.status(403).json({error:"Only citizens can submit complaints"}); }
    const {subject,description,location_text,latitude,longitude,office_id,office_type,priority}=req.body;
    if(!subject||!description||!location_text){ discardUpload(); return res.status(400).json({error:"Subject, description and location are required"}); }

    let file=req.file?req.file.filename:null;
    if(req.file){
      const detected=detectUploadType(req.file.path);
      if(!detected){
        discardUpload();
        return res.status(400).json({error:"Only images, PDF, text or ZIP files are allowed."});
      }
      const renamed=renameToDetectedExtension(req.file.path,detected);
      file=path.basename(renamed);
      req.file.filename=file;
      req.file.path=renamed;
    }

    const lat=toFiniteNumber(latitude), lon=toFiniteNumber(longitude);
    const chosenOfficeId=toFiniteNumber(office_id);
    let office=chosenOfficeId?get("SELECT * FROM offices WHERE id=?",[chosenOfficeId]):null;
    if(!office && lat!==null && lon!==null) office=nearestOffice(lat,lon,office_type);
    if(!office){ discardUpload(); return res.status(400).json({error:"Please choose an office or provide a valid location"}); }

    const dup=get(`SELECT id,tracking_code FROM complaints WHERE citizen_id=? AND subject=? AND description=? AND location_text=? AND created_at > datetime('now','-60 seconds')`,[req.user.id,subject,description,location_text]);
    if(dup){ discardUpload(); return res.json({message:"Complaint submitted",tracking_code:dup.tracking_code,office}); }

    const tracking="PRT-"+Date.now().toString(36).toUpperCase()+"-"+Math.floor(100+Math.random()*900);
    const id=insert(`INSERT INTO complaints(tracking_code,citizen_id,office_id,subject,description,location_text,latitude,longitude,attachment,priority) VALUES(?,?,?,?,?,?,?,?,?,?)`,[tracking,req.user.id,office.id,subject,description,location_text,lat,lon,file,priority||"Normal"]);
    insert(`INSERT INTO complaint_history(complaint_id,actor_id,status,note,to_office_id) VALUES(?,?,?,?,?)`,[id,req.user.id,"Submitted","Complaint submitted",office.id]);
    saveDb();
    res.json({message:"Complaint submitted",tracking_code:tracking,office});
  }catch(e){ discardUpload(); next(e); }
});

app.get("/api/my-complaints",auth,(req,res)=>{
  if(req.user.role!=="citizen") return res.status(403).json({error:"Citizen access required"});
  res.json(all(`SELECT c.*,o.name office_name,o.office_type FROM complaints c JOIN offices o ON o.id=c.office_id WHERE c.citizen_id=? ORDER BY c.created_at DESC`,[req.user.id]));
});

app.get("/api/complaints/:id",auth,(req,res)=>{
  const c=get(`SELECT c.*,o.name office_name,o.address office_address,u.full_name citizen_name FROM complaints c JOIN offices o ON o.id=c.office_id JOIN users u ON u.id=c.citizen_id WHERE c.id=?`,[req.params.id]);
  if(!c) return res.status(404).json({error:"Complaint not found"});
  if(req.user.role==="citizen" && Number(c.citizen_id)!==Number(req.user.id)) return res.status(403).json({error:"Access denied"});
  if(req.user.role==="officer" && Number(c.office_id)!==ownOfficeId(req.user)) return res.status(403).json({error:"Complaint is not assigned to your office"});
  const history=all(`SELECT h.*,u.full_name actor_name,fo.name from_office_name,tto.name to_office_name FROM complaint_history h JOIN users u ON u.id=h.actor_id LEFT JOIN offices fo ON fo.id=h.from_office_id LEFT JOIN offices tto ON tto.id=h.to_office_id WHERE h.complaint_id=? ORDER BY h.created_at ASC`,[req.params.id]);
  res.json({complaint:c,history});
});

app.get("/api/officer/complaints",auth,officerOnly,(req,res)=>{
  const id=ownOfficeId(req.user);
  res.json(all(`SELECT c.*,u.full_name citizen_name,u.phone citizen_phone,o.name office_name FROM complaints c JOIN users u ON u.id=c.citizen_id JOIN offices o ON o.id=c.office_id WHERE c.office_id=? ORDER BY c.created_at DESC`,[id]));
});

app.patch("/api/officer/complaints/:id/status",auth,officerOnly,(req,res)=>{
  const id=ownOfficeId(req.user), c=get("SELECT * FROM complaints WHERE id=?",[req.params.id]);
  if(!c || Number(c.office_id)!==id) return res.status(404).json({error:"Complaint not found for this office"});
  const {status,note}=req.body||{};
  const allowed=["Submitted","Under Review","In Progress","Forwarded","Resolved","Rejected","Closed"];
  if(!allowed.includes(status)) return res.status(400).json({error:"Invalid status"});
  run("UPDATE complaints SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[status,c.id]);
  insert(`INSERT INTO complaint_history(complaint_id,actor_id,status,note,from_office_id) VALUES(?,?,?,?,?)`,[c.id,req.user.id,status,note||"",id]);
  saveDb();
  res.json({message:"Status updated"});
});

app.post("/api/officer/complaints/:id/forward",auth,officerOnly,(req,res)=>{
  const id=ownOfficeId(req.user), c=get("SELECT * FROM complaints WHERE id=?",[req.params.id]);
  const targetId=toFiniteNumber((req.body||{}).office_id);
  if(!c || Number(c.office_id)!==id) return res.status(404).json({error:"Complaint not found for this office"});
  if(!targetId) return res.status(400).json({error:"Please choose the office to forward to"});
  const target=get("SELECT * FROM offices WHERE id=?",[targetId]);
  if(!target) return res.status(400).json({error:"Invalid complaint or target office"});
  if(Number(target.id)===id) return res.status(400).json({error:"A complaint cannot be forwarded to the same office"});
  run("UPDATE complaints SET office_id=?,status='Forwarded',updated_at=CURRENT_TIMESTAMP WHERE id=?",[target.id,c.id]);
  insert(`INSERT INTO complaint_history(complaint_id,actor_id,status,note,from_office_id,to_office_id) VALUES(?,?,?,?,?,?)`,[c.id,req.user.id,"Forwarded",(req.body||{}).note||`Forwarded to ${target.name}`,id,target.id]);
  saveDb();
  res.json({message:"Complaint forwarded"});
});

app.get("/api/stats",auth,(req,res)=>{
  if(req.user.role==="citizen") return res.json(all("SELECT status,COUNT(*) count FROM complaints WHERE citizen_id=? GROUP BY status",[req.user.id]));
  const id=ownOfficeId(req.user);
  if(!id) return res.status(403).json({error:"This officer account is not linked to an office"});
  res.json(all("SELECT status,COUNT(*) count FROM complaints WHERE office_id=? GROUP BY status",[id]));
});

// Unknown API routes must not fall through to the single page app, otherwise
// a typo'd endpoint answers with index.html and HTTP 200.
app.use("/api",(req,res)=>res.status(404).json({error:"API endpoint not found"}));
// Anything else is the single page app.
app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));

// Central error handler: client mistakes stay 4xx, genuine server faults are
// reported as 500 without leaking internal details to the client.
app.use((err,req,res,next)=>{
  if(res.headersSent) return next(err);
  const status=Number(err.status||err.statusCode);
  const isClientError=(Number.isInteger(status) && status>=400 && status<500) ||
    err instanceof multer.MulterError || /^LIMIT_/.test(err.code||"");
  if(!isClientError) console.error("[parathi] server error:", err);
  res.status(isClientError?400:500).json({error:isClientError?(err.message||"Request failed"):"Server error"});
});

async function main(){
  const SQL=await initSqlJs({ locateFile: file => path.join(path.dirname(require.resolve("sql.js")), file) });
  if(fs.existsSync(DB_FILE)) db=new SQL.Database(fs.readFileSync(DB_FILE)); else db=new SQL.Database();
  createSchema();
  migrate();
  seed();
  const server=app.listen(PORT, HOST, () => {
    console.log(`PARATHI running:`);
    console.log(`  On this computer : http://localhost:${PORT}`);
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family === "IPv4" && !n.internal) {
          console.log(`  Other computers  : http://${n.address}:${PORT}  (same Wi-Fi/LAN)`);
        }
      }
    }
    console.log(`  Allow port ${PORT} through the firewall if others cannot connect.`);
    if(!process.env.JWT_SECRET) console.log("  WARNING: using the built-in demo JWT secret. Set JWT_SECRET before exposing this to the internet.");
  });
  server.on("error",err=>{
    if(err.code==="EADDRINUSE") console.error(`PARATHI cannot start: port ${PORT} is already in use. Close the other process or start with PORT=<other port> npm start.`);
    else console.error("PARATHI server error:", err.message);
    process.exit(1);
  });
}
main().catch(err=>{console.error("Failed to start PARATHI:",err);process.exit(1);});
