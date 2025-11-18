// main.js
document.addEventListener('DOMContentLoaded', () => {
    // Плавный скролл для ссылок
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            if (anchor.hasAttribute('data-category')) return;
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
});

// --- Модалка личного кабинета ---
document.addEventListener('DOMContentLoaded', () => {
    const userLink = document.querySelector('.user-profile-link');
    const accountModal = document.getElementById('accountModal');
    if (!accountModal || !userLink) return; // Защита от отсутствия элементов

    const closeModal = accountModal.querySelector('.close-modal');
    // Вкладки
    const tabOrders = document.getElementById('tabOrders');
    const tabHistory = document.getElementById('tabHistory');
    const paneOrders = document.getElementById('paneOrders');
    const paneHistory = document.getElementById('paneHistory');
    // Контейнеры
    const ordersContainer = document.getElementById('ordersContainer');
    const historyContainer = document.getElementById('historyContainer');
    // Кнопка выхода
    const logoutBtn = document.getElementById('logoutBtn');

    // --- Открытие модалки ---
    userLink.addEventListener('click', async (e) => {
        try {
            const res = await fetch('/api/me', { credentials: 'include' });
            if (!res.ok) {
                return window.location.href = '/auth';
            }
            const user = await res.json();
            if (user.isGuest) return window.location.href = '/auth';
            e.preventDefault();
            window.currentUser = user;
            const accName = document.getElementById("accName");
            const accEmail = document.getElementById("accEmail");
            if (accName) accName.textContent = user.FullName || "Пользователь";
            if (accEmail) accEmail.textContent = user.Email || "Гость";
            openAccountModal();
        } catch (err) {
            console.error(err);
            window.location.href = '/auth';
        }
    });

    function openAccountModal() {
    if (!window.currentUser) return;
    if (window.currentUser.userType === 'employee') {
        openAdminModal(); // Вызов админ формы из admin_main.js
    } else {
        accountModal.style.display = 'flex';
        activateTab('orders');
    }
}

    // --- Закрытие модалки ---
    if (closeModal) {
        closeModal.addEventListener('click', () => accountModal.style.display = 'none');
    }
    window.addEventListener('click', (e) => { 
        if (e.target === accountModal) accountModal.style.display = 'none'; 
    });

    // --- Переключение вкладок ---
    function activateTab(tab) {
        if (tab === 'orders') {
            if (tabOrders) tabOrders.classList.add('active');
            if (tabHistory) tabHistory.classList.remove('active');
            if (paneOrders) paneOrders.classList.add('active');
            if (paneHistory) paneHistory.classList.remove('active');
            if (paneOrders) paneOrders.hidden = false;
            if (paneHistory) paneHistory.hidden = true;
            loadOrders();
        } else {
            if (tabHistory) tabHistory.classList.add('active');
            if (tabOrders) tabOrders.classList.remove('active');
            if (paneHistory) paneHistory.classList.add('active');
            if (paneOrders) paneOrders.classList.remove('active');
            if (paneHistory) paneHistory.hidden = false;
            if (paneOrders) paneOrders.hidden = true;
            loadHistory();
        }
    }

    if (tabOrders) tabOrders.addEventListener('click', () => activateTab('orders'));
    if (tabHistory) tabHistory.addEventListener('click', () => activateTab('history'));

    // --- Загрузка текущих заказов (с улучшенным рендером товаров) ---
    async function loadOrders() {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = `<p class="muted">Загрузка текущих заказов...</p>`;
    try {
        const res = await fetch('/api/orders/current', { credentials: 'include' });
        if (res.status === 403) {
            showNotification('Доступ запрещен');
            accountModal.style.display = 'none';
            window.location.href = '/auth';
            return;
        }
        if (!res.ok) throw new Error('Ошибка загрузки текущих заказов');
        const orders = await res.json();
        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            ordersContainer.innerHTML = `<p class="muted">Текущих заказов нет</p>`;
            return;
        }
        ordersContainer.innerHTML = '';
        orders.forEach(o => {
            const div = document.createElement('div');
            div.className = 'order-card';
            const itemsHtml = o.Items && Array.isArray(o.Items) && o.Items.length > 0 
                ? o.Items.map(item => `<li>${item.Title || 'Без названия'} x${item.Quantity || 1} — ${(item.Price || 0) * (item.Quantity || 1)} BYN</li>`).join('')
                : '<li>Нет деталей товаров</li>';
            div.innerHTML = `
                <h4>Заказ #${o.OrderID || 'N/A'}</h4>
                <p><strong>Статус:</strong> ${o.Status || 'Неизвестно'}</p>
                <p><strong>Стоимость:</strong> ${o.TotalAmount || 0} BYN</p>
                <p><strong>Телефон:</strong> ${o.Phone || 'Не указан'}</p>
                <p><strong>Товары:</strong></p>
                <ul>${itemsHtml}</ul>
            `;
            ordersContainer.appendChild(div);
        });
        // Добавляем класс scrollable только при необходимости
        if (orders.length > 3) {
            ordersContainer.classList.add('scrollable');
        } else {
            ordersContainer.classList.remove('scrollable');
        }
    } catch (err) {
        ordersContainer.innerHTML = `<p class="muted">Ошибка загрузки текущих заказов</p>`;
    }
}

async function loadHistory() {
    if (!historyContainer) return;
    historyContainer.innerHTML = `<p class="muted">Загрузка истории заказов...</p>`;
    try {
        const res = await fetch('/api/orders/history', { credentials: 'include' });
        if (res.status === 403) {
            showNotification('Доступ запрещен');
            accountModal.style.display = 'none';
            window.location.href = '/auth';
            return;
        }
        if (!res.ok) throw new Error('Ошибка загрузки истории заказов');
        const history = await res.json();
        if (!history || !Array.isArray(history) || history.length === 0) {
            historyContainer.innerHTML = `<p class="muted">История заказов пуста</p>`;
            return;
        }
        historyContainer.innerHTML = '';
        history.forEach(o => {
            const div = document.createElement('div');
            div.className = 'order-card';
            div.setAttribute('data-order-id', o.OrderID);
            const itemsHtml = o.Items && Array.isArray(o.Items) && o.Items.length > 0 
                ? o.Items.map(item => `<li>${item.Title || 'Без названия'} x${item.Quantity || 1}</li>`).join('')
                : '<li>Нет деталей</li>';
            div.innerHTML = `
                <h4>Заказ #${o.OrderID || o.id || 'N/A'}</h4>
                <p><strong>Статус:</strong> ${o.Status || 'Неизвестно'}</p>
                <p><strong>Стоимость:</strong> ${o.TotalAmount || o.total || 0} BYN</p>
                <p><strong>Телефон:</strong> ${o.Phone || 'Не указан'}</p>
                <p><strong>Товары:</strong></p>
                <ul>${itemsHtml}</ul>
                <button class="delete-order-btn admin-btn" data-order-id="${o.OrderID}">Удалить заказ</button>
            `;
            historyContainer.appendChild(div);
        });
        
        // Добавляем обработчики для кнопок удаления
        historyContainer.querySelectorAll('.delete-order-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const orderId = btn.getAttribute('data-order-id');
                if (confirm('Вы уверены, что хотите удалить этот заказ?')) {
                    try {
                        const res = await fetch(`/api/orders/${orderId}`, {
                            method: 'DELETE',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        if (!res.ok) throw new Error('Ошибка удаления заказа');
                        showNotification('Заказ удалён');
                        btn.closest('.order-card').remove();
                    } catch (err) {
                        console.error(err);
                        showNotification('Ошибка удаления заказа');
                    }
                }
            });
        });
        
        // Добавляем класс scrollable только при необходимости
        if (history.length > 3) {
            historyContainer.classList.add('scrollable');
        } else {
            historyContainer.classList.remove('scrollable');
        }
    } catch (err) {
        historyContainer.innerHTML = `<p class="muted">Ошибка загрузки истории заказов</p>`;
    }
}

    // --- Выход ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (!res.ok) throw new Error('Ошибка выхода');
                window.currentUser = null;
                accountModal.style.display = 'none';
                window.location.href = '/';
            } catch (err) {
                console.error(err);
                showNotification('Ошибка выхода из аккаунта');  // Используем showNotification из bookstore.js, если доступно
            }
        });
    }
});

// Глобальная функция для уведомлений (если нет в bookstore.js)
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 100px; right: 20px;
        background: #4CAF50; color: white; padding: 1rem 2rem;
        border-radius: 5px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 2000; animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn { from {transform: translateX(100%); opacity: 0;} to {transform: translateX(0); opacity:1;} }
        @keyframes slideOut { from {transform: translateX(0); opacity:1;} to {transform: translateX(100%); opacity:0;} }
    `;
    if (!document.querySelector('style[data-notification]')) {
        style.setAttribute('data-notification', 'true');
        document.head.appendChild(style);
    }
}

function createOrderModal() {
    const modal = document.createElement('div');
    modal.id = 'orderModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content order-modal">
            <span class="close-modal">&times;</span>
            <h2>Оформление заказа</h2>
            <div class="order-info">
                <p><strong>Номер заказа:</strong> <span id="orderNumber">Автогенерация</span></p>
                <p><strong>Имя:</strong> <span id="orderName"></span></p>
            </div>
            <form id="orderForm">
                <div class="form-group">
                    <label>Номер телефона:</label>
                    <input type="tel" id="orderPhone" required>
                </div>
                <div class="form-group">
                    <label>Адрес доставки:</label>
                    <textarea id="orderAddress" required></textarea>
                </div>
                <div class="form-group">
                    <label>Способ доставки:</label>
                    <div class="delivery-options">
                        <label><input type="radio" name="delivery" value="pickup" checked> Самовывоз (бесплатно)</label>
                        <label><input type="radio" name="delivery" value="3km"> В пределах 3 км (+5 BYN)</label>
                        <label><input type="radio" name="delivery" value="5km"> В пределах 5 км (+10 BYN)</label>
                        <label><input type="radio" name="delivery" value="over5km"> Более 5 км (+20 BYN)</label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Оплата картой:</label>
                    <select id="orderCard" required>
                        <option value="">Выберите карту</option>
                    </select>
                    <button type="button" id="addNewCardBtn">Добавить новую карту</button>
                </div>
                <div id="newCardFields" style="display:none;">
                    <div class="form-group">
                        <label>Номер карты:</label>
                        <input type="text" id="newCardNumber" placeholder="1234 5678 9012 3456" required>
                    </div>
                    <div class="form-group">
                        <label>Срок действия (MM/YY):</label>
                        <input type="text" id="newCardExpiry" placeholder="12/25" required>
                    </div>
                    <div class="form-group">
                        <label>CVV:</label>
                        <input type="text" id="newCardCVV" placeholder="123" required>
                    </div>
                </div>
                <div class="order-total">
                    <p>Сумма товаров: <span id="cartTotalAmount">0 BYN</span></p>
                    <p>Доставка: <span id="deliveryFee">0 BYN</span></p>
                    <p><strong>Итого: <span id="finalTotal">0 BYN</span></strong></p>
                </div>
                <button type="submit" class="submit-order-btn">Оформить заказ</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Обработчики в JS вместо inline
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn.addEventListener('click', closeOrderModal);
    
    const form = document.getElementById('orderForm');
    form.addEventListener('submit', submitOrder);
    
    const deliveryRadios = modal.querySelectorAll('input[name="delivery"]');
    deliveryRadios.forEach(radio => {
        radio.addEventListener('change', calculateTotal);
    });
    
    const addCardBtn = document.getElementById('addNewCardBtn');
    addCardBtn.addEventListener('click', addNewCard);
    
    modal.addEventListener('click', e => {
        if (e.target === modal) closeOrderModal();
    });
}

function addNewCard() {
    document.getElementById('newCardFields').style.display = 'block';
}

function closeOrderModal() {
    const modal = document.getElementById('orderModal');
    if (modal) modal.style.display = 'none';
}