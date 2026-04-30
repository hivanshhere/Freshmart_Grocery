const API_BASE = "http://localhost:3000";

const adminRole = localStorage.getItem("userRole");
const adminToken = localStorage.getItem("authToken");

if (adminRole !== "admin" || !adminToken) {
    alert("Please login as admin");
    window.location.href = "login.html";
}

const feedbackEl = document.getElementById("adminFeedback");
const summaryEl = document.getElementById("adminSummary");
const reportsEl = document.getElementById("adminReportsList");
const usersEl = document.getElementById("adminUsersList");
const actionsEl = document.getElementById("adminActionsList");
const logoutBtn = document.getElementById("adminLogoutBtn");

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function showFeedback(message, type) {
    if (!feedbackEl) return;
    if (!message) {
        feedbackEl.innerHTML = "";
        return;
    }
    feedbackEl.innerHTML = `<div class="orders-feedback orders-feedback--${type === "error" ? "error" : "success"}">${escapeHtml(message)}</div>`;
}

function statusClass(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "warned") return "status-pill status-pill--warned";
    if (normalized === "banned") return "status-pill status-pill--banned";
    if (normalized === "removed") return "status-pill status-pill--removed";
    if (normalized === "resolved") return "status-pill status-pill--resolved";
    if (normalized === "dismissed") return "status-pill status-pill--dismissed";
    if (normalized === "message") return "status-pill status-pill--resolved";
    return "status-pill status-pill--placed";
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        localStorage.clear();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || "Request failed");
    }
    return data;
}

function renderSummary(summary) {
    summaryEl.innerHTML = `
        <div class="orders-stat"><span class="orders-stat__label">Customers</span><strong>${Number(summary.customers) || 0}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Store Owners</span><strong>${Number(summary.owners) || 0}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Pending Reports</span><strong>${Number(summary.pending_reports) || 0}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Banned Users</span><strong>${Number(summary.banned_users) || 0}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Removed Users</span><strong>${Number(summary.removed_users) || 0}</strong></div>
    `;
}

function renderReports(reports) {
    if (!reports.length) {
        reportsEl.innerHTML = `<div class="orders-empty">No reports submitted yet.</div>`;
        return;
    }

    reportsEl.innerHTML = reports.map((report) => {
        const isReview = String(report.report_type || "").toLowerCase() === "review";
        return `
        <article class="admin-card">
            <div class="admin-card__top">
                <div>
                    <h4>${escapeHtml(report.report_type)} for ${escapeHtml(report.target_name)}</h4>
                    <p class="${statusClass(report.status)}">${escapeHtml(report.status)}</p>
                </div>
                <div>
                    <strong>Order #${Number(report.order_id) || 0}</strong>
                </div>
            </div>

            <div class="admin-card__meta">
                <div><span>Reporter</span><strong>${escapeHtml(report.reporter_name)} (${escapeHtml(report.reporter_role)})</strong></div>
                <div><span>Target</span><strong>${escapeHtml(report.target_name)} (${escapeHtml(report.target_role)})</strong></div>
                <div><span>Store</span><strong>${escapeHtml(report.store_name || "N/A")}</strong></div>
                <div><span>Rating</span><strong>${report.rating ? `${Number(report.rating)}/5` : "Not provided"}</strong></div>
            </div>

            <div class="admin-card__message">
                <span>Message</span>
                <p>${escapeHtml(report.message)}</p>
            </div>

            <input class="admin-card__note" id="reportNote-${report.id}" placeholder="Admin note for this action">

            <div class="admin-card__actions">
                ${isReview ? `<button type="button" class="orders-btn orders-btn--primary" onclick="sendReviewMessage(${report.id})">Send Review Message</button>` : ""}
                <button type="button" class="orders-btn orders-btn--primary" onclick="takeReportAction(${report.id}, ${Number(report.target_user_id) || 0}, 'warning')">Issue Warning</button>
                <button type="button" class="orders-btn orders-btn--danger" onclick="takeReportAction(${report.id}, ${Number(report.target_user_id) || 0}, 'ban')">Ban User</button>
                <button type="button" class="orders-btn orders-btn--danger" onclick="takeReportAction(${report.id}, ${Number(report.target_user_id) || 0}, 'remove')">Remove User</button>
                <button type="button" class="orders-btn orders-btn--ghost" onclick="dismissReport(${report.id})">Dismiss Report</button>
            </div>
        </article>
    `;
    }).join("");
}

function renderUsers(users) {
    if (!users.length) {
        usersEl.innerHTML = `<div class="orders-empty">No users available.</div>`;
        return;
    }

    usersEl.innerHTML = users.map((user) => `
        <article class="admin-card">
            <div class="admin-card__top">
                <div>
                    <h4>${escapeHtml(user.name)}</h4>
                    <p class="${statusClass(user.account_status)}">${escapeHtml(user.account_status)}</p>
                </div>
                <div><strong>${escapeHtml(user.role)}</strong></div>
            </div>

            <div class="admin-card__meta">
                <div><span>Email</span><strong>${escapeHtml(user.email)}</strong></div>
                <div><span>Warnings</span><strong>${Number(user.warning_count) || 0}</strong></div>
                <div><span>Store</span><strong>${escapeHtml(user.store_name || "N/A")}</strong></div>
                <div><span>Restriction Note</span><strong>${escapeHtml(user.ban_reason || "None")}</strong></div>
            </div>

            <input class="admin-card__note" id="userNote-${user.id}" placeholder="Optional admin note">

            <div class="admin-card__actions">
                <button type="button" class="orders-btn orders-btn--primary" onclick="takeUserAction(${user.id}, 'warning')">Warn</button>
                <button type="button" class="orders-btn orders-btn--danger" onclick="takeUserAction(${user.id}, 'ban')">Ban</button>
                <button type="button" class="orders-btn orders-btn--danger" onclick="takeUserAction(${user.id}, 'remove')">Remove</button>
                <button type="button" class="orders-btn orders-btn--ghost" onclick="takeUserAction(${user.id}, 'activate')">Activate</button>
            </div>
        </article>
    `).join("");
}

function renderActions(actions) {
    if (!actions.length) {
        actionsEl.innerHTML = `<div class="orders-empty">No admin actions have been recorded yet.</div>`;
        return;
    }

    actionsEl.innerHTML = actions.map((action) => `
        <article class="admin-card">
            <div class="admin-card__top">
                <div>
                    <h4>${escapeHtml(action.action_type)}</h4>
                    <p>${escapeHtml(action.admin_name)} acted on ${escapeHtml(action.target_name)} (${escapeHtml(action.target_role)})</p>
                </div>
            </div>
            <div class="admin-card__message">
                <span>Notes</span>
                <p>${escapeHtml(action.notes || "No notes added")}</p>
            </div>
        </article>
    `).join("");
}

async function loadDashboard() {
    try {
        showFeedback("", "success");
        const data = await fetchJson(`${API_BASE}/admin/dashboard`, {
            headers: { "Authorization": `Bearer ${adminToken}` }
        });
        if (!data) return;
        renderSummary(data.summary || {});
        renderReports(Array.isArray(data.reports) ? data.reports : []);
        renderUsers(Array.isArray(data.users) ? data.users : []);
        renderActions(Array.isArray(data.actions) ? data.actions : []);
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function takeUserAction(userId, action) {
    const note = String(document.getElementById(`userNote-${userId}`)?.value || "").trim();

    try {
        const data = await fetchJson(`${API_BASE}/admin/users/${userId}/action`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({ action, notes: note })
        });
        showFeedback(data?.message || "Admin action saved", "success");
        await loadDashboard();
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function takeReportAction(reportId, targetUserId, action) {
    const note = String(document.getElementById(`reportNote-${reportId}`)?.value || "").trim();

    try {
        const data = await fetchJson(`${API_BASE}/admin/users/${targetUserId}/action`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({ action, notes: note, report_id: reportId })
        });
        showFeedback(data?.message || "Admin action saved", "success");
        await loadDashboard();
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function sendReviewMessage(reportId) {
    const note = String(document.getElementById(`reportNote-${reportId}`)?.value || "").trim();
    if (!note) {
        showFeedback("Enter the message to send about this review.", "error");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/admin/reports/${reportId}/message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({ notes: note })
        });
        showFeedback(data?.message || "Review message sent", "success");
        await loadDashboard();
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function dismissReport(reportId) {
    const note = String(document.getElementById(`reportNote-${reportId}`)?.value || "").trim();

    try {
        const data = await fetchJson(`${API_BASE}/admin/reports/${reportId}/dismiss`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({ notes: note })
        });
        showFeedback(data?.message || "Report dismissed", "success");
        await loadDashboard();
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function logoutAdmin() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${adminToken}` }
        });
    } catch {}

    localStorage.clear();
    window.location.href = "login.html";
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", (event) => {
        event.preventDefault();
        logoutAdmin();
    });
}

window.takeUserAction = takeUserAction;
window.takeReportAction = takeReportAction;
window.sendReviewMessage = sendReviewMessage;
window.dismissReport = dismissReport;

loadDashboard();
