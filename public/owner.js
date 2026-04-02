const API_BASE = "http://localhost:3000";

const role = localStorage.getItem("userRole");
const token = localStorage.getItem("authToken");

if (role !== "owner" || !token) {
    alert("Please login as a store owner");
    window.location.href = "login.html";
}

const msgEl = document.getElementById("msg");
const storeDisplayNameEl = document.getElementById("storeDisplayName");
const storeDisplayIdEl = document.getElementById("storeDisplayId");
const createStoreSectionEl = document.getElementById("createStoreSection");
const editStoreSectionEl = document.getElementById("editStoreSection");
const editStoreNameInput = document.getElementById("editStoreName");
const addProductBtn = document.getElementById("addProductBtn");
const ownerProductListEl = document.getElementById("ownerProductList");

/* Delivery settings inputs */
const deliveryAvailableEl = document.getElementById("deliveryAvailable");
const deliveryChargeEl = document.getElementById("deliveryCharge");
const minOrderEl = document.getElementById("minOrder");
const pickupAvailableEl = document.getElementById("pickupAvailable");

/* Slot manager inputs */
const slotTimeInputEl = document.getElementById("slotTimeInput");
const slotListEl = document.getElementById("slotList");

const addProductFieldErrors = {
    name: document.getElementById("pnameError"),
    description: document.getElementById("pdescriptionError"),
    price: document.getElementById("ppriceError"),
    quantity: document.getElementById("pquantityError"),
    unit: document.getElementById("punitError")
};

let currentStore = null;

function clearAddProductErrors() {
    Object.values(addProductFieldErrors).forEach(el => {
        if (el) el.innerText = "";
    });
}

function setAddProductError(field, message) {
    clearAddProductErrors();
    const el = addProductFieldErrors[field];
    if (el) el.innerText = message || "";
}

function setMsg(text) {
    if (!msgEl) return;
    msgEl.innerText = text || "";
    msgEl.classList.remove("msg--success");
    msgEl.classList.add("msg--error");
}

function setMsgSuccess(text) {
    if (!msgEl) return;
    msgEl.innerText = "";
    msgEl.classList.remove("msg--error");
    msgEl.classList.add("msg--success");
    if (text) alert(text);
}

function setMsgError(text) {
    if (!msgEl) return;
    msgEl.innerText = "";
    msgEl.classList.remove("msg--success");
    msgEl.classList.add("msg--error");
    if (text) alert(text);
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        localStorage.clear();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data && data.message ? data.message : "Server error";
        throw new Error(msg);
    }
    return data;
}

function setStoreUi(store) {
    if (!store) {
        storeDisplayNameEl.innerText = "Not created";
        storeDisplayIdEl.innerText = "—";
        createStoreSectionEl.style.display = "block";
        if (editStoreSectionEl) editStoreSectionEl.style.display = "none";
        addProductBtn.disabled = true;
        addProductBtn.style.opacity = "0.6";
        ownerProductListEl.innerHTML = "";
        if (slotListEl) slotListEl.innerHTML = "";
        return;
    }

    storeDisplayNameEl.innerText = String(store.store_name || "").toUpperCase();
    storeDisplayIdEl.innerText = store.id;
    createStoreSectionEl.style.display = "none";
    if (editStoreSectionEl) editStoreSectionEl.style.display = "block";
    if (editStoreNameInput) editStoreNameInput.value = String(store.store_name || "").toUpperCase();
    addProductBtn.disabled = false;
    addProductBtn.style.opacity = "1";

    localStorage.setItem("storeId", String(store.id));
    localStorage.setItem("storeName", String(store.store_name || "").toUpperCase());

    // Load delivery settings into UI
    if (deliveryAvailableEl && pickupAvailableEl) {
        const deliverySelected = !!store.delivery_available || !store.pickup_available;
        deliveryAvailableEl.checked = deliverySelected;
        pickupAvailableEl.checked = !deliverySelected;
    }
    if (deliveryChargeEl) deliveryChargeEl.value = store.delivery_charge ?? 0;
    if (minOrderEl) minOrderEl.value = store.min_order_free_delivery ?? 0;
}

async function updateStoreName() {
    if (!currentStore) {
        setMsg("Create your store first");
        return;
    }

    const store_name = (editStoreNameInput?.value || "").trim().toUpperCase();
    if (!store_name) {
        setMsg("Enter store name");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/store`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ store_name })
        });

        currentStore = data.store;
        setStoreUi(currentStore);
        setMsgSuccess(data.message);
    } catch (e) {
        setMsgError(e.message);
    }
}

async function loadStoreAndProducts(options) {
    const preserveMsg = !!options?.preserveMsg;
    if (!preserveMsg) setMsg("");
    try {
        const store = await fetchJson(`${API_BASE}/owner/store`, {
            method: "GET",
            headers: authHeaders()
        });
        currentStore = store;
        setStoreUi(store);

        if (!store) return;

        await loadTimeSlots();

        const data = await fetchJson(`${API_BASE}/owner/products`, {
            method: "GET",
            headers: authHeaders()
        });
        renderProducts(data.products || []);
    } catch (e) {
        setMsgError(e.message);
    }
}

function renderTimeSlots(slots) {
    if (!slotListEl) return;

    if (!slots || slots.length === 0) {
        slotListEl.innerHTML = "<div class='help-text'>No pickup slots yet. Add at least one slot so customers can choose pickup time.</div>";
        return;
    }

    slotListEl.innerHTML = "";
    slots.forEach(s => {
        const row = document.createElement("div");
        row.className = "slot-row";
        row.innerHTML = `
            <div class="slot-row__time">${s.slot_time}</div>
            <button type="button" class="slot-row__btn">Remove</button>
        `;
        row.querySelector("button").onclick = () => removeTimeSlot(s.id);
        slotListEl.appendChild(row);
    });
}

async function loadTimeSlots() {
    if (!slotListEl) return;
    if (!currentStore) {
        slotListEl.innerHTML = "";
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/slots`, {
            method: "GET",
            headers: authHeaders()
        });
        renderTimeSlots(data.slots || []);
    } catch (e) {
        // keep page usable even if slots fail
        slotListEl.innerHTML = "<div class='help-text'>Could not load slots.</div>";
    }
}

async function addTimeSlot() {
    if (!currentStore) {
        setMsgError("Create your store first");
        return;
    }

    const slot_time = (slotTimeInputEl?.value || "").trim();
    if (!slot_time) {
        setMsgError("Enter a slot time");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/slots`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ slot_time })
        });
        if (slotTimeInputEl) slotTimeInputEl.value = "";
        setMsgSuccess(data.message || "Slot added");
        await loadTimeSlots();
    } catch (e) {
        setMsgError(e.message);
    }
}

async function removeTimeSlot(slotId) {
    if (!currentStore) return;
    try {
        const data = await fetchJson(`${API_BASE}/owner/slots/${slotId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsgSuccess(data.message || "Slot removed");
        await loadTimeSlots();
    } catch (e) {
        setMsgError(e.message);
    }
}

function renderProducts(products) {
    if (!ownerProductListEl) return;

    if (!products || products.length === 0) {
        ownerProductListEl.innerHTML = "<div class='store-card'><h3>No products yet</h3><p>Add your first product above.</p></div>";
        return;
    }

    ownerProductListEl.innerHTML = "";
    products.forEach(p => {
        const quantity = (p.quantity === undefined || p.quantity === null || p.quantity === "") ? 1 : p.quantity;
        const unit = String(p.unit || "").trim();
        const description = String(p.description || "").trim();
        const priceNum = Number(p.price);
        const priceText = Number.isFinite(priceNum) ? priceNum.toFixed(2) : String(p.price ?? "");
        const unitText = unit ? ` / ${quantity} ${unit}` : ` / ${quantity}`;

        const div = document.createElement("div");
        div.className = "store-card";
        div.innerHTML = `
            <h3>${p.name}</h3>
            ${description ? `<p class="product-description">${description}</p>` : ""}
            <p>Price: ₹${priceText}${unitText}</p>
            <button type="button" class="store-card__remove-btn">Remove</button>
        `;
        div.querySelector("button").onclick = () => removeProduct(p.id);
        ownerProductListEl.appendChild(div);
    });
}

async function createStore() {
    const store_name = document.getElementById("storeName").value.trim().toUpperCase();
    if (!store_name) {
        setMsg("Enter store name");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/store`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ store_name })
        });
        currentStore = data.store;
        setStoreUi(currentStore);
        setMsgSuccess(data.message);
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

function bindUppercaseInput(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener("input", () => {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const next = String(inputEl.value || "").toUpperCase();
        if (inputEl.value !== next) inputEl.value = next;
        if (typeof start === "number" && typeof end === "number") {
            inputEl.setSelectionRange(start, end);
        }
    });
}

// Auto-uppercase store name fields (create + edit)
try {
    bindUppercaseInput(document.getElementById("storeName"));
    bindUppercaseInput(document.getElementById("editStoreName"));
} catch {
    // ignore
}

async function addProduct() {
    if (!currentStore) {
        setMsg("Create your store first");
        return;
    }

    clearAddProductErrors();

    const name = document.getElementById("pname").value.trim();
    const description = document.getElementById("pdescription").value.trim();
    const priceRaw = document.getElementById("pprice").value;
    const quantityRaw = document.getElementById("pquantity").value;
    const unit = document.getElementById("punit").value;

    const price = Number(priceRaw);
    const quantity = Number(quantityRaw);
    const allowedUnits = ["kg", "g", "litre", "ml", "piece", "pack"];

    if (!name) {
        setAddProductError("name", "Enter product name");
        return;
    }

    if (name.length < 2) {
        setAddProductError("name", "Product name should be at least 2 letters");
        return;
    }

    if (!description) {
        setAddProductError("description", "Enter product description");
        return;
    }

    if (description.length < 5) {
        setAddProductError("description", "Description should be at least 5 characters");
        return;
    }

    if (!Number.isFinite(price) || price <= 0) {
        setAddProductError("price", "Enter a valid price greater than 0");
        return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        setAddProductError("quantity", "Enter a valid quantity greater than 0");
        return;
    }

    if (!unit || !allowedUnits.includes(unit)) {
        setAddProductError("unit", "Select a valid unit");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/products`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, description, price, quantity, unit })
        });
        setMsgSuccess(data.message);
        document.getElementById("pname").value = "";
        document.getElementById("pdescription").value = "";
        document.getElementById("pprice").value = "";
        document.getElementById("pquantity").value = "";
        document.getElementById("punit").value = "kg";
        clearAddProductErrors();
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

async function saveDeliverySettings() {
    if (!currentStore) {
        setMsgError("Create your store first");
        return;
    }

    const deliverySelected = !!deliveryAvailableEl?.checked;
    const payload = {
        delivery_available: deliverySelected,
        delivery_charge: Number(deliveryChargeEl?.value) || 0,
        min_order: Number(minOrderEl?.value) || 0,
        pickup_available: !deliverySelected
    };

    try {
        const res = await fetchJson(`${API_BASE}/api/store/delivery-settings`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        setMsgSuccess((res.message || "Settings saved") + ". Customers will see delivery/pickup info." );
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

async function removeProduct(productId) {
    if (!currentStore) return;
    try {
        const data = await fetchJson(`${API_BASE}/owner/products/${productId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsgSuccess(data.message);
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: authHeaders()
        });
    } catch (e) {
        // ignore
    }

    localStorage.clear();
    window.location.href = "login.html";
}

loadStoreAndProducts();