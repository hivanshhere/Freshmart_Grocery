function login() {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();
    const msg = document.getElementById("msg");

    if (email === "" || password === "") {
        msg.innerText = "Enter email and password";
        return;
    }

    fetch("http://localhost:3000/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    })
    .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.message || "Login failed");
        }
        return data;
    })
    .then(data => {
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userId", String(data.user.id));
        localStorage.setItem("userName", data.user.name || "");
        localStorage.setItem("userRole", data.user.role || "");
        localStorage.setItem("accountStatus", data.user.account_status || "active");
        localStorage.setItem("warningCount", String(data.user.warning_count || 0));
        localStorage.setItem("banReason", data.user.ban_reason || "");

        if (data.store && data.store.id) {
            localStorage.setItem("storeId", String(data.store.id));
            localStorage.setItem("storeName", String(data.store.store_name || ""));
        } else {
            localStorage.removeItem("storeId");
            localStorage.removeItem("storeName");
        }

        const afterLogin = localStorage.getItem("afterLogin");
        if (afterLogin) localStorage.removeItem("afterLogin");

        const isSafeLocalHtml = (value) => {
            if (!value) return false;
            if (value.includes("://")) return false;
            if (value.startsWith("//")) return false;
            return value.endsWith(".html") || value.includes(".html?");
        };

        if (data.user.role === "admin") {
            window.location.href = "admin-dashboard.html";
        } else if (data.user.role === "owner") {
            window.location.href = "owner-dashboard.html";
        } else {
            window.location.href = isSafeLocalHtml(afterLogin) ? afterLogin : "stores.html";
        }
    })
    .catch(err => {
        msg.innerText = err.message || "Server error";
        console.log(err);
    });
}
