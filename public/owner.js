const API_BASE = "http://localhost:3000";

const msgEl = document.getElementById("msg");
const ownerAccountNoticeEl = document.getElementById("ownerAccountNotice");
const storeDisplayNameEl = document.getElementById("storeDisplayName");
const storeDisplayIdEl = document.getElementById("storeDisplayId");
const createStoreSectionEl = document.getElementById("createStoreSection");
const editStoreSectionEl = document.getElementById("editStoreSection");
const editStoreNameInput = document.getElementById("editStoreName");
const addProductBtn = document.getElementById("addProductBtn");
const ownerProductListEl = document.getElementById("ownerProductList");
const deliveryAvailableEl = document.getElementById("deliveryAvailable");
const deliveryChargeEl = document.getElementById("deliveryCharge");
const minOrderEl = document.getElementById("minOrder");
const pickupAvailableEl = document.getElementById("pickupAvailable");
const slotTimeInputEl = document.getElementById("slotTimeInput");
const slotListEl = document.getElementById("slotList");
const productFormEl = document.getElementById("productForm");

let currentStore = null;

function ownerToken() {
    return window.AppAuth?.getToken ? window.AppAuth.getToken() : (localStorage.getItem("authToken") || "");
}

function formatAdminAction(action) {
    const normalized = String(action || "").toLowerCase();
    if (normalized === "warning") return "Warning Issued";
    if (normalized === "ban") return "Banned";
    if (normalized === "remove") return "Removed";
    if (normalized === "dismissed") return "Dismissed";
    if (normalized === "activate") return "Reactivated";
    return "Under Review";
}

function showOwnerNotice(profile, moderationReports = []) {
    if (!ownerAccountNoticeEl) return;

    const status = String(profile?.account_status || localStorage.getItem("accountStatus") || "active").toLowerCase();
    const warningCount = Number(profile?.warning_count ?? localStorage.getItem("warningCount") ?? 0);
    const banReason = String(profile?.ban_reason || localStorage.getItem("banReason") || "").trim();
    const visibleReports = Array.isArray(moderationReports)
        ? moderationReports.filter((report) => ["resolved", "dismissed"].includes(String(report.status || "").toLowerCase()))
        : [];

    if (status !== "warned" && warningCount <= 0 && visibleReports.length === 0) {
        ownerAccountNoticeEl.style.display = "none";
        ownerAccountNoticeEl.innerHTML = "";
        ownerAccountNoticeEl.className = "owner-notice";
        return;
    }

    const reportsHtml = visibleReports.length
        ? `
            <div class="owner-notice__list">
                ${visibleReports.map((report) => `
                    <div class="owner-notice__item">
                        <h4>${escapeHtml(report.report_type || "Complaint")} on Order #${Number(report.order_id) || 0} - ${escapeHtml(formatAdminAction(report.resolution_action || report.status))}</h4>
                        <div class="owner-notice__meta">Reported by ${escapeHtml(report.reporter_name || "Customer")} (${escapeHtml(report.reporter_role || "customer")})${report.store_name ? ` for ${escapeHtml(report.store_name)}` : ""}</div>
                        <span class="owner-notice__label">Customer Issue</span>
                        <p>${escapeHtml(report.message || "No details provided.")}</p>
                        <span class="owner-notice__label">Admin Note</span>
                        <p>${escapeHtml(report.admin_notes || "No admin note added.")}</p>
                    </div>
                `).join("")}
            </div>
        `
        : "";

    ownerAccountNoticeEl.style.display = "block";
    ownerAccountNoticeEl.className = "owner-notice owner-notice--warned";
    ownerAccountNoticeEl.innerHTML = `
        <h3>Admin Warning On Your Account</h3>
        <p>Your store owner account has received ${warningCount} warning${warningCount === 1 ? "" : "s"} from the admin.</p>
        <p>${escapeHtml(banReason || "Please review your recent activity and follow the platform rules to avoid stronger action.")}</p>
        ${reportsHtml}
    `;
}

function setMsg(text, type) {
    if (!msgEl) return;
    msgEl.innerText = text || "";
    msgEl.className = "";
    if (type === "success") msgEl.classList.add("msg--success");
    if (type === "error") msgEl.classList.add("msg--error");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function authHeaders(extra = {}) {
    return {
        "Authorization": `Bearer ${ownerToken()}`,
        ...extra
    };
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        window.AppAuth?.clearStoredSession?.();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || "Server error");
    }
    return data;
}

function setStoreUi(store) {
    if (!store) {
        storeDisplayNameEl.innerText = "Not created";
        storeDisplayIdEl.innerText = "-";
        createStoreSectionEl.style.display = "block";
        editStoreSectionEl.style.display = "none";
        addProductBtn.disabled = true;
        ownerProductListEl.innerHTML = "";
        slotListEl.innerHTML = "";
        return;
    }

    storeDisplayNameEl.innerText = store.store_name;
    storeDisplayIdEl.innerText = String(store.id);
    createStoreSectionEl.style.display = "none";
    editStoreSectionEl.style.display = "block";
    editStoreNameInput.value = store.store_name;
    addProductBtn.disabled = false;

    localStorage.setItem("storeId", String(store.id));
    localStorage.setItem("storeName", String(store.store_name));

    deliveryAvailableEl.checked = !!store.delivery_available;
    deliveryChargeEl.value = Number(store.delivery_charge || 0);
    minOrderEl.value = Number(store.min_order_free_delivery || 0);
    pickupAvailableEl.checked = !!store.pickup_available;
}

function renderProducts(products) {
    if (!ownerProductListEl) return;

    if (!products || products.length === 0) {
        ownerProductListEl.innerHTML = "<div class='store-card'><h3>No products yet</h3><p>Add your first product above.</p></div>";
        return;
    }

    ownerProductListEl.innerHTML = products.map((product) => {
        const quantity = Number(product.quantity || 0);
        const price = Number(product.price || 0);
        const description = String(product.description || "").trim();
        const image = product.image ? `<img src="${API_BASE}/uploads/${encodeURIComponent(product.image)}" class="product-img" alt="${escapeHtml(product.name)}">` : "";
        return `
            <div class="store-card">
                ${image}
                <h3>${escapeHtml(product.name)}</h3>
                ${description ? `<p class="product-description">${escapeHtml(description)}</p>` : ""}
                <p>Price: Rs. ${price.toFixed(2)} / ${quantity} ${escapeHtml(product.unit || "")}</p>
                <button type="button" class="store-card__remove-btn" onclick="removeProduct(${product.id})">Remove Product</button>
            </div>
        `;
    }).join("");
}

function renderSlots(slots) {
    if (!slotListEl) return;
    if (!slots || slots.length === 0) {
        slotListEl.innerHTML = "<p class='help-text'>No pickup slots added yet.</p>";
        return;
    }

    slotListEl.innerHTML = `
        <div class="slot-list">
            ${slots.map((slot) => `
                <div class="slot-row">
                    <span class="slot-row__time">${escapeHtml(slot.slot_time)}</span>
                    <button type="button" class="slot-row__btn" onclick="removeTimeSlot(${slot.id})">Remove</button>
                </div>
            `).join("")}
        </div>
    `;
}

async function loadStoreAndProducts() {
    try {
        setMsg("");
        const [profileData, storeData] = await Promise.all([
            fetchJson(`${API_BASE}/auth/me`, { headers: authHeaders() }),
            fetchJson(`${API_BASE}/owner/store`, { headers: authHeaders() })
        ]);

        const ownerProfile = profileData?.user || null;
        const moderationReports = profileData?.moderation_reports || [];
        if (ownerProfile) {
            localStorage.setItem("accountStatus", ownerProfile.account_status || "active");
            localStorage.setItem("warningCount", String(ownerProfile.warning_count || 0));
            localStorage.setItem("banReason", ownerProfile.ban_reason || "");
        }
        showOwnerNotice(ownerProfile, moderationReports);

        currentStore = storeData;
        setStoreUi(currentStore);

        if (!currentStore) return;

        const [productsData, slotsData] = await Promise.all([
            fetchJson(`${API_BASE}/owner/products`, { headers: authHeaders() }),
            fetchJson(`${API_BASE}/owner/slots`, { headers: authHeaders() })
        ]);

        renderProducts(productsData?.products || []);
        renderSlots(slotsData?.slots || []);
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function createStore() {
    const storeName = document.getElementById("storeName").value.trim();
    if (!storeName) {
        setMsg("Enter store name", "error");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/store`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ store_name: storeName })
        });
        currentStore = data.store;
        setStoreUi(currentStore);
        setMsg(data.message || "Store created", "success");
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function updateStoreName() {
    if (!currentStore) {
        setMsg("Create your store first", "error");
        return;
    }

    const storeName = editStoreNameInput.value.trim();
    if (!storeName) {
        setMsg("Enter store name", "error");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/store`, {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ store_name: storeName })
        });
        currentStore = data.store;
        setStoreUi(currentStore);
        setMsg(data.message || "Store updated", "success");
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function saveDeliverySettings() {
    if (!currentStore) {
        setMsg("Create your store first", "error");
        return;
    }

    try {
        const res = await fetchJson(`${API_BASE}/owner/store/delivery-settings`, {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                delivery_available: deliveryAvailableEl.checked,
                delivery_charge: Number(deliveryChargeEl.value) || 0,
                min_order: Number(minOrderEl.value) || 0,
                pickup_available: pickupAvailableEl.checked
            })
        });
        setMsg(res.message || "Delivery settings updated", "success");
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function addProduct(event) {
    event?.preventDefault();

    if (!currentStore) {
        setMsg("Create your store first", "error");
        return;
    }

    const name = document.getElementById("pname").value.trim();
    const description = document.getElementById("pdescription").value.trim();
    const price = Number(document.getElementById("pprice").value);
    const quantity = Number(document.getElementById("pquantity").value);
    const unit = document.getElementById("punit").value;
    const imageFile = document.getElementById("pimage").files[0];

    if (!name || !description || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !unit) {
        setMsg("Enter product name, description, valid price, quantity and unit", "error");
        return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("price", String(price));
    formData.append("quantity", String(quantity));
    formData.append("unit", unit);
    if (imageFile) formData.append("image", imageFile);

    try {
        const res = await fetch(`${API_BASE}/owner/products`, {
            method: "POST",
            headers: authHeaders(),
            body: formData
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Could not add product");

        productFormEl.reset();
        document.getElementById("punit").value = "kg";
        setMsg(data?.message || "Product added", "success");
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function removeProduct(productId) {
    try {
        const data = await fetchJson(`${API_BASE}/owner/products/${productId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsg(data.message || "Product removed", "success");
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function addTimeSlot() {
    if (!currentStore) {
        setMsg("Create your store first", "error");
        return;
    }

    const slotTime = slotTimeInputEl.value.trim();
    if (!slotTime) {
        setMsg("Enter a pickup slot", "error");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/slots`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ slot_time: slotTime })
        });
        slotTimeInputEl.value = "";
        setMsg(data.message || "Slot added", "success");
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function removeTimeSlot(slotId) {
    try {
        const data = await fetchJson(`${API_BASE}/owner/slots/${slotId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsg(data.message || "Slot removed", "success");
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message, "error");
    }
}

async function logout() {
    await window.AppAuth?.logoutUser?.();
}

if (productFormEl) {
    productFormEl.addEventListener("submit", addProduct);
}

window.createStore = createStore;
window.updateStoreName = updateStoreName;
window.saveDeliverySettings = saveDeliverySettings;
window.removeProduct = removeProduct;
window.addTimeSlot = addTimeSlot;
window.removeTimeSlot = removeTimeSlot;
window.logout = logout;

async function initOwnerDashboard() {
    const session = await window.AppAuth?.validateCurrentSession?.({
        expectedRole: "owner",
        afterLogin: "owner-dashboard.html"
    });
    if (!session?.user) return;
    loadStoreAndProducts();
}

initOwnerDashboard();
