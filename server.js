require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mysql2 = require("mysql2");
const mysql = require("mysql2/promise");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
app.use(express.static("public"));

const PORT = Number(process.env.PORT) || 3000;

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "admin@freshmart.com").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "admin123").trim();
const ADMIN_NAME = String(process.env.ADMIN_NAME || "Platform Admin").trim();

let db;
let dbp;

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
            cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function userDto(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        account_status: row.account_status || "active",
        warning_count: Number(row.warning_count) || 0,
        ban_reason: row.ban_reason || ""
    };
}

function newToken() {
    return crypto.randomBytes(32).toString("hex");
}

function normalizeAccountStatus(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["active", "warned", "banned", "removed"].includes(normalized)) return normalized;
    return "active";
}

function canUsePlatform(accountStatus) {
    return !["banned", "removed"].includes(normalizeAccountStatus(accountStatus));
}

function formatCurrency(value) {
    const amount = Number(value) || 0;
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function isValidLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

function calculateDistanceInKm(latitude1, longitude1, latitude2, longitude2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const latDiff = toRadians(latitude2 - latitude1);
    const lonDiff = toRadians(longitude2 - longitude1);
    const startLat = toRadians(latitude1);
    const endLat = toRadians(latitude2);

    const a =
        Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
        Math.cos(startLat) * Math.cos(endLat) *
        Math.sin(lonDiff / 2) * Math.sin(lonDiff / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
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

async function ensureAdminAccount() {
    const [rows] = await dbp.query("SELECT id FROM users WHERE email = ? LIMIT 1", [ADMIN_EMAIL]);
    if (rows[0]) {
        await dbp.query(
            "UPDATE users SET role = 'admin', account_status = 'active' WHERE id = ?",
            [rows[0].id]
        );
        return;
    }

    await dbp.query(
        "INSERT INTO users (name, email, password, role, account_status, warning_count, ban_reason) VALUES (?, ?, ?, 'admin', 'active', 0, '')",
        [ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD]
    );
}

async function initDb() {
    await dbp.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            password VARCHAR(100) NOT NULL,
            role VARCHAR(20) NOT NULL,
            account_status VARCHAR(20) NOT NULL DEFAULT 'active',
            warning_count INT NOT NULL DEFAULT 0,
            ban_reason VARCHAR(255) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            pickup_available BOOLEAN DEFAULT 1,
            latitude DECIMAL(10,7) DEFAULT NULL,
            longitude DECIMAL(10,7) DEFAULT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            store_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            quantity DECIMAL(10,2) NOT NULL,
            unit VARCHAR(20) NOT NULL,
            description VARCHAR(255) DEFAULT '',
            image VARCHAR(255) DEFAULT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            store_id INT NOT NULL,
            total_amount DECIMAL(10,2) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'placed',
            delivery_type VARCHAR(20) NOT NULL,
            address_id INT,
            slot_id INT,
            delivery_fee INT DEFAULT 0,
            owner_deleted TINYINT(1) NOT NULL DEFAULT 0,
            customer_deleted TINYINT(1) NOT NULL DEFAULT 0,
            owner_order_number INT DEFAULT NULL,
            customer_order_number INT DEFAULT NULL,
            owner_notification_pending TINYINT(1) NOT NULL DEFAULT 0
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            product_name VARCHAR(100) NOT NULL,
            unit_price DECIMAL(10,2) NOT NULL,
            qty INT NOT NULL,
            line_total DECIMAL(10,2) NOT NULL DEFAULT 0
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

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS moderation_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reporter_id INT NOT NULL,
            reporter_role VARCHAR(20) NOT NULL,
            target_user_id INT NOT NULL,
            target_role VARCHAR(20) NOT NULL,
            order_id INT NOT NULL,
            store_id INT NOT NULL,
            report_type VARCHAR(20) NOT NULL,
            rating INT DEFAULT NULL,
            message TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            admin_notes TEXT,
            resolved_by INT DEFAULT NULL,
            resolution_action VARCHAR(20) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS moderation_actions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_id INT NOT NULL,
            target_user_id INT NOT NULL,
            report_id INT DEFAULT NULL,
            action_type VARCHAR(20) NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    try { await dbp.query("ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active'"); } catch {}
    try { await dbp.query("ALTER TABLE users ADD COLUMN warning_count INT NOT NULL DEFAULT 0"); } catch {}
    try { await dbp.query("ALTER TABLE users ADD COLUMN ban_reason VARCHAR(255) DEFAULT ''"); } catch {}
    try { await dbp.query("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"); } catch {}
    try { await dbp.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL"); } catch {}

    try { await dbp.query("ALTER TABLE products ADD COLUMN description VARCHAR(255) DEFAULT ''"); } catch {}
    try { await dbp.query("ALTER TABLE products ADD COLUMN image VARCHAR(255) DEFAULT NULL"); } catch {}

    try { await dbp.query("ALTER TABLE orders ADD COLUMN address_id INT"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN slot_id INT"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN delivery_fee INT DEFAULT 0"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'placed'"); } catch {}
    try { await dbp.query("ALTER TABLE orders MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'placed'"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN owner_deleted TINYINT(1) NOT NULL DEFAULT 0"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN customer_deleted TINYINT(1) NOT NULL DEFAULT 0"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN owner_order_number INT DEFAULT NULL"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN customer_order_number INT DEFAULT NULL"); } catch {}
    try { await dbp.query("ALTER TABLE orders ADD COLUMN owner_notification_pending TINYINT(1) NOT NULL DEFAULT 0"); } catch {}
    try { await dbp.query("UPDATE orders SET owner_order_number = id WHERE owner_order_number IS NULL OR owner_order_number = 0"); } catch {}
    try { await dbp.query("UPDATE orders SET customer_order_number = id WHERE customer_order_number IS NULL OR customer_order_number = 0"); } catch {}

    try { await dbp.query("ALTER TABLE order_items ADD COLUMN line_total DECIMAL(10,2) NOT NULL DEFAULT 0"); } catch {}

    try { await dbp.query("ALTER TABLE moderation_reports ADD COLUMN rating INT DEFAULT NULL"); } catch {}
    try { await dbp.query("ALTER TABLE moderation_reports ADD COLUMN admin_notes TEXT"); } catch {}
    try { await dbp.query("ALTER TABLE moderation_reports ADD COLUMN resolved_by INT DEFAULT NULL"); } catch {}
    try { await dbp.query("ALTER TABLE moderation_reports ADD COLUMN resolution_action VARCHAR(20) DEFAULT NULL"); } catch {}
    try { await dbp.query("ALTER TABLE moderation_reports ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"); } catch {}

    try { await dbp.query("ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD UNIQUE KEY uniq_stores_owner (owner_id)"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD COLUMN latitude DECIMAL(10,7) DEFAULT NULL"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD COLUMN longitude DECIMAL(10,7) DEFAULT NULL"); } catch {}
    try { await dbp.query("ALTER TABLE time_slots ADD UNIQUE KEY uniq_time_slot (store_id, slot_time)"); } catch {}

    await ensureAdminAccount();
}

async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Login required" });

    const [rows] = await dbp.query(
        `SELECT us.token, u.id, u.name, u.email, u.role, u.account_status, u.warning_count, u.ban_reason
         FROM user_sessions us
         JOIN users u ON u.id = us.user_id
         WHERE us.token=?`,
        [token]
    );

    if (!rows[0]) return res.status(401).json({ message: "Invalid session" });
    if (!canUsePlatform(rows[0].account_status)) {
        await dbp.query("DELETE FROM user_sessions WHERE token=?", [token]);
        return res.status(403).json({ message: "Your account has been restricted by the admin" });
    }

    req.auth = { token, user: rows[0] };
    next();
}

function requireOwner(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ message: "Login required" });
    if (req.auth.user.role !== "owner") return res.status(403).json({ message: "Owner access required" });
    next();
}

function requireCustomer(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ message: "Login required" });
    if (req.auth.user.role !== "customer") return res.status(403).json({ message: "Customer access required" });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ message: "Login required" });
    if (req.auth.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
}

async function getOwnerStore(ownerId) {
    const [rows] = await dbp.query("SELECT * FROM stores WHERE owner_id=?", [ownerId]);
    return rows[0] || null;
}

async function getActiveStoreById(storeId) {
    const [rows] = await dbp.query(
        `SELECT s.id, s.owner_id, s.store_name, s.delivery_available, s.delivery_charge, s.min_order_free_delivery, s.pickup_available,
                s.latitude, s.longitude
         FROM stores s
         JOIN users u ON u.id = s.owner_id
         WHERE s.id = ? AND u.account_status NOT IN ('banned', 'removed')`,
        [storeId]
    );
    return rows[0] || null;
}

async function getCustomerAddressById(addressId, customerId) {
    const [rows] = await dbp.query(
        "SELECT id, user_id, address_line FROM user_addresses WHERE id = ? AND user_id = ?",
        [addressId, customerId]
    );
    return rows[0] || null;
}

async function getStoreSlotById(slotId, storeId) {
    const [rows] = await dbp.query(
        "SELECT id, store_id, slot_time FROM time_slots WHERE id = ? AND store_id = ?",
        [slotId, storeId]
    );
    return rows[0] || null;
}

function calculateDeliveryFee(store, itemsTotal) {
    if (!store || !store.delivery_available) return 0;
    const minimumForFree = Number(store.min_order_free_delivery) || 0;
    if (itemsTotal >= minimumForFree) return 0;
    return Number(store.delivery_charge) || 0;
}

async function attachItemsToOrders(orders) {
    for (const order of orders) {
        const [items] = await dbp.query(
            "SELECT id, order_id, product_name, unit_price, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id ASC",
            [order.id]
        );
        order.items = items;
    }
    return orders;
}

async function getNextOwnerOrderNumber(storeId) {
    const [rows] = await dbp.query(
        "SELECT COALESCE(MAX(owner_order_number), 0) AS max_order_number FROM orders WHERE store_id = ? AND owner_deleted = 0",
        [storeId]
    );
    return (Number(rows[0]?.max_order_number) || 0) + 1;
}

async function getNextCustomerOrderNumber(customerId) {
    const [rows] = await dbp.query(
        "SELECT COALESCE(MAX(customer_order_number), 0) AS max_order_number FROM orders WHERE customer_id = ? AND customer_deleted = 0",
        [customerId]
    );
    return (Number(rows[0]?.max_order_number) || 0) + 1;
}

async function purgeOrderIfHiddenEverywhere(orderId) {
    const [rows] = await dbp.query(
        "SELECT owner_deleted, customer_deleted FROM orders WHERE id = ?",
        [orderId]
    );
    const order = rows[0];
    if (!order) return;

    if (Number(order.owner_deleted) === 1 && Number(order.customer_deleted) === 1) {
        await dbp.query("DELETE FROM order_items WHERE order_id = ?", [orderId]);
        await dbp.query("DELETE FROM orders WHERE id = ?", [orderId]);
    }
}

async function createModerationAction(adminId, targetUserId, reportId, actionType, notes) {
    await dbp.query(
        "INSERT INTO moderation_actions (admin_id, target_user_id, report_id, action_type, notes) VALUES (?, ?, ?, ?, ?)",
        [adminId, targetUserId, reportId || null, actionType, notes || ""]
    );
}

async function issueWarning(adminId, targetUserId, reportId, notes) {
    await dbp.query(
        `UPDATE users
         SET warning_count = warning_count + 1,
             account_status = CASE WHEN account_status = 'active' THEN 'warned' ELSE account_status END,
             ban_reason = ?
         WHERE id = ? AND role <> 'admin'`,
        [notes || "Warning issued by admin", targetUserId]
    );
    await createModerationAction(adminId, targetUserId, reportId, "warning", notes);
}

async function removeUserAccess(adminId, targetUserId, reportId, notes, status) {
    const nextStatus = status === "removed" ? "removed" : "banned";
    await dbp.query(
        "UPDATE users SET account_status = ?, ban_reason = ? WHERE id = ? AND role <> 'admin'",
        [nextStatus, notes || "", targetUserId]
    );
    await dbp.query("DELETE FROM user_sessions WHERE user_id = ?", [targetUserId]);
    await createModerationAction(adminId, targetUserId, reportId, nextStatus, notes);
}

async function resolveReport(reportId, adminId, action, adminNotes) {
    await dbp.query(
        `UPDATE moderation_reports
         SET status = 'resolved', admin_notes = ?, resolved_by = ?, resolution_action = ?
         WHERE id = ?`,
        [adminNotes || "", adminId, action, reportId]
    );
}

async function rejectReport(reportId, adminId, adminNotes) {
    await dbp.query(
        `UPDATE moderation_reports
         SET status = 'dismissed', admin_notes = ?, resolved_by = ?, resolution_action = 'dismissed'
         WHERE id = ?`,
        [adminNotes || "", adminId, reportId]
    );
}

// ================= AUTH =================
app.post("/auth/register-customer", asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    try {
        const [result] = await dbp.query(
            "INSERT INTO users (name, email, password, role, account_status, warning_count, ban_reason) VALUES (?, ?, ?, 'customer', 'active', 0, '')",
            [name, String(email).trim().toLowerCase(), password]
        );

        const userId = result.insertId;
        const token = newToken();
        await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, userId]);

        res.json({ token, user: { id: userId, name, email: String(email).trim().toLowerCase(), role: "customer" } });
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Email already registered" });
        }
        res.status(500).json({ message: "Server error" });
    }
}));

app.post("/auth/register-owner", asyncHandler(async (req, res) => {
    const { name, email, password, store_name } = req.body || {};
    if (!name || !email || !password || !store_name) return res.status(400).json({ message: "Missing fields" });

    const storeNameCaps = String(store_name).trim().toUpperCase();
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!storeNameCaps) return res.status(400).json({ message: "Missing fields" });

    try {
        const [userResult] = await dbp.query(
            "INSERT INTO users (name, email, password, role, account_status, warning_count, ban_reason) VALUES (?, ?, ?, 'owner', 'active', 0, '')",
            [name, normalizedEmail, password]
        );

        const ownerId = userResult.insertId;
        const [storeResult] = await dbp.query(
            "INSERT INTO stores (owner_id, store_name, delivery_available, delivery_charge, min_order_free_delivery, pickup_available) VALUES (?, ?, 0, 0, 0, 1)",
            [ownerId, storeNameCaps]
        );

        const token = newToken();
        await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, ownerId]);

        res.json({
            token,
            user: { id: ownerId, name, email: normalizedEmail, role: "owner" },
            store: {
                id: storeResult.insertId,
                owner_id: ownerId,
                store_name: storeNameCaps,
                delivery_available: 0,
                delivery_charge: 0,
                min_order_free_delivery: 0,
                pickup_available: 1
            }
        });
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Email already registered" });
        }
        res.status(500).json({ message: "Server error" });
    }
}));

app.post("/auth/login", asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    if (!email || !password) return res.status(400).json({ message: "Missing fields" });

    const [rows] = await dbp.query(
        "SELECT * FROM users WHERE email=? AND password=?",
        [email, password]
    );

    if (!rows[0]) return res.status(401).json({ message: "Invalid credentials" });
    if (!canUsePlatform(rows[0].account_status)) {
        return res.status(403).json({ message: "Your account has been restricted by the admin" });
    }

    const token = newToken();
    await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, rows[0].id]);

    const u = userDto(rows[0]);
    const store = u?.role === "owner" ? await getOwnerStore(u.id) : null;
    res.json({ token, user: u, store });
}));

app.post("/auth/logout", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.json({ message: "Logged out" });
    await dbp.query("DELETE FROM user_sessions WHERE token=?", [token]);
    res.json({ message: "Logged out" });
}));

app.get("/auth/me", requireAuth, asyncHandler(async (req, res) => {
    const user = userDto(req.auth.user);
    let moderationReports = [];

    if (req.auth.user.role === "owner" || req.auth.user.role === "customer") {
        const [rows] = await dbp.query(
            `SELECT mr.id, mr.order_id, mr.report_type, mr.message, mr.status, mr.admin_notes,
                    mr.created_at, mr.updated_at, mr.resolution_action, mr.rating,
                    reporter.name AS reporter_name, reporter.role AS reporter_role,
                    s.store_name,
                    admin_user.name AS resolved_by_name
             FROM moderation_reports mr
             JOIN users reporter ON reporter.id = mr.reporter_id
             LEFT JOIN stores s ON s.id = mr.store_id
             LEFT JOIN users admin_user ON admin_user.id = mr.resolved_by
             WHERE mr.target_user_id = ?
             ORDER BY mr.updated_at DESC, mr.created_at DESC
             LIMIT 10`,
            [req.auth.user.id]
        );
        moderationReports = rows;
    }

    res.json({ user, moderation_reports: moderationReports });
}));

// ================= PUBLIC CUSTOMER-FACING APIs =================
app.get("/stores", asyncHandler(async (req, res) => {
    const customerLatitude = Number(req.query.latitude);
    const customerLongitude = Number(req.query.longitude);

    if (!isValidLatitude(customerLatitude) || !isValidLongitude(customerLongitude)) {
        return res.status(400).json({ message: "Valid customer latitude and longitude are required" });
    }

    const [rows] = await dbp.query(
        `SELECT s.id, s.store_name, s.delivery_available, s.delivery_charge, s.min_order_free_delivery, s.pickup_available,
                s.latitude, s.longitude
         FROM stores s
         JOIN users u ON u.id = s.owner_id
         WHERE u.account_status NOT IN ('banned', 'removed')
           AND s.latitude IS NOT NULL
           AND s.longitude IS NOT NULL
         ORDER BY s.id DESC`
    );

    const nearbyStores = rows
        .map((store) => {
            const storeLatitude = Number(store.latitude);
            const storeLongitude = Number(store.longitude);
            const distance_km = calculateDistanceInKm(
                customerLatitude,
                customerLongitude,
                storeLatitude,
                storeLongitude
            );

            return {
                ...store,
                latitude: storeLatitude,
                longitude: storeLongitude,
                distance_km: Number(distance_km.toFixed(2))
            };
        })
        .filter((store) => store.distance_km <= 5)
        .sort((a, b) => a.distance_km - b.distance_km);

    res.json(nearbyStores);
}));

app.get("/store/:storeId", asyncHandler(async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const store = await getActiveStoreById(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json(store);
}));

app.get("/products/:storeId", asyncHandler(async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const [storeRows] = await dbp.query(
        `SELECT s.id
         FROM stores s
         JOIN users u ON u.id = s.owner_id
         WHERE s.id = ? AND u.account_status NOT IN ('banned', 'removed')`,
        [storeId]
    );
    if (!storeRows[0]) return res.json([]);

    const [rows] = await dbp.query(
        "SELECT id, store_id, name, price, quantity, unit, description, image FROM products WHERE store_id=? ORDER BY id DESC",
        [storeId]
    );
    res.json(rows);
}));

app.get("/store/:storeId/slots", asyncHandler(async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const [rows] = await dbp.query(
        "SELECT id, store_id, slot_time FROM time_slots WHERE store_id=? ORDER BY id DESC",
        [storeId]
    );
    res.json(rows);
}));

// ================= OWNER APIs =================
app.get("/owner/store", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    res.json(store || null);
}));

app.post("/owner/store", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { store_name } = req.body || {};
    if (!store_name) return res.status(400).json({ message: "Store name required" });

    const storeNameCaps = String(store_name).trim().toUpperCase();
    if (!storeNameCaps) return res.status(400).json({ message: "Store name required" });

    const existing = await getOwnerStore(req.auth.user.id);
    if (existing) return res.status(409).json({ message: "Store already exists" });

    const [result] = await dbp.query(
        "INSERT INTO stores (owner_id, store_name, delivery_available, delivery_charge, min_order_free_delivery, pickup_available) VALUES (?, ?, 0, 0, 0, 1)",
        [req.auth.user.id, storeNameCaps]
    );
    const store = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Store created", store: store || { id: result.insertId, store_name: storeNameCaps } });
}));

app.patch("/owner/store", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { store_name } = req.body || {};
    if (!store_name) return res.status(400).json({ message: "Store name required" });

    const storeNameCaps = String(store_name).trim().toUpperCase();
    if (!storeNameCaps) return res.status(400).json({ message: "Store name required" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    await dbp.query("UPDATE stores SET store_name=? WHERE owner_id=?", [storeNameCaps, req.auth.user.id]);
    const updated = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Store updated", store: updated });
}));

app.patch("/owner/store/location", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
        return res.status(400).json({ message: "Enter a valid latitude and longitude" });
    }

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    await dbp.query(
        "UPDATE stores SET latitude = ?, longitude = ? WHERE owner_id = ?",
        [latitude, longitude, req.auth.user.id]
    );

    const updated = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Store location updated", store: updated });
}));

app.get("/owner/products", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.json({ products: [] });

    const [rows] = await dbp.query(
        "SELECT id, store_id, name, price, quantity, unit, description, image FROM products WHERE store_id=? ORDER BY id DESC",
        [store.id]
    );
    res.json({ products: rows });
}));

app.post("/owner/products", requireAuth, requireOwner, upload.single("image"), asyncHandler(async (req, res) => {
    const { name, price, quantity, unit, description } = req.body || {};
    const productName = String(name || "").trim();
    const productUnit = String(unit || "").trim();
    const descriptionText = String(description || "").trim();
    const productPrice = Number(price);
    const productQuantity = Number(quantity);

    if (!productName || !productUnit || !Number.isFinite(productPrice) || !Number.isFinite(productQuantity)) {
        return res.status(400).json({ message: "Missing fields" });
    }

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    const image = req.file ? req.file.filename : null;

    await dbp.query(
        "INSERT INTO products (store_id, name, price, quantity, unit, description, image) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [store.id, productName, productPrice, productQuantity, productUnit, descriptionText, image]
    );
    res.json({ message: "Product added" });
}));

app.delete("/owner/products/:productId", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId)) return res.status(400).json({ message: "Invalid product id" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    const [result] = await dbp.query(
        "DELETE FROM products WHERE id=? AND store_id=?",
        [productId, store.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product removed" });
}));

async function saveDeliverySettings(req, res) {
    const { delivery_available, delivery_charge, min_order, pickup_available } = req.body || {};
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    await dbp.query(
        "UPDATE stores SET delivery_available=?, delivery_charge=?, min_order_free_delivery=?, pickup_available=? WHERE owner_id=?",
        [
            delivery_available ? 1 : 0,
            Number(delivery_charge) || 0,
            Number(min_order) || 0,
            pickup_available ? 1 : 0,
            req.auth.user.id
        ]
    );
    const updated = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Delivery settings updated", store: updated });
}

app.patch("/owner/store/delivery-settings", requireAuth, requireOwner, asyncHandler(saveDeliverySettings));
app.post("/api/store/delivery-settings", requireAuth, requireOwner, asyncHandler(saveDeliverySettings));

app.get("/owner/slots", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.json({ slots: [] });
    const [rows] = await dbp.query(
        "SELECT id, store_id, slot_time FROM time_slots WHERE store_id=? ORDER BY id DESC",
        [store.id]
    );
    res.json({ slots: rows });
}));

app.post("/owner/slots", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { slot_time } = req.body || {};
    if (!slot_time) return res.status(400).json({ message: "slot_time required" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    try {
        await dbp.query(
            "INSERT INTO time_slots (store_id, slot_time) VALUES (?, ?)",
            [store.id, String(slot_time).trim()]
        );
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Slot already exists" });
        }
        throw e;
    }

    res.json({ message: "Slot added" });
}));

app.delete("/owner/slots/:slotId", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const slotId = Number(req.params.slotId);
    if (!Number.isFinite(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    const [result] = await dbp.query(
        "DELETE FROM time_slots WHERE id=? AND store_id=?",
        [slotId, store.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Slot not found" });
    res.json({ message: "Slot removed" });
}));

app.get("/owner/orders/:store_id", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const storeId = Number(req.params.store_id);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const ownerStore = await getOwnerStore(req.auth.user.id);
    if (!ownerStore || Number(ownerStore.id) !== storeId) {
        return res.status(403).json({ message: "Store access denied" });
    }

    const [orders] = await dbp.query(
        `SELECT o.*, o.owner_order_number AS display_order_number,
                u.name AS customer_name, u.email AS customer_email, u.id AS customer_user_id, u.account_status AS customer_account_status
         FROM orders o
         LEFT JOIN users u ON u.id = o.customer_id
         WHERE o.store_id = ? AND o.owner_deleted = 0
         ORDER BY o.owner_order_number DESC, o.id DESC`,
        [storeId]
    );

    await attachItemsToOrders(orders);
    res.json(orders);
}));

app.get("/owner/orders/:store_id/notifications", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const storeId = Number(req.params.store_id);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const ownerStore = await getOwnerStore(req.auth.user.id);
    if (!ownerStore || Number(ownerStore.id) !== storeId) {
        return res.status(403).json({ message: "Store access denied" });
    }

    const [rows] = await dbp.query(
        "SELECT COUNT(*) AS pending_count FROM orders WHERE store_id = ? AND owner_deleted = 0 AND owner_notification_pending = 1",
        [storeId]
    );
    const count = Number(rows[0]?.pending_count) || 0;

    if (count > 0) {
        await dbp.query(
            "UPDATE orders SET owner_notification_pending = 0 WHERE store_id = ? AND owner_deleted = 0 AND owner_notification_pending = 1",
            [storeId]
        );
    }

    res.json({ count });
}));

async function updateOwnerOrderStatus(req, res) {
    const orderId = Number(req.params.orderId || req.body?.order_id);
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!Number.isFinite(orderId)) return res.status(400).json({ message: "Invalid order id" });
    if (!["accepted", "rejected", "placed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    const ownerStore = await getOwnerStore(req.auth.user.id);
    if (!ownerStore) return res.status(404).json({ message: "Store not found" });

    const [result] = await dbp.query(
        "UPDATE orders SET status = ? WHERE id = ? AND store_id = ?",
        [status, orderId, ownerStore.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Order not found" });

    res.json({ message: "Order status updated" });
}

app.patch("/owner/orders/:orderId/status", requireAuth, requireOwner, asyncHandler(updateOwnerOrderStatus));
app.post("/update-order-status", requireAuth, requireOwner, asyncHandler(updateOwnerOrderStatus));

app.delete("/owner/orders/:orderId", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const orderId = Number(req.params.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ message: "Invalid order id" });

    const ownerStore = await getOwnerStore(req.auth.user.id);
    if (!ownerStore) return res.status(404).json({ message: "Store not found" });

    const [orders] = await dbp.query(
        "SELECT id FROM orders WHERE id = ? AND store_id = ? AND owner_deleted = 0",
        [orderId, ownerStore.id]
    );
    if (!orders[0]) return res.status(404).json({ message: "Order not found" });

    await dbp.query(
        "UPDATE orders SET owner_deleted = 1 WHERE id = ? AND store_id = ?",
        [orderId, ownerStore.id]
    );
    await purgeOrderIfHiddenEverywhere(orderId);

    res.json({ message: "Order removed from the store order panel" });
}));

// ================= CUSTOMER APIs =================
app.get("/user/addresses", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const [rows] = await dbp.query(
        "SELECT id, user_id, type, address_line, customer_name, phone, house, area, landmark, city, pincode FROM user_addresses WHERE user_id=? ORDER BY id DESC",
        [req.auth.user.id]
    );
    res.json(rows);
}));

app.post("/user/addresses", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const { type, customer_name, phone, house, area, landmark, city, pincode } = req.body || {};
    if (!type || !customer_name || !phone || !house || !area || !city || !pincode) {
        return res.status(400).json({ message: "Missing fields" });
    }
    const address_line = [house, area, landmark, city, pincode].filter(Boolean).join(", ");

    const [result] = await dbp.query(
        "INSERT INTO user_addresses (user_id, type, address_line, customer_name, phone, house, area, landmark, city, pincode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [req.auth.user.id, type, address_line, customer_name, phone, house, area, landmark || "", city, pincode]
    );

    const [rows] = await dbp.query(
        "SELECT id, user_id, type, address_line, customer_name, phone, house, area, landmark, city, pincode FROM user_addresses WHERE id=?",
        [result.insertId]
    );
    res.json({ message: "Address saved", address: rows[0] });
}));

app.patch("/user/addresses/:addressId", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const addressId = Number(req.params.addressId);
    if (!Number.isFinite(addressId)) return res.status(400).json({ message: "Invalid address id" });

    const { type, customer_name, phone, house, area, landmark, city, pincode } = req.body || {};
    if (!type || !customer_name || !phone || !house || !area || !city || !pincode) {
        return res.status(400).json({ message: "Missing fields" });
    }
    const address_line = [house, area, landmark, city, pincode].filter(Boolean).join(", ");

    const [result] = await dbp.query(
        `UPDATE user_addresses
         SET type=?, address_line=?, customer_name=?, phone=?, house=?, area=?, landmark=?, city=?, pincode=?
         WHERE id=? AND user_id=?`,
        [type, address_line, customer_name, phone, house, area, landmark || "", city, pincode, addressId, req.auth.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Address not found" });
    res.json({ message: "Address updated" });
}));

app.delete("/user/addresses/:addressId", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const addressId = Number(req.params.addressId);
    if (!Number.isFinite(addressId)) return res.status(400).json({ message: "Invalid address id" });

    const [result] = await dbp.query(
        "DELETE FROM user_addresses WHERE id=? AND user_id=?",
        [addressId, req.auth.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Address not found" });
    res.json({ message: "Address deleted" });
}));

app.post("/orders", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const { store_id, delivery_type, address_id, slot_id, items } = req.body || {};
    const storeId = Number(store_id);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store" });
    if (delivery_type !== "delivery" && delivery_type !== "pickup") {
        return res.status(400).json({ message: "Invalid delivery type" });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No items" });
    }

    const store = await getActiveStoreById(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });

    let itemsTotal = 0;
    for (const it of items) {
        const qty = Number(it?.qty);
        const unit_price = Number(it?.unit_price);
        if (!it?.name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit_price) || unit_price < 0) {
            return res.status(400).json({ message: "Invalid items" });
        }
        itemsTotal += qty * unit_price;
    }

    const addressId = address_id === null || address_id === undefined || address_id === "" ? null : Number(address_id);
    const slotId = slot_id === null || slot_id === undefined || slot_id === "" ? null : Number(slot_id);
    let fee = 0;
    let finalAddressId = null;
    let finalSlotId = null;

    if (delivery_type === "delivery") {
        if (!store.delivery_available) {
            return res.status(400).json({ message: "This store does not offer delivery" });
        }
        if (!Number.isFinite(addressId)) {
            return res.status(400).json({ message: "Please select a delivery address" });
        }

        const address = await getCustomerAddressById(addressId, req.auth.user.id);
        if (!address) return res.status(404).json({ message: "Selected address not found" });

        finalAddressId = address.id;
        finalSlotId = null;
        fee = calculateDeliveryFee(store, itemsTotal);
    } else {
        if (!store.pickup_available) {
            return res.status(400).json({ message: "This store does not offer pickup" });
        }
        if (!Number.isFinite(slotId)) {
            return res.status(400).json({ message: "Please select a pickup slot" });
        }

        const slot = await getStoreSlotById(slotId, storeId);
        if (!slot) return res.status(404).json({ message: "Selected pickup slot not found" });

        finalAddressId = null;
        finalSlotId = slot.id;
        fee = 0;
    }

    const total_amount = itemsTotal + fee;

    const ownerOrderNumber = await getNextOwnerOrderNumber(storeId);
    const customerOrderNumber = await getNextCustomerOrderNumber(req.auth.user.id);

    const [orderResult] = await dbp.query(
        `INSERT INTO orders (
            customer_id, store_id, total_amount, status, delivery_type, address_id, slot_id, delivery_fee,
            owner_order_number, customer_order_number, owner_notification_pending
        ) VALUES (?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, 1)`,
        [req.auth.user.id, storeId, total_amount, delivery_type, finalAddressId, finalSlotId, fee, ownerOrderNumber, customerOrderNumber]
    );
    const orderId = orderResult.insertId;

    for (const it of items) {
        const qty = Number(it.qty);
        const unitPrice = Number(it.unit_price);
        await dbp.query(
            "INSERT INTO order_items (order_id, product_name, unit_price, qty, line_total) VALUES (?, ?, ?, ?, ?)",
            [orderId, it.name, unitPrice, qty, qty * unitPrice]
        );
    }

    res.json({
        message: "Order placed",
        order_id: orderId,
        customer_order_number: customerOrderNumber,
        owner_order_number: ownerOrderNumber,
        delivery_type,
        delivery_fee: fee,
        address_id: finalAddressId,
        slot_id: finalSlotId,
        total_amount
    });
}));

app.get("/user/orders", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const [orders] = await dbp.query(
        `SELECT o.*, o.customer_order_number AS display_order_number, s.store_name, s.owner_id,
                u.name AS owner_name, u.account_status AS owner_account_status
         FROM orders o
         LEFT JOIN stores s ON s.id = o.store_id
         LEFT JOIN users u ON u.id = s.owner_id
         WHERE o.customer_id = ? AND o.customer_deleted = 0
         ORDER BY o.customer_order_number DESC, o.id DESC`,
        [req.auth.user.id]
    );

    await attachItemsToOrders(orders);
    res.json(orders);
}));

app.delete("/user/orders/:orderId", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const orderId = Number(req.params.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ message: "Invalid order id" });

    const [orders] = await dbp.query(
        "SELECT id FROM orders WHERE id = ? AND customer_id = ? AND customer_deleted = 0",
        [orderId, req.auth.user.id]
    );
    if (!orders[0]) return res.status(404).json({ message: "Order not found" });

    await dbp.query(
        "UPDATE orders SET customer_deleted = 1 WHERE id = ? AND customer_id = ?",
        [orderId, req.auth.user.id]
    );
    await purgeOrderIfHiddenEverywhere(orderId);

    res.json({ message: "Order removed from your order history" });
}));

// ================= REPORTING / REVIEW =================
app.post("/reports", requireAuth, asyncHandler(async (req, res) => {
    const user = req.auth.user;
    if (!["customer", "owner"].includes(user.role)) {
        return res.status(403).json({ message: "Only customers and owners can send reports" });
    }

    const orderId = Number(req.body?.order_id);
    const targetUserId = Number(req.body?.target_user_id);
    const reportType = String(req.body?.report_type || "").trim().toLowerCase();
    const message = String(req.body?.message || "").trim();
    const rating = req.body?.rating === null || req.body?.rating === undefined || req.body?.rating === ""
        ? null
        : Number(req.body.rating);

    if (!Number.isFinite(orderId) || !Number.isFinite(targetUserId)) {
        return res.status(400).json({ message: "Invalid order or target user" });
    }
    if (!["review", "complaint"].includes(reportType)) {
        return res.status(400).json({ message: "Report type must be review or complaint" });
    }
    if (!message) {
        return res.status(400).json({ message: "Please enter the review or complaint details" });
    }
    if (reportType === "review" && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
        return res.status(400).json({ message: "Review rating must be between 1 and 5" });
    }

    const [orderRows] = await dbp.query(
        `SELECT o.id, o.customer_id, o.store_id, s.owner_id
         FROM orders o
         JOIN stores s ON s.id = o.store_id
         WHERE o.id = ?`,
        [orderId]
    );
    const order = orderRows[0];
    if (!order) return res.status(404).json({ message: "Order not found" });

    let expectedTargetUserId = null;
    let targetRole = null;

    if (user.role === "customer") {
        if (Number(order.customer_id) !== Number(user.id)) {
            return res.status(403).json({ message: "You can only review your own orders" });
        }
        expectedTargetUserId = Number(order.owner_id);
        targetRole = "owner";
    } else {
        if (Number(order.owner_id) !== Number(user.id)) {
            return res.status(403).json({ message: "You can only review customers from your own store orders" });
        }
        expectedTargetUserId = Number(order.customer_id);
        targetRole = "customer";
    }

    if (expectedTargetUserId !== targetUserId) {
        return res.status(403).json({ message: "Invalid target user for this order" });
    }

    await dbp.query(
        `INSERT INTO moderation_reports (
            reporter_id, reporter_role, target_user_id, target_role, order_id, store_id, report_type, rating, message, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [user.id, user.role, targetUserId, targetRole, orderId, order.store_id, reportType, reportType === "review" ? rating : null, message]
    );

    res.json({ message: "Your feedback has been sent to the admin" });
}));

app.get("/my-reports", requireAuth, asyncHandler(async (req, res) => {
    const [rows] = await dbp.query(
        `SELECT mr.id, mr.order_id, mr.report_type, mr.rating, mr.message, mr.status, mr.admin_notes,
                mr.created_at, mr.updated_at, mr.resolution_action,
                o.customer_order_number AS order_display_number, o.total_amount, o.delivery_type,
                o.status AS order_status,
                tu.name AS target_name, tu.role AS target_role,
                s.store_name,
                admin_user.name AS resolved_by_name
         FROM moderation_reports mr
         LEFT JOIN orders o ON o.id = mr.order_id
         JOIN users tu ON tu.id = mr.target_user_id
         LEFT JOIN stores s ON s.id = mr.store_id
         LEFT JOIN users admin_user ON admin_user.id = mr.resolved_by
         WHERE mr.reporter_id = ?
         ORDER BY mr.created_at DESC`,
        [req.auth.user.id]
    );
    res.json(rows);
}));

// ================= ADMIN APIs =================
app.get("/admin/dashboard", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const [[summaryRows], [users], [reports], [actions]] = await Promise.all([
        dbp.query(
            `SELECT
                (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
                (SELECT COUNT(*) FROM users WHERE role = 'owner') AS owners,
                (SELECT COUNT(*) FROM users WHERE account_status = 'banned') AS banned_users,
                (SELECT COUNT(*) FROM users WHERE account_status = 'removed') AS removed_users,
                (SELECT COUNT(*) FROM moderation_reports WHERE status = 'pending') AS pending_reports`
        ),
        dbp.query(
            `SELECT u.id, u.name, u.email, u.role, u.account_status, u.warning_count, u.ban_reason, u.created_at,
                    s.id AS store_id, s.store_name
             FROM users u
             LEFT JOIN stores s ON s.owner_id = u.id
             WHERE u.role IN ('customer', 'owner')
             ORDER BY FIELD(u.account_status, 'banned', 'removed', 'warned', 'active'), u.role, u.name`
        ),
        dbp.query(
            `SELECT mr.id, mr.report_type, mr.rating, mr.message, mr.status, mr.admin_notes, mr.order_id, mr.store_id,
                    mr.created_at, mr.resolution_action,
                    reporter.name AS reporter_name, reporter.email AS reporter_email, reporter.role AS reporter_role,
                    target.id AS target_user_id, target.name AS target_name, target.email AS target_email, target.role AS target_role, target.account_status AS target_account_status,
                    s.store_name,
                    admin_user.name AS resolved_by_name
             FROM moderation_reports mr
             JOIN users reporter ON reporter.id = mr.reporter_id
             JOIN users target ON target.id = mr.target_user_id
             LEFT JOIN stores s ON s.id = mr.store_id
             LEFT JOIN users admin_user ON admin_user.id = mr.resolved_by
             ORDER BY FIELD(mr.status, 'pending', 'resolved', 'dismissed'), mr.created_at DESC`
        ),
        dbp.query(
            `SELECT ma.id, ma.action_type, ma.notes, ma.created_at,
                    admin_user.name AS admin_name,
                    target.name AS target_name, target.role AS target_role
             FROM moderation_actions ma
             JOIN users admin_user ON admin_user.id = ma.admin_id
             JOIN users target ON target.id = ma.target_user_id
             ORDER BY ma.created_at DESC
             LIMIT 20`
        )
    ]);

    res.json({
        summary: {
            customers: Number(summaryRows[0]?.customers) || 0,
            owners: Number(summaryRows[0]?.owners) || 0,
            banned_users: Number(summaryRows[0]?.banned_users) || 0,
            removed_users: Number(summaryRows[0]?.removed_users) || 0,
            pending_reports: Number(summaryRows[0]?.pending_reports) || 0
        },
        users,
        reports,
        actions
    });
}));

app.post("/admin/users/:userId/action", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const targetUserId = Number(req.params.userId);
    const action = String(req.body?.action || "").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim();
    const reportId = req.body?.report_id ? Number(req.body.report_id) : null;

    if (!Number.isFinite(targetUserId)) return res.status(400).json({ message: "Invalid user" });
    if (!["warning", "ban", "remove", "activate"].includes(action)) {
        return res.status(400).json({ message: "Invalid admin action" });
    }

    const [rows] = await dbp.query(
        "SELECT id, role FROM users WHERE id = ?",
        [targetUserId]
    );
    const targetUser = rows[0];
    if (!targetUser) return res.status(404).json({ message: "User not found" });
    if (targetUser.role === "admin") return res.status(400).json({ message: "Admin accounts cannot be moderated here" });

    if (action === "warning") {
        await issueWarning(req.auth.user.id, targetUserId, reportId, notes || "Warning issued by admin");
    } else if (action === "ban") {
        await removeUserAccess(req.auth.user.id, targetUserId, reportId, notes || "Banned by admin", "banned");
    } else if (action === "remove") {
        await removeUserAccess(req.auth.user.id, targetUserId, reportId, notes || "Removed by admin", "removed");
    } else if (action === "activate") {
        await dbp.query(
            "UPDATE users SET account_status = 'active', ban_reason = '' WHERE id = ? AND role <> 'admin'",
            [targetUserId]
        );
        await createModerationAction(req.auth.user.id, targetUserId, reportId, "activate", notes || "Account reactivated");
    }

    if (Number.isFinite(reportId)) {
        await resolveReport(reportId, req.auth.user.id, action, notes);
    }

    res.json({ message: "Admin action saved" });
}));

app.post("/admin/reports/:reportId/dismiss", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const reportId = Number(req.params.reportId);
    const adminNotes = String(req.body?.notes || "").trim();
    if (!Number.isFinite(reportId)) return res.status(400).json({ message: "Invalid report" });

    await rejectReport(reportId, req.auth.user.id, adminNotes || "Report dismissed by admin");
    res.json({ message: "Report dismissed" });
}));

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError || err?.message === "Only image files are allowed") {
        return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Server error" });
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
