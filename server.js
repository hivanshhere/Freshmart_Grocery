const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const mysql2 = require("mysql2");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = Number(process.env.PORT) || 3000;
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "vansh1234";
const DB_NAME = process.env.DB_NAME || "grocery_app";

let db;
let dbp;

function newToken() {
    return crypto.randomBytes(32).toString("hex");
}

async function ensureDatabaseExists() {
    const conn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await conn.end();
}

function initPool() {
    db = mysql2.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    dbp = db.promise();
}

async function initDb() {
    await dbp.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            password VARCHAR(100) NOT NULL,
            role VARCHAR(20) NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            token VARCHAR(128) PRIMARY KEY,
            user_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS stores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            store_name VARCHAR(100) NOT NULL,
            delivery_available BOOLEAN DEFAULT 0,
            delivery_charge INT DEFAULT 0,
            min_order_free_delivery INT DEFAULT 0,
            pickup_available BOOLEAN DEFAULT 1
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            store_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            quantity DECIMAL(10,2) NOT NULL,
            unit VARCHAR(20) NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            store_id INT NOT NULL,
            total_amount DECIMAL(10,2) NOT NULL,
            delivery_type VARCHAR(20) NOT NULL,
            address_id INT,
            slot_id INT,
            delivery_fee INT DEFAULT 0
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            product_name VARCHAR(100) NOT NULL,
            unit_price DECIMAL(10,2) NOT NULL,
            qty INT NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS time_slots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            store_id INT NOT NULL,
            slot_time VARCHAR(50) NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS user_addresses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type VARCHAR(20) NOT NULL,
            address_line VARCHAR(255) NOT NULL,
            customer_name VARCHAR(100),
            phone VARCHAR(20),
            house VARCHAR(120),
            area VARCHAR(160),
            landmark VARCHAR(160),
            city VARCHAR(80),
            pincode VARCHAR(10)
        )
    `);

    // Best-effort constraints (ignore if they already exist)
    try {
        await dbp.query("ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)");
    } catch {}
    try {
        await dbp.query("ALTER TABLE stores ADD UNIQUE KEY uniq_stores_owner (owner_id)");
    } catch {}
    try {
        await dbp.query("ALTER TABLE time_slots ADD UNIQUE KEY uniq_time_slot (store_id, slot_time)");
    } catch {}

    // Best-effort migrations for older DBs (ignore failures)
    // Stores table: add delivery/pickup columns if missing
    try { await dbp.query("ALTER TABLE stores ADD COLUMN delivery_available BOOLEAN DEFAULT 0"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD COLUMN delivery_charge INT DEFAULT 0"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD COLUMN min_order_free_delivery INT DEFAULT 0"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD COLUMN pickup_available BOOLEAN DEFAULT 1"); } catch {}

    // If legacy columns exist, copy data over once (best-effort)
    try {
        await dbp.query(
            "UPDATE stores SET delivery_charge = delivery_fee WHERE delivery_charge = 0 AND delivery_fee IS NOT NULL"
        );
    } catch {}
    try {
        await dbp.query(
            "UPDATE stores SET min_order_free_delivery = min_order_for_free_delivery WHERE min_order_free_delivery = 0 AND min_order_for_free_delivery IS NOT NULL"
        );
    } catch {}

    // Products table: add quantity/unit if missing
    try { await dbp.query("ALTER TABLE products ADD COLUMN quantity DECIMAL(10,2) NOT NULL DEFAULT 1"); } catch {}
    try { await dbp.query("ALTER TABLE products ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'piece'"); } catch {}

    // Addresses: realistic fields (best-effort)
    // Legacy compatibility: some DBs used `label` instead of `type`.
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'Home'"); } catch {}
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN address_line VARCHAR(255) NOT NULL DEFAULT ''"); } catch {}
    try { await dbp.query("UPDATE user_addresses SET type = label WHERE (type IS NULL OR type = '' OR type = 'Home') AND label IS NOT NULL AND label <> ''"); } catch {}

    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN customer_name VARCHAR(100)"); } catch {}
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN phone VARCHAR(20)"); } catch {}
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN house VARCHAR(120)"); } catch {}
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN area VARCHAR(160)"); } catch {}
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN landmark VARCHAR(160)"); } catch {}
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN city VARCHAR(80)"); } catch {}
    try { await dbp.query("ALTER TABLE user_addresses ADD COLUMN pincode VARCHAR(10)"); } catch {}
}

async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Login required" });

    const [rows] = await dbp.query(
        `SELECT us.token, u.id, u.name, u.email, u.role
         FROM user_sessions us
         JOIN users u ON u.id = us.user_id
         WHERE us.token=?`,
        [token]
    );

    if (!rows[0]) return res.status(401).json({ message: "Invalid session" });
    req.auth = { token, user: rows[0] };
    next();
}

function requireOwner(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ message: "Login required" });
    if (req.auth.user.role !== "owner") return res.status(403).json({ message: "Owner access required" });
    next();
}

async function getOwnerStore(ownerId) {
    const [rows] = await dbp.query("SELECT * FROM stores WHERE owner_id=?", [ownerId]);
    return rows[0] || null;
}

// ================= AUTH =================
app.post("/auth/register-customer", async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    try {
        const [result] = await dbp.query(
            "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'customer')",
            [name, email, password]
        );

        const userId = result.insertId;
        const token = newToken();
        await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, userId]);

        res.json({ token, user: { id: userId, name, email, role: "customer" } });
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Email already registered" });
        }
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/auth/register-owner", async (req, res) => {
    const { name, email, password, store_name } = req.body || {};
    if (!name || !email || !password || !store_name) return res.status(400).json({ message: "Missing fields" });

    try {
        const [userRes] = await dbp.query(
            "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'owner')",
            [name, email, password]
        );

        const userId = userRes.insertId;
        const [storeRes] = await dbp.query(
            "INSERT INTO stores (owner_id, store_name) VALUES (?, ?)",
            [userId, store_name]
        );

        const token = newToken();
        await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, userId]);

        res.json({
            token,
            user: { id: userId, name, email, role: "owner" },
            store: { id: storeRes.insertId, owner_id: userId, store_name }
        });
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Email already registered" });
        }
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Missing fields" });

    const [rows] = await dbp.query(
        "SELECT * FROM users WHERE email=? AND password=?",
        [email, password]
    );

    if (!rows[0]) return res.status(401).json({ message: "Invalid credentials" });

    const token = newToken();
    await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, rows[0].id]);

    let store = null;
    if (rows[0].role === "owner") {
        store = await getOwnerStore(rows[0].id);
    }

    res.json({ token, user: rows[0], store });
});

app.post("/auth/logout", requireAuth, async (req, res) => {
    await dbp.query("DELETE FROM user_sessions WHERE token=?", [req.auth.token]);
    res.json({ message: "Logged out" });
});

// ================= OWNER: STORE =================
app.get("/owner/store", requireAuth, requireOwner, async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    res.json(store);
});

app.post("/owner/store", requireAuth, requireOwner, async (req, res) => {
    const { store_name } = req.body || {};
    if (!store_name) return res.status(400).json({ message: "Store name required" });

    const existing = await getOwnerStore(req.auth.user.id);
    if (existing) return res.status(409).json({ message: "Store already exists", store: existing });

    await dbp.query("INSERT INTO stores (owner_id, store_name) VALUES (?, ?)", [req.auth.user.id, store_name]);
    const store = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Store created", store });
});

app.patch("/owner/store", requireAuth, requireOwner, async (req, res) => {
    const { store_name } = req.body || {};
    if (!store_name) return res.status(400).json({ message: "Store name required" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    await dbp.query("UPDATE stores SET store_name=? WHERE id=?", [store_name, store.id]);
    const updated = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Store updated", store: updated });
});

// ================= OWNER: PRODUCTS =================
app.get("/owner/products", requireAuth, requireOwner, async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    const [rows] = await dbp.query("SELECT * FROM products WHERE store_id=? ORDER BY id DESC", [store.id]);
    res.json({ products: rows });
});

app.post("/owner/products", requireAuth, requireOwner, async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    const { name, price, quantity, unit } = req.body || {};
    if (!name || price === undefined || quantity === undefined || !unit) {
        return res.status(400).json({ message: "Missing fields" });
    }

    await dbp.query(
        "INSERT INTO products (store_id, name, price, quantity, unit) VALUES (?, ?, ?, ?, ?)",
        [store.id, name, Number(price) || 0, Number(quantity) || 0, unit]
    );

    res.json({ message: "Product added" });
});

app.delete("/owner/products/:id", requireAuth, requireOwner, async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ message: "Invalid product id" });

    await dbp.query("DELETE FROM products WHERE id=? AND store_id=?", [productId, store.id]);
    res.json({ message: "Product removed" });
});

// ================= DELIVERY SETTINGS =================
app.post("/api/store/delivery-settings", requireAuth, requireOwner, async (req, res) => {
    const { delivery_available, delivery_charge, min_order, pickup_available } = req.body || {};

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    await dbp.query(
        `UPDATE stores
         SET delivery_available=?, delivery_charge=?, min_order_free_delivery=?, pickup_available=?
         WHERE id=?`,
        [
            !!delivery_available,
            Number(delivery_charge) || 0,
            Number(min_order) || 0,
            !!pickup_available,
            store.id
        ]
    );

    res.json({ message: "Delivery settings updated" });
});

// ================= PUBLIC STORE + PRODUCTS =================
app.get("/stores", async (req, res) => {
    const [rows] = await dbp.query(
        "SELECT id, store_name, delivery_available, delivery_charge, min_order_free_delivery, pickup_available FROM stores ORDER BY id DESC"
    );
    res.json(rows);
});

app.get("/products/:storeId", async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });
    const [rows] = await dbp.query("SELECT * FROM products WHERE store_id=? ORDER BY id DESC", [storeId]);
    res.json(rows);
});

// ================= STORE DETAILS =================
app.get("/store/:id", async (req, res) => {
    const [rows] = await dbp.query("SELECT * FROM stores WHERE id=?", [req.params.id]);
    res.json(rows[0] || {});
});

app.get("/store/:id/slots", async (req, res) => {
    const storeId = Number(req.params.id);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const [storeRows] = await dbp.query("SELECT pickup_available FROM stores WHERE id=?", [storeId]);
    const store = storeRows[0];
    if (!store || !store.pickup_available) return res.json([]);

    const [rows] = await dbp.query("SELECT * FROM time_slots WHERE store_id=? ORDER BY id ASC", [storeId]);
    // New requirement: time slots must be provided by owner only.
    // If none exist, return empty array.
    res.json(rows);
});

// ================= OWNER: TIME SLOTS =================
app.get("/owner/slots", requireAuth, requireOwner, async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    const [rows] = await dbp.query("SELECT * FROM time_slots WHERE store_id=? ORDER BY id ASC", [store.id]);
    res.json({ slots: rows });
});

app.post("/owner/slots", requireAuth, requireOwner, async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    const slot_time = String(req.body?.slot_time || "").trim();
    if (!slot_time) return res.status(400).json({ message: "Slot time required" });
    if (slot_time.length > 50) return res.status(400).json({ message: "Slot time too long" });

    try {
        await dbp.query("INSERT INTO time_slots (store_id, slot_time) VALUES (?, ?)", [store.id, slot_time]);
        res.json({ message: "Slot added" });
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Slot already exists" });
        }
        res.status(500).json({ message: "Server error" });
    }
});

app.delete("/owner/slots/:id", requireAuth, requireOwner, async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    const slotId = Number(req.params.id);
    if (!Number.isFinite(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    await dbp.query("DELETE FROM time_slots WHERE id=? AND store_id=?", [slotId, store.id]);
    res.json({ message: "Slot removed" });
});

// ================= USER ADDRESSES =================
app.get("/user/addresses", requireAuth, async (req, res) => {
    const [rows] = await dbp.query("SELECT * FROM user_addresses WHERE user_id=?", [req.auth.user.id]);
    res.json(rows);
});

app.post("/user/addresses", requireAuth, async (req, res) => {
    const type = String(req.body?.type || "").trim();
    const customer_name = String(req.body?.customer_name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const house = String(req.body?.house || "").trim();
    const area = String(req.body?.area || "").trim();
    const landmark = String(req.body?.landmark || "").trim();
    const city = String(req.body?.city || "").trim();
    const pincode = String(req.body?.pincode || "").trim();

    if (!type || !customer_name || !phone || !house || !area || !city || !pincode) {
        return res.status(400).json({ message: "Missing fields" });
    }

    if (!/^\d{10}$/.test(phone)) {
        return res.status(400).json({ message: "Invalid phone" });
    }
    if (!/^\d{5,10}$/.test(pincode)) {
        return res.status(400).json({ message: "Invalid pincode" });
    }

    const parts = [house, area, landmark, city, pincode].filter(Boolean);
    const address_line = parts.join(", ");

    const [result] = await dbp.query(
        "INSERT INTO user_addresses (user_id, type, address_line, customer_name, phone, house, area, landmark, city, pincode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [req.auth.user.id, type, address_line, customer_name, phone, house, area, landmark, city, pincode]
    );

    const [rows] = await dbp.query("SELECT * FROM user_addresses WHERE id=?", [result.insertId]);
    res.json({ message: "Address saved", address: rows[0] });
});

app.delete("/user/addresses/:id", requireAuth, async (req, res) => {
    const addressId = Number(req.params.id);
    if (!Number.isFinite(addressId)) return res.status(400).json({ message: "Invalid address id" });

    const [rows] = await dbp.query(
        "SELECT id FROM user_addresses WHERE id=? AND user_id=?",
        [addressId, req.auth.user.id]
    );

    if (!rows[0]) return res.status(404).json({ message: "Address not found" });

    await dbp.query("DELETE FROM user_addresses WHERE id=? AND user_id=?", [addressId, req.auth.user.id]);
    res.json({ message: "Address deleted" });
});

app.patch("/user/addresses/:id", requireAuth, async (req, res) => {
    const addressId = Number(req.params.id);
    if (!Number.isFinite(addressId)) return res.status(400).json({ message: "Invalid address id" });

    const type = String(req.body?.type || "").trim();
    const customer_name = String(req.body?.customer_name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const house = String(req.body?.house || "").trim();
    const area = String(req.body?.area || "").trim();
    const landmark = String(req.body?.landmark || "").trim();
    const city = String(req.body?.city || "").trim();
    const pincode = String(req.body?.pincode || "").trim();

    if (!type || !customer_name || !phone || !house || !area || !city || !pincode) {
        return res.status(400).json({ message: "Missing fields" });
    }

    if (!/^\d{10}$/.test(phone)) {
        return res.status(400).json({ message: "Invalid phone" });
    }
    if (!/^\d{5,10}$/.test(pincode)) {
        return res.status(400).json({ message: "Invalid pincode" });
    }

    const [exists] = await dbp.query(
        "SELECT id FROM user_addresses WHERE id=? AND user_id=?",
        [addressId, req.auth.user.id]
    );
    if (!exists[0]) return res.status(404).json({ message: "Address not found" });

    const parts = [house, area, landmark, city, pincode].filter(Boolean);
    const address_line = parts.join(", ");

    await dbp.query(
        `UPDATE user_addresses
         SET type=?, address_line=?, customer_name=?, phone=?, house=?, area=?, landmark=?, city=?, pincode=?
         WHERE id=? AND user_id=?`,
        [type, address_line, customer_name, phone, house, area, landmark, city, pincode, addressId, req.auth.user.id]
    );

    const [rows] = await dbp.query("SELECT * FROM user_addresses WHERE id=? AND user_id=?", [addressId, req.auth.user.id]);
    res.json({ message: "Address updated", address: rows[0] });
});

// ================= ORDERS =================
app.post("/orders", requireAuth, async (req, res) => {
    const { store_id, items, delivery_type, address_id, slot_id, delivery_fee } = req.body || {};

    if (!Number.isFinite(Number(store_id))) return res.status(400).json({ message: "Invalid store" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "No items" });
    if (delivery_type !== "delivery" && delivery_type !== "pickup") {
        return res.status(400).json({ message: "Invalid delivery type" });
    }

    let total = 0;
    for (const it of items) {
        const qty = Number(it.qty) || 0;
        const unitPrice = Number(it.unit_price) || 0;
        if (!it.name || qty <= 0 || unitPrice < 0) return res.status(400).json({ message: "Invalid items" });
        total += unitPrice * qty;
    }

    if (delivery_type === "delivery") {
        total += Number(delivery_fee) || 0;
    }

    const [order] = await dbp.query(
        `INSERT INTO orders (customer_id, store_id, total_amount, delivery_type, address_id, slot_id, delivery_fee)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.auth.user.id, Number(store_id), total, delivery_type, address_id || null, slot_id || null, Number(delivery_fee) || 0]
    );

    const orderId = order.insertId;
    for (const it of items) {
        await dbp.query(
            `INSERT INTO order_items (order_id, product_name, unit_price, qty)
             VALUES (?, ?, ?, ?)`,
            [orderId, it.name, Number(it.unit_price) || 0, Number(it.qty) || 0]
        );
    }

    res.json({ message: "Order placed", order_id: orderId });
});

// ================= START =================
async function start() {
    try {
        await ensureDatabaseExists();
        initPool();
        await initDb();
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (e) {
        console.error("Failed to start server:", e);
        process.exit(1);
    }
}

start();