const API_BASE = "http://localhost:3000";

const msgEl = document.getElementById("msg");
const addressListEl = document.getElementById("addressList");

const addressTypeEl = document.getElementById("addressType");
const customerNameEl = document.getElementById("customerName");
const phoneEl = document.getElementById("phone");
const houseEl = document.getElementById("house");
const areaEl = document.getElementById("area");
const landmarkEl = document.getElementById("landmark");
const cityEl = document.getElementById("city");
const pincodeEl = document.getElementById("pincode");

let editingAddressId = null;

const uppercaseFields = [customerNameEl, houseEl, areaEl, landmarkEl, cityEl].filter(Boolean);

function toUppercaseValue(value) {
    return String(value || "").toUpperCase();
}

function bindUppercaseInput(el) {
    if (!el) return;
    el.addEventListener("input", () => {
        const upper = toUppercaseValue(el.value);
        if (el.value !== upper) {
            el.value = upper;
        }
    });
}

uppercaseFields.forEach(bindUppercaseInput);

function setMsg(text) {
    if (!msgEl) return;
    msgEl.innerText = text || "";
}

function authToken() {
    return window.AppAuth?.getToken ? window.AppAuth.getToken() : (localStorage.getItem("authToken") || "");
}

async function ensureCustomerLogin() {
    if (!window.AppAuth?.validateCurrentSession) return false;

    const session = await window.AppAuth.validateCurrentSession({
        expectedRole: "customer",
        afterLogin: "addresses.html"
    });
    return !!session?.user;
}

function formatFullAddress(a) {
    const lineParts = [];
    if (a.house) lineParts.push(a.house);
    if (a.area) lineParts.push(a.area);
    if (a.landmark) lineParts.push(a.landmark);
    if (a.city) lineParts.push(a.city);
    if (a.pincode) lineParts.push(a.pincode);

    const line = lineParts.length ? lineParts.join(", ") : (a.address_line || "");
    const who = [a.customer_name, a.phone].filter(Boolean).join(" • ");

    return {
        title: a.type || "Address",
        who,
        line
    };
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function validateAddressForm() {
    const type = (addressTypeEl?.value || "").trim();
    const customer_name = toUppercaseValue(customerNameEl?.value).trim();
    const phone = (phoneEl?.value || "").trim();
    const house = toUppercaseValue(houseEl?.value).trim();
    const area = toUppercaseValue(areaEl?.value).trim();
    const landmark = toUppercaseValue(landmarkEl?.value).trim();
    const city = toUppercaseValue(cityEl?.value).trim();
    const pincode = (pincodeEl?.value || "").trim();

    if (!type) {
        setMsg("Please select address type");
        addressTypeEl?.focus();
        return null;
    }
    if (!customer_name) {
        setMsg("Please enter name");
        customerNameEl?.focus();
        return null;
    }
    if (!phone) {
        setMsg("Please enter phone");
        phoneEl?.focus();
        return null;
    }
    if (!/^\d{10}$/.test(phone)) {
        setMsg("Phone must be exactly 10 digits");
        phoneEl?.focus();
        return null;
    }
    if (!house) {
        setMsg("Please enter house / flat");
        houseEl?.focus();
        return null;
    }
    if (!area) {
        setMsg("Please enter area / street");
        areaEl?.focus();
        return null;
    }
    if (!city) {
        setMsg("Please enter city");
        cityEl?.focus();
        return null;
    }
    if (!pincode) {
        setMsg("Please enter pincode");
        pincodeEl?.focus();
        return null;
    }
    if (!/^\d{6}$/.test(pincode)) {
        setMsg("Pincode must be exactly 6 digits");
        pincodeEl?.focus();
        return null;
    }

    return { type, customer_name, phone, house, area, landmark, city, pincode };
}

function resetAddressForm() {
    editingAddressId = null;
    if (addressTypeEl) addressTypeEl.value = "Home";
    if (phoneEl) phoneEl.value = "";
    if (houseEl) houseEl.value = "";
    if (areaEl) areaEl.value = "";
    if (landmarkEl) landmarkEl.value = "";
    if (cityEl) cityEl.value = "";
    if (pincodeEl) pincodeEl.value = "";

    // Keep name prefilled if available
    if (customerNameEl && !customerNameEl.value) {
        const n = localStorage.getItem("userName");
        if (n) customerNameEl.value = toUppercaseValue(n);
    }

    const btn = document.querySelector("button[onclick='saveAddress()']");
    if (btn) btn.innerText = "Save Address";
}

function startEditAddress(address) {
    if (!address) return;
    editingAddressId = Number(address.id);
    if (!Number.isFinite(editingAddressId)) return;

    if (addressTypeEl) addressTypeEl.value = address.type || "Home";
    if (customerNameEl) customerNameEl.value = toUppercaseValue(address.customer_name);
    if (phoneEl) phoneEl.value = address.phone || "";
    if (houseEl) houseEl.value = toUppercaseValue(address.house);
    if (areaEl) areaEl.value = toUppercaseValue(address.area);
    if (landmarkEl) landmarkEl.value = toUppercaseValue(address.landmark);
    if (cityEl) cityEl.value = toUppercaseValue(address.city);
    if (pincodeEl) pincodeEl.value = address.pincode || "";

    const btn = document.querySelector("button[onclick='saveAddress()']");
    if (btn) btn.innerText = "Update Address";

    // Scroll to form
    try {
        (addressTypeEl || customerNameEl)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
        // ignore
    }
}

async function deleteAddress(addressId) {
    if (!await ensureCustomerLogin()) return;
    const id = Number(addressId);
    if (!Number.isFinite(id)) return;

    const ok = confirm("Delete this address?");
    if (!ok) return;

    try {
        const res = await fetch(`${API_BASE}/user/addresses/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${authToken()}` }
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            setMsg(data?.message || `Could not delete address (HTTP ${res.status})`);
            return;
        }

        setMsg(data?.message || "Address deleted");
        await loadAddresses();
    } catch {
        setMsg("Could not delete address");
    }
}

async function loadAddresses() {
    if (!await ensureCustomerLogin()) return;

    try {
        const res = await fetch(`${API_BASE}/user/addresses`, {
            headers: { "Authorization": `Bearer ${authToken()}` }
        });
        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            addressListEl.innerHTML = `
                <div class="address-empty">
                    <h4>No saved addresses yet</h4>
                    <p>Add your first delivery location using the form on the right.</p>
                </div>
            `;
            return;
        }

        addressListEl.innerHTML = "";
        data.forEach((a) => {
            const f = formatFullAddress(a);
            const div = document.createElement("div");
            div.className = "address-card";

            div.innerHTML = `
                <div class="address-card__header">
                    <div class="address-card__heading-group">
                        <span class="address-chip">${escapeHtml(f.title)}</span>
                        <h4 class="address-card__name">${escapeHtml(a.customer_name || "Saved address")}</h4>
                    </div>
                    <div class="address-card__actions">
                        <button type="button" class="cart-edit-btn" data-action="edit">Edit</button>
                        <button type="button" class="cart-delete-btn" data-action="delete">Delete</button>
                    </div>
                </div>
                ${f.who ? `<div class="address-card__meta">${escapeHtml(f.who)}</div>` : ""}
                <div class="address-card__line">${escapeHtml(f.line)}</div>
            `;

            const delBtn = div.querySelector("[data-action='delete']");
            if (delBtn) delBtn.onclick = () => deleteAddress(a.id);

            const editBtn = div.querySelector("[data-action='edit']");
            if (editBtn) editBtn.onclick = () => startEditAddress(a);

            addressListEl.appendChild(div);
        });
    } catch {
        addressListEl.innerHTML = `
            <div class="address-empty">
                <h4>Could not load addresses</h4>
                <p>Please refresh the page and try again.</p>
            </div>
        `;
    }
}

async function saveAddress() {
    if (!await ensureCustomerLogin()) return;

    const payload = validateAddressForm();
    if (!payload) return;

    const isEdit = Number.isFinite(editingAddressId);
    const ok = confirm(isEdit ? "Update this address?" : "Save this address?");
    if (!ok) return;

    try {
        const url = isEdit ? `${API_BASE}/user/addresses/${editingAddressId}` : `${API_BASE}/user/addresses`;
        const method = isEdit ? "PATCH" : "POST";

        const res = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken()}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            setMsg(data?.message || "Could not save address");
            return;
        }

        setMsg(data?.message || (isEdit ? "Address updated" : "Address saved"));
        resetAddressForm();
        await loadAddresses();
    } catch {
        setMsg("Could not save address");
    }
}

// Prefill name
if (customerNameEl && !customerNameEl.value) {
    const n = localStorage.getItem("userName");
    if (n) customerNameEl.value = toUppercaseValue(n);
}

ensureCustomerLogin().then((ok) => {
    if (ok) loadAddresses();
});
