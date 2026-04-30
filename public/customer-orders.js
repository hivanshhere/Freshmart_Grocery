const API_BASE = "http://localhost:3000";

const customerFeedbackEl = document.getElementById("customerOrdersFeedback");
const customerSummaryEl = document.getElementById("customerOrdersSummary");
const customerListEl = document.getElementById("customerOrdersList");
const customerReviewMessagesEl = document.getElementById("customerReviewMessages");
const customerReportDrafts = {};

function customerToken() {
    return window.AppAuth?.getToken ? window.AppAuth.getToken() : (localStorage.getItem("authToken") || "");
}

function isCustomerReportEditing() {
    const active = document.activeElement;
    return !!active && active.closest(".report-form");
}

function captureCustomerReportDrafts() {
    if (!customerListEl) return;
    customerListEl.querySelectorAll(".report-form").forEach((formEl) => {
        const orderId = formEl.getAttribute("data-order-id");
        if (!orderId) return;

        const typeEl = formEl.querySelector("[data-field='type']");
        const ratingEl = formEl.querySelector("[data-field='rating']");
        const messageEl = formEl.querySelector("[data-field='message']");

        customerReportDrafts[orderId] = {
            reportType: String(typeEl?.value || "complaint"),
            rating: String(ratingEl?.value || ""),
            message: String(messageEl?.value || "")
        };
    });
}

function getCustomerReportDraft(orderId) {
    return customerReportDrafts[String(orderId)] || {
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
    if (normalized === "resolved") return "status-pill status-pill--resolved";
    if (normalized === "dismissed") return "status-pill status-pill--dismissed";
    if (normalized === "warning") return "status-pill status-pill--warning";
    if (normalized === "ban") return "status-pill status-pill--ban";
    if (normalized === "remove") return "status-pill status-pill--remove";
    return "status-pill status-pill--placed";
}

function statusMessage(status) {
    const normalized = String(status || "placed").toLowerCase();
    if (normalized === "accepted") return "The store owner has accepted this order.";
    if (normalized === "rejected") return "The store owner has rejected this order.";
    return "The store owner has not reviewed this order yet.";
}

function showFeedback(message, type) {
    if (!customerFeedbackEl) return;
    if (!message) {
        customerFeedbackEl.innerHTML = "";
        return;
    }
    customerFeedbackEl.innerHTML = `<div class="orders-feedback orders-feedback--${type === "error" ? "error" : "success"}">${escapeHtml(message)}</div>`;
}

function showCustomerReviewMessages(moderationReports = []) {
    if (!customerReviewMessagesEl) return;

    const reviewMessages = Array.isArray(moderationReports)
        ? moderationReports.filter((report) => {
            const isReview = String(report.report_type || "").toLowerCase() === "review";
            const isMessage = String(report.resolution_action || "").toLowerCase() === "message";
            return isReview && isMessage && String(report.admin_notes || "").trim();
        })
        : [];

    if (!reviewMessages.length) {
        customerReviewMessagesEl.style.display = "none";
        customerReviewMessagesEl.innerHTML = "";
        return;
    }

    const reviewMessageItems = reviewMessages.map((report) => `
        <div class="account-review__item">
            <span>Review Message</span>
            <strong>${escapeHtml(report.admin_notes)}</strong>
        </div>
    `).join("");

    customerReviewMessagesEl.style.display = "block";
    customerReviewMessagesEl.innerHTML = `
        <details class="account-review__details">
            <summary>Review${reviewMessages.length > 1 ? ` (${reviewMessages.length})` : ""}</summary>
            <p>Please read the exact review message sent by the admin.</p>
            ${reviewMessageItems}
        </details>
    `;
}

async function fetchOrders() {
    const res = await fetch(`${API_BASE}/user/orders`, {
        headers: { "Authorization": `Bearer ${customerToken()}` }
    });
    if (res.status === 401 || res.status === 403) {
        window.AppAuth?.clearStoredSession?.();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || `Could not load orders (HTTP ${res.status})`);
    }
    return Array.isArray(data) ? data : [];
}

function renderSummary(orders) {
    if (!customerSummaryEl) return;
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

    customerSummaryEl.innerHTML = `
        <div class="orders-stat"><span class="orders-stat__label">Total Orders</span><strong>${counts.total}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Pending</span><strong>${counts.placed}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Accepted</span><strong>${counts.accepted}</strong></div>
        <div class="orders-stat"><span class="orders-stat__label">Rejected</span><strong>${counts.rejected}</strong></div>
    `;
}

function renderOrders(orders) {
    if (!customerListEl) return;
    captureCustomerReportDrafts();

    if (!orders.length) {
        customerListEl.innerHTML = `<div class="orders-empty">You have not placed any orders yet.</div>`;
        return;
    }

    customerListEl.innerHTML = orders.map(order => {
        const visibleOrderNumber = Number(order.display_order_number) || Number(order.id) || 0;
        const draft = getCustomerReportDraft(order.id);
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
                    <a class="orders-btn orders-btn--ghost" href="stores.html">Keep Shopping</a>
                </div>

                <div class="order-card__meta">
                    <div><span>Store</span><strong>${escapeHtml(order.store_name || "Store")}</strong></div>
                    <div><span>Type</span><strong>${escapeHtml(order.delivery_type || "delivery")}</strong></div>
                    <div><span>Total</span><strong>${formatMoney(order.total_amount)}</strong></div>
                    <div><span>Status Update</span><strong>${escapeHtml(statusMessage(order.status))}</strong></div>
                </div>

                <div class="order-card__section">
                    <span>Items</span>
                    <div class="order-items">${itemsHtml}</div>
                </div>

                <div class="order-card__actions">
                    <button type="button" class="orders-btn orders-btn--danger" onclick="deleteCustomerOrder(${order.id})">Delete</button>
                </div>

                <div class="order-card__section">
                    <span>Store Owner Review / Complaint To Admin</span>
                    <div class="report-form" data-order-id="${order.id}">
                        <select id="customerReportType-${order.id}" class="report-form__input" data-field="type">
                            <option value="complaint" ${draft.reportType === "complaint" ? "selected" : ""}>Complaint</option>
                            <option value="review" ${draft.reportType === "review" ? "selected" : ""}>Review</option>
                        </select>
                        <input id="customerReportRating-${order.id}" class="report-form__input" data-field="rating" type="number" min="1" max="5" placeholder="Rating (1-5 for review)" value="${escapeHtml(draft.rating)}">
                        <textarea id="customerReportMessage-${order.id}" class="report-form__input report-form__textarea" data-field="message" placeholder="Share your experience with this store owner">${escapeHtml(draft.message)}</textarea>
                        <button type="button" class="orders-btn orders-btn--ghost" onclick="submitCustomerReport(${order.id}, ${Number(order.owner_id) || 0})">Send To Admin</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

async function deleteCustomerOrder(orderId) {
    const confirmed = window.confirm(`Delete order #${orderId}?`);
    if (!confirmed) return;

    try {
        const res = await fetch(`${API_BASE}/user/orders/${orderId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${customerToken()}` }
        });

        if (res.status === 401 || res.status === 403) {
            window.AppAuth?.clearStoredSession?.();
            window.location.href = "login.html";
            return;
        }

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(data?.message || `Could not delete order (HTTP ${res.status})`);
        }

        showFeedback(data?.message || "The order was removed from your order history.", "success");
        await loadCustomerOrders();
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function submitCustomerReport(orderId, targetUserId) {
    if (!targetUserId) {
        showFeedback("This order does not include owner information for reporting.", "error");
        return;
    }

    const typeEl = document.getElementById(`customerReportType-${orderId}`);
    const ratingEl = document.getElementById(`customerReportRating-${orderId}`);
    const messageEl = document.getElementById(`customerReportMessage-${orderId}`);

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

        const res = await fetch(`${API_BASE}/reports`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${customerToken()}`
            },
            body: JSON.stringify(payload)
        });

        if (res.status === 401 || res.status === 403) {
            window.AppAuth?.clearStoredSession?.();
            window.location.href = "login.html";
            return;
        }

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(data?.message || `Could not submit report (HTTP ${res.status})`);
        }

        delete customerReportDrafts[String(orderId)];
        if (ratingEl) ratingEl.value = "";
        if (messageEl) messageEl.value = "";
        showFeedback(data?.message || "Your report was sent to the admin.", "success");
        window.alert(data?.message || "Your report was sent to the admin.");
    } catch (e) {
        showFeedback(e.message, "error");
    }
}

async function loadCustomerOrders() {
    try {
        const orders = await fetchOrders();
        if (!orders) return;
        renderSummary(orders);
        if (!isCustomerReportEditing()) {
            renderOrders(orders);
        }
    } catch (e) {
        if (customerSummaryEl) customerSummaryEl.innerHTML = "";
        if (customerListEl) customerListEl.innerHTML = `<div class="orders-empty">${escapeHtml(e.message)}</div>`;
        showFeedback(e.message, "error");
    }
}

if (customerListEl) {
    customerListEl.addEventListener("input", (event) => {
        const formEl = event.target.closest(".report-form");
        if (!formEl) return;
        const orderId = formEl.getAttribute("data-order-id");
        if (!orderId) return;

        customerReportDrafts[orderId] = {
            reportType: String(formEl.querySelector("[data-field='type']")?.value || "complaint"),
            rating: String(formEl.querySelector("[data-field='rating']")?.value || ""),
            message: String(formEl.querySelector("[data-field='message']")?.value || "")
        };
    });
}

async function initCustomerOrdersPage() {
    const session = await window.AppAuth?.validateCurrentSession?.({
        expectedRole: "customer",
        afterLogin: "customer-orders.html"
    });
    if (!session?.user) return;
    showCustomerReviewMessages(session.moderation_reports || []);
    loadCustomerOrders();
}

initCustomerOrdersPage();

window.deleteCustomerOrder = deleteCustomerOrder;
window.submitCustomerReport = submitCustomerReport;
