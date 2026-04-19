(function () {
    try {
        const API_BASE = "http://localhost:3000";
        const role = localStorage.getItem("userRole");
        const token = localStorage.getItem("authToken");
        const showAddresses = role === "customer" && !!token;
        const showCustomerOrders = role === "customer" && !!token;
        const showOwnerDashboard = role === "owner" && !!token;
        const showAdminDashboard = role === "admin" && !!token;

        const isLoggedIn = !!token;

        document.querySelectorAll('[data-nav="addresses"]').forEach((el) => {
            el.style.display = showAddresses ? "" : "none";
        });

        document.querySelectorAll('[data-nav="customer-orders"]').forEach((el) => {
            el.style.display = showCustomerOrders ? "" : "none";
        });

        document.querySelectorAll('[data-nav="owner-dashboard"]').forEach((el) => {
            el.style.display = showOwnerDashboard ? "" : "none";
        });

        document.querySelectorAll('[data-nav="admin-dashboard"]').forEach((el) => {
            el.style.display = showAdminDashboard ? "" : "none";
        });

        document.querySelectorAll('[data-nav="logout"]').forEach((el) => {
            el.style.display = isLoggedIn ? "" : "none";
            el.addEventListener("click", async (e) => {
                e.preventDefault();
                try {
                    await fetch(`${API_BASE}/auth/logout`, {
                        method: "POST",
                        headers: token ? { "Authorization": `Bearer ${token}` } : {}
                    });
                } catch {
                }
                localStorage.clear();
                window.location.href = "login.html";
            });
        });

        document.querySelectorAll('a[href="login.html"]').forEach((el) => {
            el.style.display = isLoggedIn ? "none" : "";
        });
    } catch {
    }
})();
