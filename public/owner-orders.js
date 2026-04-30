const API_BASE = "http://localhost:3000";

const feedbackEl = document.getElementById("ownerOrdersFeedback");
const summaryEl = document.getElementById("ownerOrdersSummary");
const listEl = document.getElementById("ownerOrdersList");
const ownerReviewMessagesEl = document.getElementById("ownerReviewMessages");
const logoutBtn = document.getElementById("ownerLogoutBtn");

let currentStore = null;
const ownerReportDrafts = {};

function ownerToken() {
    return window.AppAuth?.getToken ? window.AppAuth.getToken() : (localStorage.getItem("authToken") || "");
}

function isOwnerReportEditing() {
    const active = document.activeElement;
    return !!active && active.closest(".report-form");
}

function captureOwnerReportDrafts() {
    if (!listEl) return;
    listEl.querySelectorAll(".report-form").forEach((formEl) => {
        const orderId = formEl.getAttribute("data-order-id");
        if (!orderId) return;

        const typeEl = formEl.querySelector("[data-field='type']");
        const ratingEl = formEl.querySelector("[data-field='rating']");
        const messageEl = formEl.querySelector("[data-field='message']");

        ownerReportDrafts[orderId] = {
            reportType: String(typeEl?.value || "complaint"),
            rating: String(ratingEl?.value || ""),
            message: String(messageEl?.value || "")
        };
    });
}

function getOwnerReportDraft(orderId) {
    return ownerReportDrafts[String(orderId)] || {
        reportType: "complaint",
        rating: "",
        message: ""
    };
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
    const normalized = String(status || "placed").toLowerCase();
    if (normalized === "accepted") return "status-pill status-pill--accepted";
    if (normalized === "rejected") return "status-pill status-pill--rejected";
    return "status-pill status-pill--placed";
}

function showFeedback(message, type) {
    if (!feedbackEl) return;
    if (!message) {
        feedbackEl.innerHTML = "";
        return;
    }
    feedbackEl.innerHTML = `<div class="orders-feedback orders-feedback--${type === "error" ? "error" : "success"}">${escapeHtml(message)}</div>`;
}

function renderOwnerReviewMessages(reports = []) {
    if (!ownerReviewMessagesEl) return;

    const reviewMessages = Array.isArray(reports)
        ? reports.filter((report) => {
            const isReview = String(report.report_type || "").toLowerCase() === "review";
            const isMessage = String(report.resolution_action || "").toLowerCase() === "message";
            return isReview && isMessage && String(report.admin_notes || "").trim();
        })
        : [];

    if (!reviewMessages.length) {
        ownerReviewMessagesEl.style.display = "none";
        ownerReviewMessagesEl.innerHTML = "";
        return;
    }

    ownerReviewMessagesEl.style.display = "block";
    ownerReviewMessagesEl.innerHTML = `
        <details class="account-review__details">
            <summary>Review${reviewMessages.length > 1 ? ` (${reviewMessages.length})` : ""}</summary>
            <p>Please read the exact review message sent by the admin.</p>
            ${reviewMessages.map((report) => `
                <div class="account-review__item">
                    <span>Review Message</span>
                    <strong>${escapeHtml(report.admin_notes)}</strong>
                </div>
            `).join("")}
        </details>
    `;
}

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        window.AppAuth?.clearStoredSession?.();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || `Request failed (HTTP ${res.status})`);
    }
    return data;
}

function renderSummary(orders) {
    if (!summaryEl) return;
    const counts = {
        total: orders.length,
        placed: 0,
        accepted: 0,
        rejected: 0
    };

    orders.forEach(order => {
        const status = String(order.status || "placed").toLowerCase();
        if (counts[status] !== undefined) counts[status] += 1;
    });

    summaryEl.innerHTML = `
        <div class="orders-stat"><span class="orders-stat__label">Total Orders</span><strong>${counts.total}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Placed</span><strong>${counts.placed}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Accepted</span><strong>${counts.accepted}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Rejected</span><strong>${counts.rejected}</strong></div>
    `;
}

function renderOrders(orders) {
    if (!listEl) return;
    captureOwnerReportDrafts();

    if (!orders.length) {
        listEl.innerHTML = `<div class="orders-empty">No orders yet. New customer orders will appear here.</div>`;
        return;
    }

    listEl.innerHTML = orders.map(order => {
        const visibleOrderNumber = Number(order.display_order_number) || Number(order.id) || 0;
        const draft = getOwnerReportDraft(order.id);
        const itemsHtml = (order.items || []).length
            ? order.items.map(item => `
                <div class="order-item">
                    <div>
                        <div class="order-item__name">${escapeHtml(item.product_name)}</div>
                        <div class="order-item__meta">Qty: ${Number(item.qty) || 0} &bull; Unit Price: ${formatMoney(item.unit_price)}</div>
                    </div>
                    <div class="order-item__meta">${formatMoney(item.line_total || ((Number(item.qty) || 0) * (Number(item.unit_price) || 0)))}</div>
                </div>
            `).join("")
            : `<div class="orders-empty">Item details are not available for this older order.</div>`;

        return `
            <article class="order-card">
                <div class="order-card__top">
                    <div>
                        <h3>Order #${visibleOrderNumber}</h3>
                        <p class="${statusClass(order.status)}">${escapeHtml(order.status || "placed")}</p>
                    </div>
                    <a class="orders-btn orders-btn--ghost" href="owner-dashboard.html">Dashboard</a>
                </div>

                <div class="order-card__meta">
                    <div><span>Customer</span><strong>${escapeHtml(order.customer_name || "Customer")}</strong></div>
                    <div><span>Store</span><strong>${escapeHtml(currentStore?.store_name || localStorage.getItem("storeName") || "Store")}</strong></div>
                    <div><span>Type</span><strong>${escapeHtml(order.delivery_type || "delivery")}</strong></div>
                    <div><span>Total</span><strong>${formatMoney(order.total_amount)}</strong></div>
                </div>

                <div class="order-card__section">
                    <span>Items</span>
                    <div class="order-items">${itemsHtml}</div>
                </div>

                <div class="order-card__actions">
                    <button type="button" class="orders-btn orders-btn--primary" onclick="updateOrderStatus(${order.id}, 'accepted')">Accept</button>
                    <button type="button" class="orders-btn orders-btn--ghost" onclick="updateOrderStatus(${order.id}, 'rejected')">Reject</button>
                    <button type="button" class="orders-btn orders-btn--danger" onclick="deleteOrder(${order.id})">Delete</button>
                </div>

                <div class="order-card__section">
                    <span>Customer Review / Complaint To Admin</span>
                    <div class="report-form" data-order-id="${order.id}">
                        <select id="ownerReportType-${order.id}" class="report-form__input" data-field="type">
                            <option value="complaint" ${draft.reportType === "complaint" ? "selected" : ""}>Complaint</option>
                            <option value="review" ${draft.reportType === "review" ? "selected" : ""}>Review</option>
                        </select>
                        <input id="ownerReportRating-${order.id}" class="report-form__input" data-field="rating" type="number" min="1" max="5" placeholder="Rating (1-5 for review)" value="${escapeHtml(draft.rating)}">
                        <textarea id="ownerReportMessage-${order.id}" class="report-form__input report-form__textarea" data-field="message" placeholder="Explain the customer behaviour for the admin">${escapeHtml(draft.message)}</textarea>
                        <button type="button" class="orders-btn orders-btn--ghost" onclick="submitOwnerReport(${order.id}, ${Number(order.customer_user_id) || 0})">Send To Admin</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

async function checkNewOrderNotifications(storeId) {
    const data = await fetchJson(`${API_BASE}/owner/orders/${storeId}/notifications`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${ownerToken()}` }
    });
    const count = Number(data?.count) || 0;
    if (count <= 0) return;

    const message = count === 1
        ? "A new order arrived for your store."
        : `${count} new orders arrived for your store.`;

    showFeedback(message, "success");
    window.alert(message);
}

async function loadOrders() {
    try {
        currentStore = await fetchJson(`${API_BASE}/owner/store`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${ownerToken()}` }
        });

        const [orders] = await Promise.all([
            fetchJson(`${API_BASE}/owner/orders/${currentStore.id}`, {
                method: "GET",
                headers: { "Authorization": `Bearer ${ownerToken()}` }
            }),
            checkNewOrderNotifications(currentStore.id)
        ]);

        renderSummary(Array.isArray(orders) ? orders : []);
        if (!isOwnerReportEditing()) {
            renderOrders(Array.isArray(orders) ? orders : []);
        }
    } catch (e) {
        if (summaryEl) summaryEl.innerHTML = "";
        if (listEl) listEl.innerHTML = `<div class="orders-empty">${escapeHtml(e.message)}</div>`;
        showFeedback(e.message, "error");
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        await fetchJson(`${API_BASE}/owner/orders/${orderId}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ownerToken()}`
            },
            body: JSON.stringify({ status })
        });
        showFeedback(`Order status updated to ${status}.`, "success");
        await loadOrders();
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function deleteOrder(orderId) {
    const confirmed = window.confirm(`Delete order #${orderId} from the owner panel?`);
    if (!confirmed) return;

    try {
        await fetchJson(`${API_BASE}/owner/orders/${orderId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${ownerToken()}`
            }
        });
        showFeedback("The order was removed from the owner page only.", "success");
        await loadOrders();
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function submitOwnerReport(orderId, targetUserId) {
    if (!targetUserId) {
        showFeedback("This older order does not have enough customer data for reporting.", "error");
        return;
    }

    const typeEl = document.getElementById(`ownerReportType-${orderId}`);
    const ratingEl = document.getElementById(`ownerReportRating-${orderId}`);
    const messageEl = document.getElementById(`ownerReportMessage-${orderId}`);

    const reportType = String(typeEl?.value || "complaint");
    const rating = String(ratingEl?.value || "").trim();
    const message = String(messageEl?.value || "").trim();

    if (!message) {
        showFeedback("Please enter report details before sending them to the admin.", "error");
        return;
    }

    if (reportType === "review" && (!rating || Number(rating) < 1 || Number(rating) > 5)) {
        showFeedback("Please enter a rating between 1 and 5 for a review.", "error");
        return;
    }

    try {
        const payload = {
            order_id: orderId,
            target_user_id: targetUserId,
            report_type: reportType,
            message
        };
        if (reportType === "review") payload.rating = Number(rating);

        const res = await fetchJson(`${API_BASE}/reports`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ownerToken()}`
            },
            body: JSON.stringify(payload)
        });

        delete ownerReportDrafts[String(orderId)];
        if (ratingEl) ratingEl.value = "";
        if (messageEl) messageEl.value = "";
        showFeedback(res?.message || "Your report was sent to the admin.", "success");
        window.alert(res?.message || "Your report was sent to the admin.");
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function logoutOwner() {
    await window.AppAuth?.logoutUser?.();
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logoutOwner();
    });
}

if (listEl) {
    listEl.addEventListener("input", (event) => {
        const formEl = event.target.closest(".report-form");
        if (!formEl) return;
        const orderId = formEl.getAttribute("data-order-id");
        if (!orderId) return;

        ownerReportDrafts[orderId] = {
            reportType: String(formEl.querySelector("[data-field='type']")?.value || "complaint"),
            rating: String(formEl.querySelector("[data-field='rating']")?.value || ""),
            message: String(formEl.querySelector("[data-field='message']")?.value || "")
        };
    });
}

window.updateOrderStatus = updateOrderStatus;
window.deleteOrder = deleteOrder;
window.submitOwnerReport = submitOwnerReport;

async function initOwnerOrdersPage() {
    const session = await window.AppAuth?.validateCurrentSession?.({
        expectedRole: "owner",
        afterLogin: "owner-orders.html"
    });
    if (!session?.user) return;
    renderOwnerReviewMessages(session.moderation_reports || []);
    loadOrders();
}

initOwnerOrdersPage();
