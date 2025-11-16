document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const formTitle = document.getElementById("formTitle");

    const toggleForm = (showRegister) => {
        if (showRegister) {
            loginForm.classList.remove("active");
            registerForm.classList.add("active");
            formTitle.textContent = "Регистрация";
        } else {
            registerForm.classList.remove("active");
            loginForm.classList.add("active");
            formTitle.textContent = "Вход";
        }
        formTitle.style.opacity = '0';
        setTimeout(() => formTitle.style.opacity = '1', 150);
    };

    document.getElementById("goRegister").addEventListener("click", () => toggleForm(true));
    document.getElementById("goLogin").addEventListener("click", () => toggleForm(false));

    // --- Логин ---
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = "/account_main"; // редирект после входа
            } else alert(data.error);
        } catch (err) {
            console.error(err);
            alert("Ошибка соединения с сервером");
        }
    });

    // --- Регистрация ---
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = registerForm.name.value;
        const email = registerForm.email.value;
        const password = registerForm.password.value;
        const password2 = registerForm.password2.value;

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password, password2 })
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = "/account_main"; // редирект после регистрации
            } else alert(data.error);
        } catch (err) {
            console.error(err);
            alert("Ошибка соединения с сервером");
        }
    });
});
