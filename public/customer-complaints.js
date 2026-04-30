const API_BASE = "http://localhost:3000";

const complaintsFeedbackEl = document.getElementById("customerComplaintsFeedback");
const complaintsSummaryEl = document.getElementById("customerComplaintsSummary");
const complaintsListEl = document.getElementById("customerComplaintsList");
const customerAccountWarningEl = document.getElementById("customerAccountWarning");

function customerToken() {
    return window.AppAuth?.getToken ? window.AppAuth.getToken() : (localStorage.getItem("authToken") || "");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatMoney(value) {
    const amount = Number(value) || 0;
    return `Rs. ${amount.toFixed(2)}`;
}

function statusClass(status) {
    const normalized = String(status || "pending").toLowerCase();
    if (normalized === "accepted") return "status-pill status-pill--accepted";
    if (normalized === "rejected") return "status-pill status-pill--rejected";
    if (normalized === "resolved") return "status-pill status-pill--resolved";
    if (normalized === "dismissed") return "status-pill status-pill--dismissed";
    if (normalized === "warning") return "status-pill status-pill--warning";
    if (normalized === "ban") return "status-pill status-pill--ban";
    if (normalized === "remove") return "status-pill status-pill--remove";
    if (normalized === "message") return "status-pill status-pill--resolved";
    return "status-pill status-pill--placed";
}

function showFeedback(message, type) {
    if (!complaintsFeedbackEl) return;
    if (!message) {
        complaintsFeedbackEl.innerHTML = "";
        return;
    }
    complaintsFeedbackEl.innerHTML = `<div class="orders-feedback orders-feedback--${type === "error" ? "error" : "success"}">${escapeHtml(message)}</div>`;
}

function warningText(warning) {
    return String(warning?.notes || warning?.admin_notes || warning?.message || "").trim();
}

function showCustomerWarning(profile, warningActions = []) {
    if (!customerAccountWarningEl) return;

    const status = String(profile?.account_status || localStorage.getItem("accountStatus") || "active").toLowerCase();
    const warningCount = Number(profile?.warning_count ?? localStorage.getItem("warningCount") ?? 0);
    const banReason = String(profile?.ban_reason || localStorage.getItem("banReason") || "").trim();
    const warnings = Array.isArray(warningActions)
        ? warningActions.filter((warning) => warningText(warning))
        : [];

    if (status !== "warned" && warningCount <= 0 && !banReason && warnings.length === 0) {
        customerAccountWarningEl.style.display = "none";
        customerAccountWarningEl.innerHTML = "";
        return;
    }

    const warningItems = warnings.length
        ? warnings.map((warning) => `
            <div class="account-warning__item">
                <span>Warning Message</span>
                <strong>${escapeHtml(warningText(warning))}</strong>
            </div>
        `).join("")
        : `
            <div class="account-warning__item">
                <span>Warning Message</span>
                <strong>${escapeHtml(banReason || "Please review your recent activity and follow the platform rules to avoid stronger action.")}</strong>
            </div>
        `;

    customerAccountWarningEl.style.display = "block";
    customerAccountWarningEl.innerHTML = `
        <details class="account-warning__details">
            <summary>Warning${warningCount > 1 ? ` (${warningCount})` : ""}</summary>
            <p>This is a warning from the admin. Please read the exact message below.</p>
            ${warningItems}
        </details>
    `;
}

function adminActionLabel(action, status) {
    const normalizedAction = String(action || "").toLowerCase();
    const normalizedStatus = String(status || "").toLowerCase();
    if (normalizedAction === "warning") return "Warning issued";
    if (normalizedAction === "ban") return "User banned";
    if (normalizedAction === "remove") return "User removed";
    if (normalizedAction === "activate") return "Account reactivated";
    if (normalizedAction === "message") return "Admin message sent";
    if (normalizedStatus === "dismissed") return "Complaint dismissed";
    if (normalizedStatus === "resolved") return "Action completed";
    return "Pending review";
}

function adminActionMessage(report) {
    const resolution = String(report.resolution_action || "").toLowerCase();
    if (resolution === "warning") {
        return "The admin reviewed this complaint and issued a warning.";
    }
    if (resolution === "ban") {
        return "The admin reviewed this complaint and banned the reported user.";
    }
    if (resolution === "remove") {
        return "The admin reviewed this complaint and removed the reported user from the platform.";
    }
    if (resolution === "activate") {
        return "The admin reviewed the case and reactivated the account.";
    }
    if (resolution === "message") {
        return "The admin reviewed this review and sent a message.";
    }
    if (String(report.status || "").toLowerCase() === "dismissed") {
        return "The admin reviewed this report and dismissed it.";
    }
    if (String(report.status || "").toLowerCase() === "resolved") {
        return "The admin reviewed this report and completed an action.";
    }
    return "Your complaint or review is waiting for admin review.";
}

function formatReportType(report) {
    const type = String(report.report_type || "complaint").toLowerCase();
    const rating = Number(report.rating);
    if (type === "review" && Number.isFinite(rating) && rating > 0) {
        return `Review (${rating}/5)`;
    }
    return type === "review" ? "Review" : "Complaint";
}

async function fetchMyReports() {
    const res = await fetch(`${API_BASE}/my-reports`, {
        headers: { "Authorization": `Bearer ${customerToken()}` }
    });
    if (res.status === 401 || res.status === 403) {
        window.AppAuth?.clearStoredSession?.();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || `Could not load report history (HTTP ${res.status})`);
    }
    return Array.isArray(data) ? data : [];
}

function renderSummary(reports) {
    if (!complaintsSummaryEl) return;

    const counts = {
        total: reports.length,
        complaints: 0,
        reviews: 0,
        pending: 0
    };

    reports.forEach((report) => {
        const type = String(report.report_type || "").toLowerCase();
        const status = String(report.status || "").toLowerCase();
        if (type === "complaint") counts.complaints += 1;
        if (type === "review") counts.reviews += 1;
        if (status === "pending") counts.pending += 1;
    });

    complaintsSummaryEl.innerHTML = `
        <div class="orders-stat"><span class="orders-stat__label">Total Filed</span><strong>${counts.total}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Complaints</span><strong>${counts.complaints}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Reviews</span><strong>${counts.reviews}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Pending</span><strong>${counts.pending}</strong></div>
    `;
}

function renderReports(reports) {
    if (!complaintsListEl) return;

    if (!reports.length) {
        complaintsListEl.innerHTML = `
            <div class="orders-empty">
                You have not filed any complaint or review yet.
            </div>
        `;
        return;
    }

    complaintsListEl.innerHTML = reports.map((report) => {
        const orderNumber = Number(report.order_display_number) || Number(report.order_id) || 0;
        return `
            <article class="order-card">
                <div class="order-card__top">
                    <div>
                        <h3>${escapeHtml(formatReportType(report))} for Order #${orderNumber}</h3>
                        <p class="${statusClass(report.resolution_action || report.status)}">${escapeHtml(adminActionLabel(report.resolution_action, report.status))}</p>
                    </div>
                    <a class="orders-btn orders-btn--ghost" href="customer-orders.html">My Orders</a>
                </div>

                <div class="order-card__meta">
                    <div><span>Store</span><strong>${escapeHtml(report.store_name || "Store")}</strong></div>
                    <div><span>Against</span><strong>${escapeHtml(report.target_name || "User")} (${escapeHtml(report.target_role || "user")})</strong></div>
                    <div><span>Order Type</span><strong>${escapeHtml(report.delivery_type || "N/A")}</strong></div>
                    <div><span>Order Total</span><strong>${formatMoney(report.total_amount)}</strong></div>
                    <div><span>Order Status</span><strong>${escapeHtml(report.order_status || "placed")}</strong></div>
                    <div><span>Handled By</span><strong>${escapeHtml(report.resolved_by_name || (String(report.status || "").toLowerCase() === "pending" ? "Pending" : "Admin"))}</strong></div>
                </div>

                <div class="order-card__section">
                    <span>Admin Review</span>
                    <strong>${escapeHtml(adminActionMessage(report))}</strong>
                </div>

                <div class="order-card__section">
                    <span>Your Message</span>
                    <strong>${escapeHtml(report.message || "No message added.")}</strong>
                </div>

                <div class="order-card__section">
                    <span>Admin Notes</span>
                    <strong>${escapeHtml(report.admin_notes || "No admin note added yet.")}</strong>
                </div>
            </article>
        `;
    }).join("");
}

async function loadComplaintsPage() {
    try {
        const reports = await fetchMyReports();
        if (!reports) return;
        renderSummary(reports);
        renderReports(reports);
    } catch (e) {
        if (complaintsSummaryEl) complaintsSummaryEl.innerHTML = "";
        if (complaintsListEl) complaintsListEl.innerHTML = `<div class="orders-empty">${escapeHtml(e.message)}</div>`;
        showFeedback(e.message, "error");
    }
}

async function initComplaintsPage() {
    const session = await window.AppAuth?.validateCurrentSession?.({
        expectedRole: "customer",
        afterLogin: "customer-complaints.html"
    });
    if (!session?.user) return;
    showCustomerWarning(session.user, session.warning_actions || []);
    loadComplaintsPage();
}

initComplaintsPage();
