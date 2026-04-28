# 🛒 Grocery Store Web Application

A full-stack web application that allows users to browse grocery products, place orders, manage carts, and interact with store owners. It also includes separate dashboards for customers and store owners.

---

## 📌 Features

### 👤 Customer Side

* User Registration & Login
* Browse Stores & Products
* Add to Cart
* Place Orders
* Manage Addresses
* View Order History
* Submit Complaints

### 🧑‍💼 Store Owner Side

* Owner Registration & Login
* Add / Manage Products
* View Orders
* Accept / Reject Orders
* Dashboard Management

---

## 🛠️ Tech Stack

**Frontend**

* HTML
* CSS
* JavaScript

**Backend**

* Node.js
* Express.js

**Database**

* MySQL

**Other Tools**

* dotenv (for environment variables)
* multer (for file uploads)
* cors

---

## 📁 Project Structure

```
grocery_store_project/
│
├── public/                # Frontend files (HTML, CSS, JS)
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── cart.html
│   ├── owner-dashboard.html
│   └── ...
│
├── server.js              # Backend server
├── package.json           # Dependencies & scripts
├── .env                   # Environment variables
└── node_modules/          # Installed packages
```

---

## ⚙️ Setup Instructions (Very Easy Steps)

Follow these steps carefully 👇

### 1️⃣ Download the Project

* Download ZIP or clone the repo

```
git clone <your-repo-link>
```

---

### 2️⃣ Open in VS Code

* Open the folder in VS Code

---

### 3️⃣ Install Dependencies

Open terminal and run:

```
npm install
```

---

### 4️⃣ Setup MySQL Database

1. Open MySQL (XAMPP / MySQL Workbench)
2. Create a database:

```
CREATE DATABASE grocery_db;
```

3. Import your tables (if SQL file is available)
   OR manually create tables based on your project

---

### 6️⃣ Start the Server

Run this command:

```
npm start
```

You should see:

```
Server running on port 3000
```

---

### 7️⃣ Run the Project

Open browser and go to:

```
http://localhost:3000
```

---

## 🚀 How to Use (Simple Language)

### For Customer:

1. Register account
2. Login
3. Browse products
4. Add items to cart
5. Place order
6. Track orders

### For Store Owner:

1. Register as owner
2. Login
3. Add products
4. Manage orders
5. Accept / Reject orders

---

## 🔐 Environment Variables

Make sure `.env` file is properly configured, otherwise database will not connect.

---

## ❗ Important Notes

* Node.js must be installed
* MySQL must be running
* Port 3000 should be free
* Do not upload `.env` file to GitHub

---

## 📌 Future Improvements

* Online Payment Integration
* Real-time Order Tracking
* Better UI/UX
* Admin Panel

---

## 👨‍💻 Author

**Vansh Mittal**
BTech CSE (AI & DS)

---

## ⭐ If you like this project

Give it a ⭐ on GitHub!

---
