(function () {
    const API_BASE = "http://localhost:3000";
    const SESSION_KEYS = [
        "authToken",
        "userId",
        "userName",
        "userRole",
        "accountStatus",
        "warningCount",
        "banReason"
    ];

    function getToken() {
        return localStorage.getItem("authToken") || "";
    }

    function saveSession(user, extras = {}) {
        if (!user) return;
        localStorage.setItem("userId", String(user.id || ""));
        localStorage.setItem("userName", String(user.name || ""));
        localStorage.setItem("userRole", String(user.role || ""));
        localStorage.setItem("accountStatus", String(user.account_status || "active"));
        localStorage.setItem("warningCount", String(user.warning_count || 0));
        localStorage.setItem("banReason", String(user.ban_reason || ""));

        if (extras.store && extras.store.id) {
            localStorage.setItem("storeId", String(extras.store.id));
            localStorage.setItem("storeName", String(extras.store.store_name || ""));
        } else if (user.role !== "owner") {
            localStorage.removeItem("storeId");
            localStorage.removeItem("storeName");
        }
    }

    function clearStoredSession() {
        SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
        localStorage.removeItem("selectedAddressId");
    }

    async function fetchSessionProfile(token) {
        if (!token) return null;

        try {
            const res = await fetch(`${API_BASE}/auth/me`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                return {
                    ok: false,
                    status: res.status,
                    data
                };
            }

            return {
                ok: true,
                status: res.status,
                data
            };
        } catch {
            return {
                ok: false,
                status: 0,
                data: { message: "Could not connect to the server" }
            };
        }
    }

    async function validateCurrentSession(options = {}) {
        const {
            expectedRole = "",
            afterLogin = "",
            redirectTo = "login.html",
            redirectOnFail = true
        } = options;

        const token = getToken();
        if (!token) {
            if (redirectOnFail) {
                if (afterLogin) localStorage.setItem("afterLogin", afterLogin);
                window.location.href = redirectTo;
            }
            return null;
        }

        const result = await fetchSessionProfile(token);
        if (!result?.ok || !result.data?.user) {
            clearStoredSession();
            if (redirectOnFail) {
                if (afterLogin) localStorage.setItem("afterLogin", afterLogin);
                window.location.href = redirectTo;
            }
            return null;
        }

        const session = result.data;
        saveSession(session.user, session);

        if (expectedRole && session.user.role !== expectedRole) {
            if (session.user.role === "owner") {
                window.location.href = "owner-dashboard.html";
            } else if (session.user.role === "admin") {
                window.location.href = "admin-dashboard.html";
            } else {
                window.location.href = "stores.html";
            }
            return null;
        }

        return session;
    }

    async function logoutUser(options = {}) {
        const { redirectTo = "login.html" } = options;
        const token = getToken();

        try {
            if (token) {
                await fetch(`${API_BASE}/auth/logout`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` }
                });
            }
        } catch {
            // Ignore logout request failures and clear local session anyway.
        }

        clearStoredSession();
        window.location.href = redirectTo;
    }

    function setDisplay(selector, visible) {
        document.querySelectorAll(selector).forEach((el) => {
            el.style.display = visible ? "" : "none";
        });
    }

    async function initNavigation() {
        setDisplay('[data-nav="addresses"]', false);
        setDisplay('[data-nav="customer-orders"]', false);
        setDisplay('[data-nav="owner-dashboard"]', false);
        setDisplay('[data-nav="admin-dashboard"]', false);
        setDisplay('[data-nav="logout"]', false);

        const token = getToken();
        let session = null;
        if (token) {
            session = await validateCurrentSession({ redirectOnFail: false });
        }

        const role = session?.user?.role || "";
        const isLoggedIn = !!session?.user;

        setDisplay('[data-nav="addresses"]', role === "customer");
        setDisplay('[data-nav="customer-orders"]', role === "customer");
        setDisplay('[data-nav="owner-dashboard"]', role === "owner");
        setDisplay('[data-nav="admin-dashboard"]', role === "admin");
        setDisplay('[data-nav="logout"]', isLoggedIn);

        document.querySelectorAll('[data-nav="logout"]').forEach((el) => {
            if (el.dataset.authBound === "true") return;
            el.dataset.authBound = "true";
            el.addEventListener("click", async (e) => {
                e.preventDefault();
                await logoutUser();
            });
        });

        const showLogin = !isLoggedIn;
        setDisplay('[data-nav="login"]', showLogin);
        document.querySelectorAll('a[href="login.html"]').forEach((el) => {
            if (!el.hasAttribute("data-nav")) {
                el.style.display = showLogin ? "" : "none";
            }
        });

        return session;
    }

    window.AppAuth = {
        API_BASE,
        getToken,
        saveSession,
        clearStoredSession,
        validateCurrentSession,
        initNavigation,
        logoutUser
    };
})();
