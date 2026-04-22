const API_BASE = window.AppAuth?.API_BASE || "http://localhost:3000";

const storeId = localStorage.getItem("storeId");

if (!storeId) {
    alert("No store selected");
    window.location.href = "stores.html";
}

const container = document.getElementById("productList");

const storeInfoNameEl = document.getElementById("storeInfoName");
const storeInfoDeliveryEl = document.getElementById("storeInfoDelivery");
const storeInfoPickupEl = document.getElementById("storeInfoPickup");
const storeInfoFeeEl = document.getElementById("storeInfoFee");

function getCartData() {
    return JSON.parse(localStorage.getItem("storeCarts")) || {};
}

function saveCartData(carts) {
    localStorage.setItem("storeCarts", JSON.stringify(carts));
}

function buildPriceText(price, quantity, unit) {
    const unitText = unit ? ` ${unit}` : "";
    return `₹${price} / ${quantity}${unitText}`;
}

function buildItemKey(name, priceText) {
    return `${name}||${priceText}`;
}

function buildImageUrl(image) {
    return image ? `${API_BASE}/uploads/${image}` : "";
}

function getQtyInCart(itemKey) {
    const carts = getCartData();
    const storeCart = carts[storeId];
    const items = storeCart && storeCart.items;
    if (!items || typeof items !== "object") return 0;
    const it = items[itemKey];
    return it ? (Number(it.qty) || 0) : 0;
}

function setQtyInCart(itemKey, itemPayload, nextQty) {
    const carts = getCartData();
    const storeName = localStorage.getItem("storeName") || `Store ${storeId}`;

    if (!carts[storeId]) {
        carts[storeId] = { storeName, items: {} };
    }

    const items = carts[storeId].items;

    if (nextQty <= 0) {
        delete items[itemKey];
        if (Object.keys(items).length === 0) delete carts[storeId];
        saveCartData(carts);
        return;
    }

    if (!items[itemKey]) {
        items[itemKey] = { ...itemPayload, qty: 0 };
    }

    items[itemKey].qty = nextQty;
    saveCartData(carts);
}

function updateStepperUi(stepperEl, itemKey) {
    const qty = getQtyInCart(itemKey);
    const decBtn = stepperEl.querySelector("[data-action='dec']");
    const qtyEl = stepperEl.querySelector(".qty-value");

    const card = stepperEl.closest(".store-card");
    const addBtn = card.querySelector(".add-to-cart-btn");

    qtyEl.innerText = qty;
    decBtn.disabled = qty <= 0;

    if (qty <= 0) {
        stepperEl.style.display = "none";
        addBtn.style.display = "inline-block";
    } else {
        stepperEl.style.display = "inline-flex";
        addBtn.style.display = "none";
    }
}

// Updated product card
function createProductCard(product) {
    const name = product.name;
    const quantity = product.quantity || 1;
    const unit = String(product.unit || "").trim();
    const description = String(product.description || "").trim();
    const priceText = buildPriceText(product.price, quantity, unit);
    const itemKey = buildItemKey(name, priceText);
    const imageUrl = buildImageUrl(product.image);

    const div = document.createElement("div");
    div.classList.add("store-card", "store-card--product");

    div.innerHTML = `
        ${imageUrl ? `<img src="${imageUrl}" class="product-img">` : ""}

        <div class="product-card__top">
            <h3 class="product-card__name">${name}</h3>
            <p class="product-card__price">${priceText}</p>
        </div>

        ${description ? `<p class="product-card__description">${description}</p>` : ""}

        <div class="product-card__actions">
            <button class="add-to-cart-btn">Add to Cart</button>

            <div class="qty-stepper">
                <button data-action="dec">-</button>
                <span class="qty-value">0</span>
                <button data-action="inc">+</button>
            </div>
        </div>
    `;

    const stepper = div.querySelector(".qty-stepper");
    const addBtn = div.querySelector(".add-to-cart-btn");
    const incBtn = div.querySelector("[data-action='inc']");
    const decBtn = div.querySelector("[data-action='dec']");

    const payload = { name, price: priceText, quantity, unit, image: product.image || "" };

    incBtn.onclick = () => {
        const current = getQtyInCart(itemKey);
        setQtyInCart(itemKey, payload, current + 1);
        updateStepperUi(stepper, itemKey);
    };

    addBtn.onclick = () => {
        const current = getQtyInCart(itemKey);
        setQtyInCart(itemKey, payload, Math.max(1, current + 1));
        updateStepperUi(stepper, itemKey);
    };

    decBtn.onclick = () => {
        const current = getQtyInCart(itemKey);
        setQtyInCart(itemKey, payload, current - 1);
        updateStepperUi(stepper, itemKey);
    };

    updateStepperUi(stepper, itemKey);

    return div;
}

function renderProducts(data) {
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="store-card store-card--empty"><h2>No products available</h2><p>This store has not added products yet.</p></div>';
        return;
    }

    container.innerHTML = "";
    data.forEach(p => container.appendChild(createProductCard(p)));
}

function renderStoreInfo(store) {
    const storeName = localStorage.getItem("storeName") || store?.store_name || `Store ${storeId}`;

    if (storeInfoNameEl) storeInfoNameEl.innerText = storeName;
    if (storeInfoDeliveryEl) storeInfoDeliveryEl.innerText = `Delivery: ${store?.delivery_available ? "Available" : "Not available"}`;
    if (storeInfoPickupEl) storeInfoPickupEl.innerText = `Pickup: ${store?.pickup_available ? "Available" : "Not available"}`;

    if (storeInfoFeeEl && store?.delivery_available) {
        const fee = Number(store.delivery_charge || 0);
        const freeAbove = Number(store.min_order_free_delivery || 0);
        storeInfoFeeEl.innerText = `Delivery fee: ₹${fee} • Free above ₹${freeAbove}`;
    }
}

fetch(`${API_BASE}/products/${storeId}`)
    .then(res => res.json())
    .then(renderProducts)
    .catch(() => {
        container.innerHTML = '<div class="store-card store-card--empty"><h2>Error loading products</h2><p>Please refresh the page and try again.</p></div>';
    });

fetch(`${API_BASE}/store/${storeId}`)
    .then(res => res.json())
    .then(renderStoreInfo)
    .catch(() => renderStoreInfo(null));

(async function redirectPrivilegedUsers() {
    const session = await window.AppAuth?.validateCurrentSession?.({ redirectOnFail: false });
    const role = session?.user?.role || "";
    if (role === "owner") {
        window.location.href = "owner-dashboard.html";
    } else if (role === "admin") {
        window.location.href = "admin-dashboard.html";
    }
})();
