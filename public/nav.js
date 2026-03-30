(function () {
    try {
        const role = localStorage.getItem("userRole");
        const token = localStorage.getItem("authToken");
        const showAddresses = role === "customer" && !!token;

        document.querySelectorAll('[data-nav="addresses"]').forEach((el) => {
            el.style.display = showAddresses ? "inline-block" : "none";
        });
    } catch {
        // ignore
    }
})();
