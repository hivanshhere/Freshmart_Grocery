(function () {
    try {
        const role = localStorage.getItem("userRole");
        const token = localStorage.getItem("authToken");
        const showAddresses = role === "customer" && !!token;

        const isLoggedIn = !!token;

        document.querySelectorAll('[data-nav="addresses"]').forEach((el) => {
            el.style.display = showAddresses ? "inline-block" : "none";
        });

        // Hide Login link once authenticated
        document.querySelectorAll('a[href="login.html"]').forEach((el) => {
            el.style.display = isLoggedIn ? "none" : "inline-block";
        });
    } catch {
        // ignore
    }
})();
