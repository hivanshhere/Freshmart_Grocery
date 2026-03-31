require("dotenv").config();

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

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

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

    try { await dbp.query("ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD UNIQUE KEY uniq_stores_owner (owner_id)"); } catch {}
    try { await dbp.query("ALTER TABLE time_slots ADD UNIQUE KEY uniq_time_slot (store_id, slot_time)"); } catch {}
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

    res.json({ token, user: rows[0] });
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