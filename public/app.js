const $ = (id) => document.getElementById(id);
const API = "";

let token = localStorage.getItem("token");
let me = null;

// ---- helpers ----
function toast(msg, type) {
  const t = $("toast");
  t.textContent = msg;
  t.className = type === "error" ? "error" : "success";
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 3000);
}

function showScreen(name) {
  document.querySelectorAll("main > .container > div[id^='screen-']").forEach(el => {
    el.classList.add("hidden");
  });
  const el = $("screen-" + name);
  if (el) el.classList.remove("hidden");
}

function api(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  return fetch(API + url, opts).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---- auth ----
function setAuth(mode) {
  $("authTitle").textContent = mode === "login" ? "Login" : "Register";
  $("tabLogin").className = "btn btn-sm " + (mode === "login" ? "btn-primary" : "btn-secondary");
  $("tabRegister").className = "btn btn-sm " + (mode === "register" ? "btn-primary" : "btn-secondary");
  $("regFields").classList.toggle("hidden", mode === "login");
  $("authForm").dataset.mode = mode;
  $("authBtn").textContent = mode === "login" ? "Login" : "Register";
  $("authMsg").classList.add("hidden");
  // Toggle required on registration-only fields so hidden required fields
  // don't block form submission (browser can't focus hidden inputs).
  $("regName").required = (mode === "register");
  $("regPhone").required = false;
}

function showAuth(mode) {
  setAuth(mode);
  showScreen("auth");
}

$("tabLogin").onclick = () => setAuth("login");
$("tabRegister").onclick = () => setAuth("register");

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("authBtn");
  btn.disabled = true;
  $("authMsg").classList.add("hidden");

  const mode = $("authForm").dataset.mode || "login";
  const email = $("email").value.trim();
  const password = $("password").value;
  const phone = $("regPhone").value.trim();
  if (mode === "register" && phone && !/^\d{10}$/.test(phone)) {
    $("authMsg").textContent = "Phone number must be exactly 10 digits.";
    $("authMsg").classList.remove("hidden");
    btn.disabled = false;
    return;
  }

  try {
    let data;
    if (mode === "register") {
      data = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: $("regName").value.trim(),
          email: email,
          phone: phone,
          password: password,
        }),
      });
    } else {
      data = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    }

    token = data.token;
    me = data.user;
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(me));

    $("sessionName").textContent = me.full_name + " (" + me.role + ")";
    $("navLogin").classList.add("hidden");
    $("navLogout").classList.remove("hidden");
    $("navProfile").classList.remove("hidden");
    $("navProfile").classList.remove("hidden");

    if (me.role === "officer") showOffice(); else showCitizen();
    toast("Welcome, " + me.full_name);
  } catch (err) {
    $("authMsg").textContent = err.message;
    $("authMsg").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
});

function logout() {
  token = null;
  me = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  $("sessionName").textContent = "";
  $("navLogin").classList.remove("hidden");
  $("navLogout").classList.add("hidden");
  $("navProfile").classList.add("hidden");
  showHome();
  toast("Logged out");
}

// ---- Citizen ----
async function showCitizen() {
  showScreen("citizen");
  $("citizenName").textContent = me.full_name;
  await loadCitizen();
}

async function loadCitizen() {
  const rows = await api("/api/my-complaints");
  const counts = { Submitted: 0, "Under Review": 0, "In Progress": 0, Resolved: 0 };
  rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  $("citizenStats").innerHTML = Object.entries(counts).map(([k, v]) =>
    `<div class="stat-box"><div class="num">${v}</div><div class="label">${k}</div></div>`
  ).join("") + `<div class="stat-box"><div class="num">${rows.length}</div><div class="label">Total</div></div>`;

  $("citizenList").innerHTML = rows.length
    ? rows.map(c => complaintCard(c)).join("")
    : '<p style="color:#666;">No complaints yet. Submit your first complaint.</p>';

  // Status legend to fill space
  $("citizenList").innerHTML += `
    <div style="margin-top:16px;padding:12px;background:#f7f9fc;border:1px solid #e0e0e0;border-radius:6px;">
      <div style="font-size:12px;font-weight:600;color:#1a3a5c;margin-bottom:8px;">Status Guide</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px;">
        <span class="badge badge-submitted">Submitted</span><span style="color:#666;">— Complaint received</span>
        <span class="badge badge-under-review">Under Review</span><span style="color:#666;">— Being examined</span>
        <span class="badge badge-in-progress">In Progress</span><span style="color:#666;">— Being resolved</span>
        <span class="badge badge-resolved">Resolved</span><span style="color:#666;">— Issue fixed</span>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#888;">
        Tip: Keep your tracking code safe. You can check complaint status anytime from this dashboard.
      </div>
    </div>
  `;
}

function complaintCard(c) {
  return `<div class="complaint-item">
    <h4>${esc(c.subject)}</h4>
    <div class="meta"><span>${esc(c.tracking_code)}</span><span>${esc(c.office_name)}</span><span>${new Date(c.created_at).toLocaleString()}</span></div>
    <div class="meta">${esc(c.location_text)}</div>
    <div class="actions">
      <span class="badge badge-${esc(c.status).toLowerCase().replace(/ /g, "-")}">${esc(c.status)}</span>
      <button class="btn btn-secondary btn-sm" onclick="openComplaint(${c.id})">View</button>
    </div>
  </div>`;
}

// ---- Submit ----
function showScreen_submit() { showScreen("submit"); loadOffices(); }

async function loadOffices() {
  const offices = await api("/api/offices");
  $("officeSelect").innerHTML = offices.map(o =>
    `<option value="${o.id}">${esc(o.name)}</option>`
  ).join("");
}

$("complaintForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("complaintForm").querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  const msg = $("submitMsg");
  msg.classList.add("hidden");

  try {
    const fd = new FormData(e.target);
    const data = await api("/api/complaints", { method: "POST", body: fd });
    msg.textContent = "Complaint submitted! Tracking: " + data.tracking_code;
    msg.className = "msg msg-success";
    msg.classList.remove("hidden");
    e.target.reset();
    setTimeout(() => { showCitizen(); }, 1500);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "msg msg-error";
    msg.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit";
  }
});

// ---- Officer ----
async function showOffice() {
  showScreen("office");
  await loadOffice();
}

async function loadOffice() {
  const rows = await api("/api/officer/complaints");
  const stats = { Submitted: 0, "Under Review": 0, "In Progress": 0, Resolved: 0 };
  rows.forEach(r => { if (stats[r.status] !== undefined) stats[r.status]++; });
  $("officeStats").innerHTML = Object.entries(stats).map(([k, v]) =>
    `<div class="stat-box"><div class="num">${v}</div><div class="label">${k}</div></div>`
  ).join("") + `<div class="stat-box"><div class="num">${rows.length}</div><div class="label">Total</div></div>`;

  $("officeList").innerHTML = rows.length
    ? rows.map(c => complaintCard(c)).join("")
    : '<p style="color:#666;">No complaints assigned to this office.</p>';

  // Priority breakdown + tips to fill space
  const priorities = { Normal: 0, High: 0, Urgent: 0 };
  rows.forEach(r => { if (priorities[r.priority] !== undefined) priorities[r.priority]++; });
  const pb = $("priorityBreakdown");
  if (pb) {
    pb.innerHTML = `
      <span><strong style="color:#1a3a5c;">${priorities.Normal}</strong> Normal</span>
      <span><strong style="color:#e67e22;">${priorities.High}</strong> High</span>
      <span><strong style="color:#e74c3c;">${priorities.Urgent}</strong> Urgent</span>
    `;
  }

  $("officeTitle").textContent = (me.full_name || "Officer") + " — Office Dashboard";
}

function complaintCard(c) {
  return `<div class="complaint-item">
    <h4>${esc(c.subject)}</h4>
    <div class="meta"><span>${esc(c.tracking_code)}</span><span>${esc(c.office_name)}</span><span>${new Date(c.created_at).toLocaleString()}</span></div>
    <div class="meta">${esc(c.location_text)}</div>
    <div class="actions">
      <span class="badge badge-${esc(c.status).toLowerCase().replace(/ /g, "-")}">${esc(c.status)}</span>
      <button class="btn btn-secondary btn-sm" onclick="openComplaint(${c.id})">View</button>
    </div>
  </div>`;
}

// ---- Detail ----
async function openComplaint(id) {
  showScreen("detail");
  const d = await api("/api/complaints/" + id);
  $("detailTitle").textContent = d.complaint.tracking_code;

  let actions = "";
  if (me.role === "officer") {
    actions = `<div class="form-group">
      <label>Update Status</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <select id="newStatus" style="flex:1;min-width:120px;">
          <option>Under Review</option><option>In Progress</option>
          <option>Resolved</option><option>Rejected</option><option>Closed</option>
        </select>
        <input id="statusNote" placeholder="Note" style="flex:1;min-width:120px;">
        <button class="btn btn-primary btn-sm" onclick="updateStatus(${id})">Update</button>
      </div>
    </div>
    <div class="form-group">
      <label>Forward To</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <select id="forwardOffice" style="flex:1;min-width:120px;"></select>
        <input id="forwardNote" placeholder="Reason" style="flex:1;min-width:120px;">
        <button class="btn btn-secondary btn-sm" onclick="forwardComplaint(${id})">Forward</button>
      </div>
    </div>`;
  }

  $("detailContent").innerHTML = `
    <div style="margin-bottom:12px;">
      <button class="btn btn-back" onclick="goBack()">&#8592; Back</button>
    </div>
    <div class="detail-row"><label>Subject</label><div class="value">${esc(d.complaint.subject)}</div></div>
    <div class="detail-row"><label>Description</label><div class="value">${esc(d.complaint.description)}</div></div>
    <div class="detail-row"><label>Location</label><div class="value">${esc(d.complaint.location_text)}</div></div>
    <div class="detail-row"><label>Office</label><div class="value">${esc(d.complaint.office_name)}</div></div>
    <div class="detail-row"><label>Status</label><div class="value"><span class="badge badge-${esc(d.complaint.status).toLowerCase().replace(/ /g, "-")}">${esc(d.complaint.status)}</span></div></div>
    <div class="detail-row"><label>Priority</label><div class="value">${esc(d.complaint.priority)}</div></div>
    ${d.complaint.attachment ? `<div class="detail-row"><label>Attachment</label><div class="value"><button class="btn btn-secondary btn-sm" onclick="openAttachment('${esc(d.complaint.attachment)}')">Open Attachment</button></div></div>` : ""}
    ${actions}
    <h3>Timeline</h3>
    <div class="timeline">${d.history.map(h =>
      `<div class="timeline-event">
        <div class="status">${esc(h.status)}</div>
        <div class="meta">${new Date(h.created_at).toLocaleString()} — ${esc(h.actor_name)}</div>
        ${h.note ? `<div class="note">${esc(h.note)}</div>` : ""}
      </div>`
    ).join("")}</div>
  `;

  // load offices for forward dropdown
  if (me.role === "officer") {
    try {
      const offs = await api("/api/offices");
      $("forwardOffice").innerHTML = offs
        .filter(o => o.id !== d.complaint.office_id)
        .map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("");
    } catch (e) {}
  }
}

async function updateStatus(id) {
  try {
    await api("/api/officer/complaints/" + id + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: $("newStatus").value, note: $("statusNote").value }),
    });
    toast("Status updated");
    openComplaint(id);
  } catch (e) { toast(e.message, "error"); }
}

async function forwardComplaint(id) {
  try {
    await api("/api/officer/complaints/" + id + "/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ office_id: $("forwardOffice").value, note: $("forwardNote").value }),
    });
    toast("Complaint forwarded");
    openComplaint(id);
  } catch (e) { toast(e.message, "error"); }
}

function showSubmit() {
  showScreen('submit');
  loadOffices();
}

async function openAttachment(name) {
  try {
    const r = await fetch("/uploads/" + encodeURIComponent(name), {
      headers: { "Authorization": "Bearer " + token },
    });
    if (!r.ok) throw new Error("Could not open attachment");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    toast(e.message, "error");
  }
}

function showInfo(page) {
  const content = {
    about: "<h2>About PARATHI</h2><p>PARATHI is a public complaint management portal for the Municipality. Citizens can submit grievances online, track their status, and receive updates from the concerned department.</p><p>The portal is designed to bring transparency and efficiency to public service delivery.</p>",
    services: "<h2>Services</h2><p>The following services are available through this portal:</p><ul><li>Submit public complaints</li><li>Track complaint status</li><li>View complaint history and timeline</li><li>Forward complaints to relevant departments</li><li>Upload supporting documents</li></ul>",
    privacy: "<h2>Privacy Policy</h2><p>Your personal information is used solely for processing your complaints. We do not share your data with third parties. All data is stored securely on our servers.</p>",
    terms: "<h2>Terms of Use</h2><p>By using this portal, you agree to submit genuine complaints. Misuse of this service may result in account suspension. The municipality reserves the right to update these terms at any time.</p>",
    accessibility: "<h2>Accessibility</h2><p>This portal is designed to be accessible to all users. We support screen readers and keyboard navigation. If you face any accessibility issues, please contact us.</p>",
    sitemap: "<h2>Sitemap</h2><ul><li>Home / Login</li><li>Citizen Dashboard</li><li>Submit Complaint</li><li>Officer Dashboard</li><li>Complaint Detail</li></ul>",
    help: "<h2>Help</h2><p>For assistance, contact the helpline at 1800-000-0000 or email grievance@parathi. You can also visit the Municipality Office in person during working hours (9 AM - 5 PM, Monday to Saturday).</p>",
    contact: "<h2>Contact Us</h2><p><strong>Municipality Office</strong></p><p>Kottayam District, Kerala</p><p>Email: grievance@parathi</p><p>Helpline: 1800-000-0000</p><p>Working Hours: 9:00 AM - 5:00 PM (Monday to Saturday)</p>",
  };
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `<div class="modal"><button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>${content[page] || content["about"]}</div>`;
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function showProfile() {
  showScreen("profile");
  if (me) {
    $("profileContent").innerHTML = `
      <div class="detail-row"><label>Name</label><div class="value">${esc(me.full_name)}</div></div>
      <div class="detail-row"><label>Email</label><div class="value">${esc(me.email)}</div></div>
      <div class="detail-row"><label>Role</label><div class="value">${esc(me.role)}</div></div>
      ${me.office_id ? `<div class="detail-row"><label>Office ID</label><div class="value">${me.office_id}</div></div>` : ""}
    `;
  }
}

function goBack() {
  if (me && me.role === "officer") showOffice(); else if (me) showCitizen(); else showHome();
}

// ---- init ----
function showHome() {
  showScreen("home");
  const stats = { total: 1247, resolved: 892, inProgress: 215, pending: 140 };
  $("homeStats").innerHTML = `
    <div class="stat-box"><div class="num">${stats.total}</div><div class="label">Total Complaints</div></div>
    <div class="stat-box"><div class="num">${stats.resolved}</div><div class="label">Resolved</div></div>
    <div class="stat-box"><div class="num">${stats.inProgress}</div><div class="label">In Progress</div></div>
    <div class="stat-box"><div class="num">${stats.pending}</div><div class="label">Pending</div></div>
  `;
  const depts = [
    { name: "Municipality", resolved: 234, total: 312 },
    { name: "Police", resolved: 189, total: 245 },
    { name: "KSEB (Electricity)", resolved: 156, total: 198 },
    { name: "PWD (Roads)", resolved: 198, total: 267 },
    { name: "Village Office", resolved: 115, total: 145 },
  ];
  $("deptStats").innerHTML = depts.map(d => `
    <div style="background:#f7f9fc;border:1px solid #e0e0e0;border-radius:6px;padding:10px;text-align:center;">
      <div style="font-size:12px;font-weight:600;color:#1a3a5c;margin-bottom:4px;">${d.name}</div>
      <div style="font-size:18px;font-weight:700;color:#1a3a5c;">${d.resolved}</div>
      <div style="font-size:10px;color:#888;">resolved of ${d.total}</div>
      <div style="margin-top:4px;height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;">
        <div style="height:100%;width:${Math.round(d.resolved/d.total*100)}%;background:#1a3a5c;border-radius:2px;"></div>
      </div>
    </div>
  `).join("");
}

function init() {
  const stored = localStorage.getItem("user");
  if (stored) {
    try { me = JSON.parse(stored); } catch { me = null; }
  }
  if (token && me) {
    $("sessionName").textContent = me.full_name + " (" + me.role + ")";
    $("navLogin").classList.add("hidden");
    $("navLogout").classList.remove("hidden");
    $("navProfile").classList.remove("hidden");
    if (me.role === "officer") showOffice(); else showCitizen();
  } else {
    showHome();
  }
}

$("navLogin").onclick = () => showScreen("auth");
init();