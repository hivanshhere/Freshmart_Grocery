const container = document.getElementById("cartItems")
const msgEl = document.getElementById("msg")
const totalAmountEl = document.getElementById("totalAmount")
const placeAllOrdersBtn = document.getElementById("placeAllOrdersBtn")

const addressCache = {
    loaded: false,
    list: []
}

function setMsg(text) {
    if (msgEl) msgEl.innerText = text || ""
}

function setPlaceAllDisabled(disabled) {
    if (!placeAllOrdersBtn) return
    placeAllOrdersBtn.disabled = !!disabled
    placeAllOrdersBtn.style.opacity = disabled ? "0.6" : "1"
    placeAllOrdersBtn.style.cursor = disabled ? "not-allowed" : "pointer"
}

function getCartData() {
    return JSON.parse(localStorage.getItem("storeCarts")) || {}
}

function saveCartData(carts) {
    localStorage.setItem("storeCarts", JSON.stringify(carts))
}

function isCustomerLoggedIn() {
    const role = localStorage.getItem("userRole")
    const token = window.AppAuth?.getToken ? window.AppAuth.getToken() : localStorage.getItem("authToken")
    return role === "customer" && !!token
}

function parseUnitPrice(priceText) {
    const match = String(priceText).match(/(?:Rs\.\s*|₹\s*)([0-9]+(?:\.[0-9]+)?)/)
    return match ? Number(match[1]) : 0
}

function formatRupees(amount) {
    if (!Number.isFinite(amount)) return "₹0"
    const rounded = Math.round(amount * 100) / 100
    if (Number.isInteger(rounded)) return `₹${rounded}`
    return `₹${rounded.toFixed(2)}`
}

function normalizeStoreItems(storeData) {
    if (!storeData) return []

    if (typeof storeData === "object" && !Array.isArray(storeData) && storeData.items) {
        return normalizeStoreItems(storeData.items)
    }

    if (!Array.isArray(storeData) && typeof storeData === "object") {
        return Object.keys(storeData).map(k => {
            const it = storeData[k]
            return {
                key: k,
                name: it.name,
                price: it.price,
                qty: Number(it.qty) || 0,
                quantity: it.quantity || 1,
                unit: String(it.unit || "").trim(),
                image: String(it.image || "").trim()
            }
        }).filter(it => it.qty > 0)
    }

    return []
}

async function fetchStore(storeId) {
    try {
        const res = await fetch(`${window.AppAuth?.API_BASE || "http://localhost:3000"}/store/${storeId}`)
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

function getStoreDisplayName(storeCart, storeData) {
    const fromCart = storeCart && storeCart.storeName ? String(storeCart.storeName) : ""
    const fromServer = storeData && storeData.store_name ? String(storeData.store_name) : ""
    const fromLocal = localStorage.getItem("storeName") || ""
    return fromCart || fromServer || fromLocal || "Store"
}

async function loadAddresses() {
    const token = window.AppAuth?.getToken ? window.AppAuth.getToken() : localStorage.getItem("authToken")
    if (!token || !isCustomerLoggedIn()) {
        addressCache.loaded = true
        addressCache.list = []
        return []
    }

    try {
        const res = await fetch(`${window.AppAuth?.API_BASE || "http://localhost:3000"}/user/addresses`, {
            headers: { "Authorization": `Bearer ${token}` }
        })
        const data = await res.json().catch(() => [])
        addressCache.loaded = true
        addressCache.list = Array.isArray(data) ? data : []
        return addressCache.list
    } catch {
        addressCache.loaded = true
        addressCache.list = []
        return []
    }
}

function formatAddressOption(address) {
    const type = String(address?.type || "Address").trim()
    const parts = [address?.house, address?.area, address?.landmark, address?.city, address?.pincode]
        .map(v => String(v || "").trim())
        .filter(Boolean)
    const line = parts.join(", ") || String(address?.address_line || "").trim()
    const contact = [address?.customer_name, address?.phone].map(v => String(v || "").trim()).filter(Boolean).join(" | ")
    const label = [type, contact, line].filter(Boolean).join(" - ")
    return label || "Saved address"
}

async function loadSlots(storeId, selectEl) {
    if (!selectEl) return

    try {
        const res = await fetch(`${window.AppAuth?.API_BASE || "http://localhost:3000"}/store/${storeId}/slots`)
        const data = await res.json()

        selectEl.innerHTML = ""
        if (!Array.isArray(data) || data.length === 0) {
            const opt = document.createElement("option")
            opt.value = ""
            opt.innerText = "No pickup slots available"
            opt.disabled = true
            opt.selected = true
            selectEl.appendChild(opt)
            return
        }

        data.forEach(slot => {
            const opt = document.createElement("option")
            opt.value = slot.id
            opt.innerText = slot.slot_time
            selectEl.appendChild(opt)
        })
    } catch {
        selectEl.innerHTML = ""
        const opt = document.createElement("option")
        opt.value = ""
        opt.innerText = "No pickup slots available"
        opt.disabled = true
        opt.selected = true
        selectEl.appendChild(opt)
    }
}

function changeItemQty(storeId, itemKey, delta) {
    const carts = getCartData()
    const storeCart = carts[storeId]
    if (!storeCart || typeof storeCart !== "object") return

    const items = storeCart.items
    if (!items || typeof items !== "object") return

    const item = items[itemKey]
    if (!item) return

    const next = (Number(item.qty) || 0) + delta
    if (next <= 0) {
        delete items[itemKey]
        if (Object.keys(items).length === 0) {
            delete carts[storeId]
        }
    } else {
        item.qty = next
    }

    saveCartData(carts)
    renderCart()
}

function clearStoreCart(storeId) {
    const carts = getCartData()
    if (carts && carts[storeId]) {
        delete carts[storeId]
        saveCartData(carts)
    }
    renderCart()
}

function createDeliveryAddressSection(storeId) {
    const wrapper = document.createElement("div")
    wrapper.className = "cart-store-option"

    const label = document.createElement("label")
    label.className = "cart-store-option__label"
    label.setAttribute("for", `address-select-${storeId}`)
    label.innerText = "Delivery Address"

    const helper = document.createElement("p")
    helper.className = "cart-store-option__helper"

    const select = document.createElement("select")
    select.id = `address-select-${storeId}`
    select.className = "cart-store-option__select"

    const placeholder = document.createElement("option")
    placeholder.value = ""
    placeholder.innerText = "Select a saved address"
    placeholder.selected = true
    select.appendChild(placeholder)

    if (!addressCache.list.length) {
        select.disabled = true
        helper.innerHTML = 'Delivery is available, but you need one saved address first. <a href="addresses.html">Manage Addresses</a>'
    } else {
        addressCache.list.forEach((address) => {
            const option = document.createElement("option")
            option.value = String(address.id)
            option.innerText = formatAddressOption(address)
            select.appendChild(option)
        })
        helper.innerHTML = 'Choose where this order should be delivered. Need to update something? <a href="addresses.html">Manage Addresses</a>'
    }

    wrapper.appendChild(label)
    wrapper.appendChild(select)
    wrapper.appendChild(helper)
    return { wrapper, select }
}

function createPickupInfoSection() {
    const note = document.createElement("div")
    note.className = "cart-store-note"
    note.innerHTML = "<strong>Pickup order:</strong> address details are skipped for this store."
    return note
}

async function ensureCustomerSessionForCheckout() {
    const session = await window.AppAuth?.validateCurrentSession?.({
        expectedRole: "customer",
        afterLogin: "cart.html"
    })
    return !!session?.user
}

async function renderCart() {
    const carts = getCartData()
    container.innerHTML = ""
    setMsg("")

    const stores = Object.keys(carts || {})
    if (stores.length === 0) {
        container.innerHTML = '<div class="cart-store"><h2>Cart is empty</h2></div>'
        if (totalAmountEl) totalAmountEl.innerText = "₹0"
        setPlaceAllDisabled(true)
        return
    }

    setPlaceAllDisabled(false)
    await loadAddresses()

    const storeSettings = {}
    for (const storeId of stores) {
        storeSettings[storeId] = await fetchStore(storeId)
    }

    let grandTotal = 0

    for (const storeId of stores) {
        const section = document.createElement("div")
        section.className = "cart-store"

        const storeCart = carts[storeId]
        const items = normalizeStoreItems(storeCart)
        const storeData = storeSettings[storeId] || null
        const storeName = getStoreDisplayName(storeCart, storeData)

        const deliveryAvailable = !!storeData?.delivery_available
        const pickupAvailable = !!storeData?.pickup_available
        const deliveryType = deliveryAvailable ? "delivery" : (pickupAvailable ? "pickup" : "delivery")

        let storeTotal = 0
        items.forEach(item => {
            const unitPrice = parseUnitPrice(item.price)
            storeTotal += unitPrice * item.qty
        })

        let deliveryFee = 0
        if (deliveryType === "delivery" && storeData) {
            const freeAbove = Number(storeData.min_order_free_delivery) || 0
            if (storeTotal < freeAbove) {
                deliveryFee = Number(storeData.delivery_charge) || 0
            }
        }

        const finalTotal = storeTotal + deliveryFee
        grandTotal += finalTotal

        const header = document.createElement("div")
        header.className = "cart-store-header"
        header.innerHTML = `
            <h2>${storeName}<span>${items.length} item(s)${deliveryType === "pickup" ? " | Pickup only" : ""}</span></h2>
        `

        const clearBtn = document.createElement("button")
        clearBtn.className = "cart-clear-btn"
        clearBtn.type = "button"
        clearBtn.innerText = "Clear"
        clearBtn.onclick = () => clearStoreCart(storeId)
        header.appendChild(clearBtn)
        section.appendChild(header)

        items.forEach(item => {
            const unitPrice = parseUnitPrice(item.price)
            const lineTotal = unitPrice * item.qty

            const row = document.createElement("div")
            row.className = "cart-item"

            const left = document.createElement("div")
            left.className = "cart-item-left"
            left.innerHTML = `
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-meta">${item.price}</div>
            `

            const right = document.createElement("div")
            right.className = "cart-item-right"

            const stepper = document.createElement("div")
            stepper.className = "qty-stepper"
            stepper.innerHTML = `
                <button type="button" class="qty-btn" data-action="dec" aria-label="Decrease">-</button>
                <span class="qty-value" aria-live="polite">${item.qty}</span>
                <button type="button" class="qty-btn" data-action="inc" aria-label="Increase">+</button>
            `

            const decBtn = stepper.querySelector("[data-action='dec']")
            const incBtn = stepper.querySelector("[data-action='inc']")
            if (decBtn) decBtn.disabled = item.qty <= 0

            if (incBtn) incBtn.onclick = () => changeItemQty(storeId, item.key, 1)
            if (decBtn) decBtn.onclick = () => changeItemQty(storeId, item.key, -1)

            const totalEl = document.createElement("div")
            totalEl.className = "cart-item-total"
            totalEl.innerText = formatRupees(lineTotal)

            right.appendChild(stepper)
            right.appendChild(totalEl)
            row.appendChild(left)
            row.appendChild(right)
            section.appendChild(row)
        })

        const breakdown = document.createElement("div")
        breakdown.className = "cart-store-breakdown"
        breakdown.innerHTML = `
            <div><span>Items total</span><strong>${formatRupees(storeTotal)}</strong></div>
            <div><span>Delivery fee</span><strong>${formatRupees(deliveryFee)}</strong></div>
        `
        section.appendChild(breakdown)

        let slotSelect = null
        let addressSelect = null
        if (deliveryType === "delivery") {
            const addressSection = createDeliveryAddressSection(storeId)
            addressSelect = addressSection.select
            section.appendChild(addressSection.wrapper)
        } else {
            section.appendChild(createPickupInfoSection())
        }

        if (deliveryType === "pickup") {
            const slotRow = document.createElement("div")
            slotRow.className = "cart-store-option"

            const slotLabel = document.createElement("label")
            slotLabel.className = "cart-store-option__label"
            slotLabel.innerText = "Pickup Time Slot"
            slotLabel.setAttribute("for", `slot-${storeId}`)

            slotSelect = document.createElement("select")
            slotSelect.id = `slot-${storeId}`
            slotSelect.className = "cart-store-option__select"
            await loadSlots(storeId, slotSelect)

            const slotHelper = document.createElement("p")
            slotHelper.className = "cart-store-option__helper"
            slotHelper.innerText = "Select the time window you want before placing the pickup order."

            slotRow.appendChild(slotLabel)
            slotRow.appendChild(slotSelect)
            slotRow.appendChild(slotHelper)
            section.appendChild(slotRow)
        }

        const totalRow = document.createElement("div")
        totalRow.className = "cart-store-total"
        totalRow.innerHTML = `<span>Total</span><span>${formatRupees(finalTotal)}</span>`
        section.appendChild(totalRow)

        const btn = document.createElement("button")
        btn.className = "cart-place-btn"
        btn.type = "button"
        btn.innerText = "Place Order"
        btn.onclick = () => placeOrder(storeId, { deliveryType, deliveryFee, slotSelect, addressSelect, storeName })
        section.appendChild(btn)

        container.appendChild(section)
    }

    if (totalAmountEl) totalAmountEl.innerText = formatRupees(grandTotal)
}

async function placeOrder(storeId, options) {
    const isReady = await ensureCustomerSessionForCheckout()
    if (!isReady) {
        setMsg("Please login as a customer to place your order")
        return false
    }

    const token = window.AppAuth?.getToken ? window.AppAuth.getToken() : localStorage.getItem("authToken")

    const carts = getCartData()
    const items = normalizeStoreItems(carts[storeId])
    if (items.length === 0) {
        setMsg("Cart is empty")
        return false
    }

    const deliveryType = options?.deliveryType || "delivery"
    const deliveryFee = Number(options?.deliveryFee) || 0
    const slotId = deliveryType === "pickup" ? String(options?.slotSelect?.value || "") : null

    const storeData = await fetchStore(storeId)
    if (storeData) {
        if (deliveryType === "delivery" && !storeData.delivery_available) {
            setMsg("This store does not offer delivery")
            return false
        }
        if (deliveryType === "pickup" && !storeData.pickup_available) {
            setMsg("This store does not offer pickup")
            return false
        }
    }

    let addressId = null
    if (deliveryType === "delivery") {
        addressId = String(options?.addressSelect?.value || "").trim()
        if (!addressId) {
            setMsg("Please select a saved delivery address before placing this order")
            return false
        }
    }

    if (deliveryType === "pickup" && !slotId) {
        setMsg("Please select a pickup time slot")
        return false
    }

        const payload = {
            store_id: Number(storeId),
            delivery_type: deliveryType,
            address_id: addressId,
            slot_id: slotId,
        delivery_fee: deliveryFee,
        items: items.map(item => ({
            name: item.name,
            qty: item.qty,
            unit_price: parseUnitPrice(item.price)
        }))
    }

    try {
        const res = await fetch(`${window.AppAuth?.API_BASE || "http://localhost:3000"}/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        })

        const data = await res.json().catch(() => null)
        if (!res.ok) {
            setMsg(data?.message || "Order failed")
            return false
        }

        setMsg("Order placed successfully")
        clearStoreCart(storeId)
        if (options?.storeName) {
            const storeNameParam = `&storeName=${encodeURIComponent(options.storeName)}`
            window.location.href = `order-placed.html?storeId=${encodeURIComponent(storeId)}${storeNameParam}`
        }
        return true
    } catch {
        setMsg("Order failed")
        return false
    }
}

async function placeAllOrders() {
    const carts = getCartData()
    const storeIds = Object.keys(carts || {})
    if (storeIds.length === 0) {
        setMsg("Cart is empty")
        return
    }

    for (const storeId of storeIds) {
        const storeData = await fetchStore(storeId)
        const deliveryType = storeData?.delivery_available ? "delivery" : (storeData?.pickup_available ? "pickup" : "delivery")
        const items = normalizeStoreItems(carts[storeId])

        let storeTotal = 0
        items.forEach(item => {
            storeTotal += parseUnitPrice(item.price) * item.qty
        })

        let deliveryFee = 0
        if (deliveryType === "delivery" && storeData) {
            const freeAbove = Number(storeData.min_order_free_delivery) || 0
            if (storeTotal < freeAbove) {
                deliveryFee = Number(storeData.delivery_charge) || 0
            }
        }

        const ok = await placeOrder(storeId, {
            deliveryType,
            deliveryFee,
            addressSelect: document.getElementById(`address-select-${storeId}`),
            slotSelect: document.getElementById(`slot-${storeId}`),
            storeName: getStoreDisplayName(carts[storeId], storeData)
        })
        if (!ok) return
    }
}

if (placeAllOrdersBtn) {
    placeAllOrdersBtn.onclick = placeAllOrders
}

renderCart()
