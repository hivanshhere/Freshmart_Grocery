const API_BASE = "http://localhost:3000";

const msgEl = document.getElementById("msg");
const ownerAccountNoticeEl = document.getElementById("ownerAccountNotice");
const storeDisplayNameEl = document.getElementById("storeDisplayName");
const storeDisplayIdEl = document.getElementById("storeDisplayId");
const createStoreSectionEl = document.getElementById("createStoreSection");
const editStoreSectionEl = document.getElementById("editStoreSection");
const editStoreNameInput = document.getElementById("editStoreName");
const storeLatitudeEl = document.getElementById("storeLatitude");
const storeLongitudeEl = document.getElementById("storeLongitude");
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
    if (normalized === "message") return "Admin Message";
    return "Under Review";
}

function formatWarningMessage(warning) {
    return String(warning?.notes || warning?.admin_notes || warning?.message || "").trim();
}

function showOwnerNotice(profile, moderationReports = [], warningActions = []) {
    if (!ownerAccountNoticeEl) return;

    const status = String(profile?.account_status || localStorage.getItem("accountStatus") || "active").toLowerCase();
    const warningCount = Number(profile?.warning_count ?? localStorage.getItem("warningCount") ?? 0);
    const banReason = String(profile?.ban_reason || localStorage.getItem("banReason") || "").trim();
    const visibleReports = Array.isArray(moderationReports)
        ? moderationReports.filter((report) => {
            const action = String(report.resolution_action || "").toLowerCase();
            const statusValue = String(report.status || "").toLowerCase();
            return action === "warning" && statusValue === "resolved";
        })
        : [];
    const visibleWarnings = Array.isArray(warningActions)
        ? warningActions.filter((warning) => formatWarningMessage(warning))
        : [];
    const hasWarning = status === "warned" || warningCount > 0 || Boolean(banReason) || visibleWarnings.length > 0;

    if (!hasWarning) {
        ownerAccountNoticeEl.style.display = "none";
        ownerAccountNoticeEl.innerHTML = "";
        ownerAccountNoticeEl.className = "owner-notice";
        return;
    }

    const warningsHtml = visibleWarnings.length
        ? `
            <div class="owner-notice__list">
                ${visibleWarnings.map((warning) => `
                    <div class="owner-notice__item">
                        <h4>Warning From Admin</h4>
                        <div class="owner-notice__meta">Sent by ${escapeHtml(warning.admin_name || "Admin")}</div>
                        <span class="owner-notice__label">Warning Message</span>
                        <p>${escapeHtml(formatWarningMessage(warning))}</p>
                    </div>
                `).join("")}
            </div>
        `
        : "";

    const reportsHtml = visibleReports.length
        ? `
            <div class="owner-notice__list">
                ${visibleReports.map((report) => `
                    <div class="owner-notice__item">
                        <h4>${escapeHtml(report.report_type || "Complaint")} on Order #${Number(report.order_id) || 0} - ${escapeHtml(formatAdminAction(report.resolution_action || report.status))}</h4>
                        <div class="owner-notice__meta">Reported by ${escapeHtml(report.reporter_name || "Customer")} (${escapeHtml(report.reporter_role || "customer")})${report.store_name ? ` for ${escapeHtml(report.store_name)}` : ""}</div>
                        <span class="owner-notice__label">Customer Issue</span>
                        <p>${escapeHtml(report.message || "No details provided.")}</p>
                        <span class="owner-notice__label">${String(report.resolution_action || "").toLowerCase() === "message" ? "Admin Message" : "Admin Note"}</span>
                        <p>${escapeHtml(report.admin_notes || "No admin note added.")}</p>
                    </div>
                `).join("")}
            </div>
        `
        : "";

    ownerAccountNoticeEl.style.display = "block";
    ownerAccountNoticeEl.className = "owner-notice owner-notice--error";
    ownerAccountNoticeEl.innerHTML = `
        <details class="owner-notice__details">
            <summary>Warning${warningCount > 1 ? ` (${warningCount})` : ""}</summary>
            ${hasWarning ? `<p>Your store owner account has received ${warningCount} warning${warningCount === 1 ? "" : "s"} from the admin.</p>` : ""}
            ${hasWarning ? `<p><strong>Warning:</strong> ${escapeHtml(banReason || "Please review your recent activity and follow the platform rules to avoid stronger action.")}</p>` : ""}
            ${warningsHtml}
            ${reportsHtml}
        </details>
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
        storeLatitudeEl.value = "";
        storeLongitudeEl.value = "";
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
    storeLatitudeEl.value = store.latitude ?? "";
    storeLongitudeEl.value = store.longitude ?? "";
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
        const warningActions = profileData?.warning_actions || [];
        if (ownerProfile) {
            localStorage.setItem("accountStatus", ownerProfile.account_status || "active");
            localStorage.setItem("warningCount", String(ownerProfile.warning_count || 0));
            localStorage.setItem("banReason", ownerProfile.ban_reason || "");
        }
        showOwnerNotice(ownerProfile, moderationReports, warningActions);

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

function useCurrentLocation() {
    if (!currentStore) {
        setMsg("Create your store first", "error");
        return;
    }

    if (!navigator.geolocation) {
        setMsg("Location is not supported in this browser", "error");
        return;
    }

    setMsg("Getting your current location...");

    navigator.geolocation.getCurrentPosition(
        (position) => {
            storeLatitudeEl.value = position.coords.latitude.toFixed(7);
            storeLongitudeEl.value = position.coords.longitude.toFixed(7);
            setMsg("Current location added. Click Save Store Location to store it.", "success");
        },
        () => {
            setMsg("Could not get your location. Please allow location access and try again.", "error");
        },
        {
            enableHighAccuracy: true,
            timeout: 10000
        }
    );
}

async function saveStoreLocation() {
    if (!currentStore) {
        setMsg("Create your store first", "error");
        return;
    }

    const rawLatitude = String(storeLatitudeEl.value ?? "").trim();
    const rawLongitude = String(storeLongitudeEl.value ?? "").trim();

    if (!rawLatitude || !rawLongitude) {
        setMsg("Please enter store latitude and longitude before saving.", "error");
        alert("Error: Please enter your store latitude and longitude before saving.");
        return;
    }

    const latitude = Number(rawLatitude);
    const longitude = Number(rawLongitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        setMsg("Enter a valid latitude", "error");
        alert("Error: Enter a valid latitude.");
        return;
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        setMsg("Enter a valid longitude", "error");
        alert("Error: Enter a valid longitude.");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/store/location`, {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ latitude, longitude })
        });
        currentStore = data.store;
        setStoreUi(currentStore);
        setMsg(data.message || "Store location updated", "success");
        alert("Yes, your location has been saved successfully.");
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
window.useCurrentLocation = useCurrentLocation;
window.saveStoreLocation = saveStoreLocation;
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
