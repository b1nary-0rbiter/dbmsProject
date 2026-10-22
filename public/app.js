let token = localStorage.getItem("token");
let me = null;
let demo = localStorage.getItem("parathi_demo") === "1";
let offices = [];

const $ = (id) => document.getElementById(id);

// Default logins for offline demo mode
const DEFAULT_LOGINS = {
  "citizen@parathi": { password: "citizen123", role: "citizen", full_name: "Demo Citizen", id: 1 },
  "municipalityofficer@parathi": { password: "officer123", role: "officer", full_name: "Municipality Officer", id: 2, office_id: 1 },
  "policeofficer@parathi": { password: "officer123", role: "officer", full_name: "Police Officer", id: 3, office_id: 3 },
  "ksebofficer@parathi": { password: "officer123", role: "officer", full_name: "KSEB Officer", id: 4, office_id: 4 },
  "pwdofficer@parathi": { password: "officer123", role: "officer", full_name: "PWD Officer", id: 5, office_id: 5 },
  "villageofficer@parathi": { password: "officer123", role: "officer", full_name: "Village Officer", id: 6, office_id: 2 },
};

const DEMO_DATA = { "/api/my-complaints": [], "/api/officer/complaints": [], "/api/offices": [], "/api/stats": [] };

const API_BASE = (typeof location !== "undefined" && location.protocol === "file:") ? "http://localhost:3000" : "";

function api(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (demo) {
    if (url === "/api/me") return Promise.resolve(me);
    if (DEMO_DATA[url] !== undefined) return Promise.resolve(DEMO_DATA[url]);
    return Promise.reject(new Error("Offline demo mode. Start server for full features."));
  }
  return fetch(API_BASE + url, opts).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function showScreen(name) {
  document.querySelectorAll("main > .container > div[id^='screen-']").forEach(el => el.classList.add("hidden"));
  const el = document.getElementById("screen-" + name);
  if (el) el.classList.remove("hidden");
}

// ---- Auth ----
function setAuth(mode) {
  document.getElementById("authTitle").textContent = mode === "login" ? "Login" : "Register";
  document.getElementById("tabLogin").className = "btn btn-sm " + (mode === "login" ? "btn-primary" : "btn-secondary");
  document.getElementById("tabRegister").className = "btn btn-sm " + (mode === "register" ? "btn-primary" : "btn-secondary");
  document.getElementById("regFields").classList.toggle("hidden", mode === "login");
  document.getElementById("authForm").dataset.mode = mode;
  document.getElementById("authBtn").textContent = mode === "login" ? "Login" : "Register";
  document.getElementById("authMsg").classList.add("hidden");
  document.getElementById("regName").required = (mode === "register");
}

function showAuth(mode) {
  setAuth(mode || "login");
  showScreen("auth");
}

document.getElementById("tabLogin").onclick = function() { setAuth("login"); };
document.getElementById("tabRegister").onclick = function() { setAuth("register"); };

document.getElementById("authForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const btn = document.getElementById("authBtn");
  btn.disabled = true;
  document.getElementById("authMsg").classList.add("hidden");

  const mode = document.getElementById("authForm").dataset.mode || "login";
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const phone = document.getElementById("regPhone").value.trim();

  if (mode === "register" && phone && !/^\d{10}$/.test(phone)) {
    document.getElementById("authMsg").textContent = "Phone must be 10 digits.";
    document.getElementById("authMsg").classList.remove("hidden");
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
          full_name: document.getElementById("regName").value.trim(),
          email: email,
          phone: phone,
          password: password,
        }),
      });
    } else {
      try {
        data = await api("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, password: password }),
        });
      } catch (err) {
        // Offline fallback
        const acc = DEFAULT_LOGINS[email];
        if (acc && acc.password === password) {
          demo = true;
          token = "demo";
          me = { id: acc.id, full_name: acc.full_name, email: email, role: acc.role, office_id: acc.office_id || null };
          localStorage.setItem("parathi_demo", "1");
          localStorage.setItem("parathi_demo_user", JSON.stringify(me));
          alert("Offline demo mode");
        } else {
          throw err;
        }
      }
    }

    if (data) {
      token = data.token;
      me = data.user;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(me));
      localStorage.removeItem("parathi_demo");
      localStorage.removeItem("parathi_demo_user");
    }

    document.getElementById("sessionName").textContent = me.full_name + " (" + me.role + ")";
    document.getElementById("navLogin").classList.add("hidden");
    document.getElementById("navLogout").classList.remove("hidden");
    document.getElementById("navProfile").classList.remove("hidden");

    if (me.role === "officer") showOffice(); else showCitizen();
  } catch (err) {
    document.getElementById("authMsg").textContent = err.message;
    document.getElementById("authMsg").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
});

function logout() {
  token = null;
  me = null;
  demo = false;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("parathi_demo");
  localStorage.removeItem("parathi_demo_user");
  document.getElementById("sessionName").textContent = "";
  document.getElementById("navLogin").classList.remove("hidden");
  document.getElementById("navLogout").classList.add("hidden");
  document.getElementById("navProfile").classList.add("hidden");
  showHome();
  alert("Logged out");
}

// ---- Citizen ----
function showCitizen() {
  showScreen("citizen");
  document.getElementById("citizenName").textContent = me.full_name;
  loadCitizen();
}

function showSubmit() {
  showScreen("submit");
  loadOffices();
}

async function loadCitizen() {
  try {
    const rows = await api("/api/my-complaints");
    const counts = { Submitted: 0, "Under Review": 0, "In Progress": 0, Resolved: 0 };
    rows.forEach(function(r) { if (counts[r.status] !== undefined) counts[r.status]++; });
    let html = "";
    for (const [k, v] of Object.entries(counts)) {
      html += '<div class="stat-box"><div class="num">' + v + '</div><div class="label">' + k + '</div></div>';
    }
    html += '<div class="stat-box"><div class="num">' + rows.length + '</div><div class="label">Total</div></div>';
    document.getElementById("citizenStats").innerHTML = html;

    if (rows.length) {
      document.getElementById("citizenList").innerHTML = rows.map(function(c) {
        return complaintCard(c);
      }).join("");
    } else {
      document.getElementById("citizenList").innerHTML = '<p style="color:#666;">No complaints yet. Submit your first complaint.</p>';
    }

    // Status guide
    document.getElementById("citizenList").innerHTML += `
      <div style="margin-top:16px;padding:12px;background:#f7f9fc;border:1px solid #e0e0e0;border-radius:6px;">
        <div style="font-size:12px;font-weight:600;color:#1a3a5c;margin-bottom:6px;">Status Guide</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;align-items:center;">
          <span class="badge badge-submitted">Submitted</span> Received
          <span class="badge badge-under-review">Under Review</span> Examining
          <span class="badge badge-in-progress">In Progress</span> Resolving
          <span class="badge badge-resolved">Resolved</span> Fixed
        </div>
      </div>
    `;
  } catch (e) {
    alert(e.message);
  }
}

function complaintCard(c) {
  return '<div class="complaint-item">' +
    '<h4>' + esc(c.subject) + '</h4>' +
    '<div class="meta"><span>' + esc(c.tracking_code) + '</span><span>' + esc(c.office_name) + '</span><span>' + new Date(c.created_at).toLocaleString() + '</span></div>' +
    '<div class="meta">' + esc(c.location_text) + '</div>' +
    '<div class="actions">' +
      '<span class="badge badge-' + esc(c.status).toLowerCase().replace(/ /g, "-") + '">' + esc(c.status) + '</span> ' +
      '<button class="btn btn-secondary btn-sm" onclick="openComplaint(' + c.id + ')">View</button>' +
    '</div>' +
  '</div>';
}

// ---- Submit ----
function showSubmit() {
  showScreen("submit");
  loadOffices();
}

async function loadOffices() {
  try {
    const offices = await api("/api/offices");
    let html = "";
    for (let i = 0; i < offices.length; i++) {
      html += '<option value="' + offices[i].id + '">' + esc(offices[i].name) + '</option>';
    }
    document.getElementById("officeSelect").innerHTML = html;
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById("complaintForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const btn = document.getElementById("complaintForm").querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  const msg = document.getElementById("submitMsg");
  msg.classList.add("hidden");

  try {
    const fd = new FormData(e.target);
    const data = await api("/api/complaints", { method: "POST", body: fd });
    msg.textContent = "Complaint submitted! Tracking: " + data.tracking_code;
    msg.className = "msg msg-success";
    msg.classList.remove("hidden");
    e.target.reset();
    setTimeout(function() { showCitizen(); }, 1500);
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
  try {
    const rows = await api("/api/officer/complaints");
    const stats = { Submitted: 0, "Under Review": 0, "In Progress": 0, Resolved: 0 };
    rows.forEach(function(r) { if (stats[r.status] !== undefined) stats[r.status]++; });
    let statsHtml = "";
    for (const [k, v] of Object.entries(stats)) {
      statsHtml += '<div class="stat-box"><div class="num">' + v + '</div><div class="label">' + k + '</div></div>';
    }
    statsHtml += '<div class="stat-box"><div class="num">' + rows.length + '</div><div class="label">Total</div></div>';
    document.getElementById("officeStats").innerHTML = statsHtml;

    if (rows.length) {
      document.getElementById("officeList").innerHTML = rows.map(function(c) { return complaintCard(c); }).join("");
    } else {
      document.getElementById("officeList").innerHTML = '<p style="color:#666;">No complaints assigned to this office.</p>';
    }

    document.getElementById("officeTitle").textContent = (me.full_name || "Officer") + " - Office Dashboard";

    // Priority breakdown
    const priorities = { Normal: 0, High: 0, Urgent: 0 };
    rows.forEach(function(r) { if (priorities[r.priority] !== undefined) priorities[r.priority]++; });
    const pb = document.getElementById("priorityBreakdown");
    if (pb) {
      pb.innerHTML = '<span><strong style="color:#1a3a5c;">' + priorities.Normal + '</strong> Normal</span>' +
        '<span><strong style="color:#e67e22;">' + priorities.High + '</strong> High</span>' +
        '<span><strong style="color:#e74c3c;">' + priorities.Urgent + '</strong> Urgent</span>';
    }
  } catch (e) {
    alert(e.message);
  }
}

// ---- Detail ----
async function openComplaint(id) {
  showScreen("detail");
  try {
    const d = await api("/api/complaints/" + id);
    document.getElementById("detailTitle").textContent = d.complaint.tracking_code;

    let actions = "";
    if (me.role === "officer") {
      let officeOpts = "";
      for (let i = 0; i < offices.length; i++) {
        if (offices[i].id !== d.complaint.office_id) {
          officeOpts += '<option value="' + offices[i].id + '">' + esc(offices[i].name) + '</option>';
        }
      }
      actions = '<div class="form-group">' +
        '<label>Update Status</label>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
          '<select id="newStatus" style="flex:1;min-width:120px;">' +
            '<option>Under Review</option><option>In Progress</option>' +
            '<option>Resolved</option><option>Rejected</option><option>Closed</option>' +
          '</select>' +
          '<input id="statusNote" placeholder="Note" style="flex:1;min-width:120px;">' +
          '<button class="btn btn-primary btn-sm" onclick="updateStatus(' + id + ')">Update</button>' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Forward To</label>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
          '<select id="forwardOffice" style="flex:1;min-width:120px;">' + officeOpts + '</select>' +
          '<input id="forwardNote" placeholder="Reason" style="flex:1;min-width:120px;">' +
          '<button class="btn btn-secondary btn-sm" onclick="forwardComplaint(' + id + ')">Forward</button>' +
        '</div>' +
      '</div>';
    }

    let attachmentHtml = "";
    if (d.complaint.attachment) {
      attachmentHtml = '<div class="detail-row"><label>Attachment</label><div class="value"><button class="btn btn-secondary btn-sm" onclick="openAttachment(\'' + esc(d.complaint.attachment) + '\')">Open Attachment</button></div></div>';
    }

    let timelineHtml = "";
    for (let i = 0; i < d.history.length; i++) {
      const h = d.history[i];
      timelineHtml += '<div class="timeline-event">' +
        '<div class="status">' + esc(h.status) + '</div>' +
        '<div class="meta">' + new Date(h.created_at).toLocaleString() + ' — ' + esc(h.actor_name) + '</div>' +
        (h.note ? '<div class="note">' + esc(h.note) + '</div>' : '') +
      '</div>';
    }

    document.getElementById("detailContent").innerHTML =
      '<div style="margin-bottom:12px;"><button class="btn btn-secondary" onclick="goBack()">&#8592; Back</button></div>' +
      '<div class="detail-row"><label>Subject</label><div class="value">' + esc(d.complaint.subject) + '</div></div>' +
      '<div class="detail-row"><label>Description</label><div class="value">' + esc(d.complaint.description) + '</div></div>' +
      '<div class="detail-row"><label>Location</label><div class="value">' + esc(d.complaint.location_text) + '</div></div>' +
      '<div class="detail-row"><label>Office</label><div class="value">' + esc(d.complaint.office_name) + '</div></div>' +
      '<div class="detail-row"><label>Status</label><div class="value"><span class="badge badge-' + esc(d.complaint.status).toLowerCase().replace(/ /g, "-") + '">' + esc(d.complaint.status) + '</span></div></div>' +
      '<div class="detail-row"><label>Priority</label><div class="value">' + esc(d.complaint.priority) + '</div></div>' +
      attachmentHtml +
      actions +
      '<h3>Timeline</h3>' +
      '<div class="timeline">' + timelineHtml + '</div>';

    // load offices for forward dropdown
    if (me.role === "officer") {
      try {
        const offs = await api("/api/offices");
        offices = offs;
        let opts = "";
        for (let i = 0; i < offs.length; i++) {
          if (offs[i].id !== d.complaint.office_id) {
            opts += '<option value="' + offs[i].id + '">' + esc(offs[i].name) + '</option>';
          }
        }
        const sel = document.getElementById("forwardOffice");
        if (sel) sel.innerHTML = opts;
      } catch (e) {}
    }
  } catch (e) {
    alert(e.message);
  }
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
    setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
  } catch (e) {
    alert(e.message);
  }
}

async function updateStatus(id) {
  try {
    await api("/api/officer/complaints/" + id + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: document.getElementById("newStatus").value, note: document.getElementById("statusNote").value }),
    });
    alert("Status updated");
    openComplaint(id);
  } catch (e) { alert(e.message); }
}

async function forwardComplaint(id) {
  try {
    await api("/api/officer/complaints/" + id + "/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ office_id: document.getElementById("forwardOffice").value, note: document.getElementById("forwardNote").value }),
    });
    alert("Complaint forwarded");
    openComplaint(id);
  } catch (e) { alert(e.message); }
}

function goBack() {
  if (me && me.role === "officer") showOffice(); else if (me) showCitizen(); else showHome();
}

// ---- Profile ----
function showProfile() {
  showScreen("profile");
  if (me) {
    document.getElementById("profileContent").innerHTML =
      '<div class="detail-row"><label>Name</label><div class="value">' + esc(me.full_name) + '</div></div>' +
      '<div class="detail-row"><label>Email</label><div class="value">' + esc(me.email) + '</div></div>' +
      '<div class="detail-row"><label>Role</label><div class="value">' + esc(me.role) + '</div></div>' +
      (me.office_id ? '<div class="detail-row"><label>Office ID</label><div class="value">' + me.office_id + '</div></div>' : '');
  }
}

// ---- Home ----
function showHome() {
  showScreen("home");
  const stats = { total: 1247, resolved: 892, inProgress: 215, pending: 140 };
  document.getElementById("homeStats").innerHTML =
    '<div class="stat-box"><div class="num">' + stats.total + '</div><div class="label">Total Complaints</div></div>' +
    '<div class="stat-box"><div class="num">' + stats.resolved + '</div><div class="label">Resolved</div></div>' +
    '<div class="stat-box"><div class="num">' + stats.inProgress + '</div><div class="label">In Progress</div></div>' +
    '<div class="stat-box"><div class="num">' + stats.pending + '</div><div class="label">Pending</div></div>';

  const depts = [
    { name: "Municipality", resolved: 234, total: 312 },
    { name: "Police", resolved: 189, total: 245 },
    { name: "KSEB (Electricity)", resolved: 156, total: 198 },
    { name: "PWD (Roads)", resolved: 198, total: 267 },
    { name: "Village Office", resolved: 115, total: 145 },
  ];
  let deptHtml = "";
  for (let i = 0; i < depts.length; i++) {
    const d = depts[i];
    deptHtml += '<div style="background:#f7f9fc;border:1px solid #e0e0e0;border-radius:6px;padding:10px;text-align:center;">' +
      '<div style="font-size:12px;font-weight:600;color:#1a3a5c;margin-bottom:4px;">' + d.name + '</div>' +
      '<div style="font-size:18px;font-weight:700;color:#1a3a5c;">' + d.resolved + '</div>' +
      '<div style="font-size:10px;color:#888;">resolved of ' + d.total + '</div>' +
      '<div style="margin-top:4px;height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;">' +
        '<div style="height:100%;width:' + Math.round(d.resolved / d.total * 100) + '%;background:#1a3a5c;border-radius:2px;"></div>' +
      '</div>' +
    '</div>';
  }
  document.getElementById("deptStats").innerHTML = deptHtml;
}

// ---- Info (modal popup) ----
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
  modal.innerHTML = '<div class="modal"><button class="close-btn" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' + (content[page] || content["about"]) + '</div>';
  modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ---- Init ----
function init() {
  const stored = localStorage.getItem("user");
  if (stored) {
    try { me = JSON.parse(stored); } catch (e) { me = null; }
  }
  if (token && me) {
    document.getElementById("sessionName").textContent = me.full_name + " (" + me.role + ")";
    document.getElementById("navLogin").classList.add("hidden");
    document.getElementById("navLogout").classList.remove("hidden");
    document.getElementById("navProfile").classList.remove("hidden");
    if (me.role === "officer") showOffice(); else showCitizen();
  } else {
    showHome();
  }
}

document.getElementById("navLogin").onclick = function() { showScreen("auth"); };
init();