// admin_main.js
document.addEventListener('DOMContentLoaded', () => {
    const adminModal = document.getElementById('adminModal');
    if (!adminModal) return;

    const closeModal = adminModal.querySelector('.close-modal');
    const logoutBtn = document.getElementById('adminLogoutBtn');
    const issueModeBtn = document.getElementById('issueModeBtn');
    const deliveryModeBtn = document.getElementById('deliveryModeBtn');
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    const analyticsBtn = document.getElementById('analyticsBtn');

    // --- Открытие модалки админа ---
    window.openAdminModal = async function() {
        try {
            const res = await fetch('/api/me', { credentials: 'include' });
            if (!res.ok) {
                return window.location.href = '/auth';
            }
            const user = await res.json();
            if (user.userType !== 'employee') {
                return; // Не открываем для не-сотрудников
            }
            const adminName = document.getElementById("adminName");
            const adminEmail = document.getElementById("adminEmail");
            if (adminName) adminName.textContent = user.FullName || "Сотрудник";
            if (adminEmail) adminEmail.textContent = user.Email || "";
            adminModal.style.display = 'flex';
        } catch (err) {
            console.error(err);
            window.location.href = '/auth';
        }
    };

    // --- Закрытие модалки ---
    if (closeModal) {
        closeModal.addEventListener('click', () => adminModal.style.display = 'none');
    }
    window.addEventListener('click', (e) => {
        if (e.target === adminModal) adminModal.style.display = 'none';
    });

    // --- Кнопка аналитики (в админ-модалке) ---
    if (analyticsBtn) {
        analyticsBtn.addEventListener('click', openAnalyticsModal);
    }

    // --- Кнопки (пока заглушки, кроме выхода) ---
    if (issueModeBtn) {
        issueModeBtn.addEventListener('click', () => {
            const issueModal = document.getElementById('issueModeModal');
            if (issueModal) issueModal.style.display = 'flex';

            const closeModal = issueModal.querySelector('.close-modal');
            if (closeModal) {
                closeModal.addEventListener('click', () => issueModal.style.display = 'none');
            }

            const searchBtn = document.getElementById('issueSearchBtn');
            const phoneInput = document.getElementById('issuePhoneInput');
            const ordersContainer = document.getElementById('issueOrdersContainer');

            if (searchBtn && phoneInput && ordersContainer) {
                searchBtn.addEventListener('click', async () => {
                    const phone = phoneInput.value.trim();
                    if (!phone) {
                        showNotification('Введите номер телефона');
                        return;
                    }

                    ordersContainer.innerHTML = '<p class="muted">Загрузка...</p>';
                    try {
                        const res = await fetch(`/api/admin/orders?phone=${encodeURIComponent(phone)}`, { credentials: 'include' });
                        if (!res.ok) {
                            const error = await res.json();
                            if (res.status === 404) {
                                ordersContainer.innerHTML = '<p class="muted">Заказы не найдены</p>';
                                return;
                            }
                            throw new Error(error.error || 'Заказы не найдены');
                        }
                        const orders = await res.json();

                        if (!orders.length) {
                            ordersContainer.innerHTML = '<p class="muted">Заказы не найдены</p>';
                            return;
                        }

                        ordersContainer.innerHTML = '';
                        orders.forEach(order => {
                            const div = document.createElement('div');
                            div.className = 'order-card';
                            const itemsHtml = order.Items.map(item => `<li>${item.Title} x${item.Quantity}</li>`).join('');
                            div.innerHTML = `
                                <h4>Заказ #${order.OrderID}</h4>
                                <p><strong>Имя:</strong> ${order.ClientName}</p>
                                <p><strong>Телефон:</strong> ${order.Phone}</p>
                                <p><strong>Книги:</strong></p>
                                <ul>${itemsHtml}</ul>
                                <button class="issue-complete-btn admin-btn" data-order-id="${order.OrderID}">Заказ выдан</button>
                            `;
                            ordersContainer.appendChild(div);
                        });

                        ordersContainer.querySelectorAll('.issue-complete-btn').forEach(btn => {
                            btn.addEventListener('click', async () => {
                                const orderId = btn.getAttribute('data-order-id');
                                try {
                                    const res = await fetch(`/api/admin/orders/${orderId}/complete`, {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' }
                                    });
                                    if (!res.ok) throw new Error('Ошибка завершения заказа');
                                    showNotification('Заказ завершён');
                                    btn.closest('.order-card').remove();
                                } catch (err) {
                                    showNotification('Ошибка завершения заказа');
                                }
                            });
                        });
                    } catch (err) {
                        ordersContainer.innerHTML = '<p class="muted">Заказы не найдены</p>';
                    }
                });
            }
        });
    }
    if (deliveryModeBtn) {
        deliveryModeBtn.addEventListener('click', () => {
            console.log('🔍 [DEBUG] Нажата кнопка "Режим доставки"');
            const deliveryModal = document.getElementById('deliveryModeModal');
            if (deliveryModal) deliveryModal.style.display = 'flex';

            const closeModal = deliveryModal.querySelector('.close-modal');
            if (closeModal) {
                closeModal.addEventListener('click', () => {
                    console.log('🔍 [DEBUG] Закрытие модального окна "Режим доставки" сработало');
                    deliveryModal.style.display = 'none';
                });
            }

            const ordersContainer = document.getElementById('deliveryOrdersContainer');
            if (ordersContainer) {
                ordersContainer.innerHTML = '<p class="muted">Загрузка...</p>';
                console.log('📥 [DEBUG] Отправка запроса на сервер для получения заказов');
                fetch('/api/admin/orders?status=Оплачен, ожидается доставка', { credentials: 'include' })
                    .then(res => {
                        console.log(`📤 [DEBUG] Ответ сервера: статус ${res.status}`);
                        return res.json();
                    })
                    .then(orders => {
                        if (!orders || !Array.isArray(orders)) {
                            console.log('⚠️ [DEBUG] Некорректный ответ от сервера');
                            ordersContainer.innerHTML = '<p class="muted">Заказы не найдены</p>';
                            return;
                        }
                        console.log(`✅ [DEBUG] Получено заказов: ${orders.length}`);
                        if (orders.length === 0) {
                            ordersContainer.innerHTML = '<p class="muted">Заказы не найдены</p>';
                            return;
                        }
                        ordersContainer.innerHTML = '';
                        orders.forEach(order => {
                            const div = document.createElement('div');
                            div.className = 'order-card';
                            const itemsHtml = order.Items.map(item => `<li>${item.Title} x${item.Quantity}</li>`).join('');
                            const orderDate = order.OrderDate.split('T')[0]; // Убираем время из даты
                            div.innerHTML = `
                                <h4>Заказ #${order.OrderID}</h4>
                                <p><strong>Телефон:</strong> ${order.Phone}</p>
                                <p><strong>Дата заказа:</strong> ${orderDate}</p>
                                <p><strong>Адрес:</strong> ${order.DeliveryAddress}</p>
                                <p><strong>Метод доставки:</strong> ${order.DeliveryMethod}</p>
                                <p><strong>Книги:</strong></p>
                                <ul>${itemsHtml}</ul>
                                <button class="ready-delivery-btn admin-btn" data-order-id="${order.OrderID}" data-items='${JSON.stringify(order.Items)}'>✅ Готов к доставке</button>
                            `;
                            ordersContainer.appendChild(div);
                        });

                        // НОВОЕ: обработчик кнопки "Готов к доставке"
                        ordersContainer.querySelectorAll('.ready-delivery-btn').forEach(btn => {
                            btn.addEventListener('click', async (e) => {
                                e.preventDefault();
                                const orderId = btn.getAttribute('data-order-id');
                                const items = JSON.parse(btn.getAttribute('data-items'));
                                
                                try {
                                    console.log(`📧 [DEBUG] Отправляю email для заказа #${orderId}`);
                                    
                                    const res = await fetch('/api/admin/orders/send-delivery-email', {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ orderId, items })
                                    });

                                    if (!res.ok) {
                                        const error = await res.json();
                                        throw new Error(error.error || 'Ошибка отправки email');
                                    }

                                    showNotification('✅ Email отправлен клиенту');
                                    console.log(`✅ [DEBUG] Email успешно отправлен`);
                                } catch (err) {
                                    console.error('❌ [DEBUG] Ошибка отправки email:', err);
                                    showNotification(`❌ Ошибка: ${err.message}`);
                                }
                            });
                        });
                    })
                    .catch(err => {
                        console.error('❌ [DEBUG] Ошибка загрузки заказов:', err);
                        ordersContainer.innerHTML = '<p class="muted">Заказы не найдены</p>';
                    });
            }
        });
    }
    if (adminPanelBtn) {
        adminPanelBtn.addEventListener('click', () => {
            openAdminPanel();
        });
    }

    // --- Выход ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
                if (!res.ok) throw new Error('Ошибка выхода');
                window.currentUser = null;
                adminModal.style.display = 'none';
                window.location.href = '/';
            } catch (err) {
                console.error(err);
                showNotification('Ошибка выхода из аккаунта');
            }
        });
    }
});

// Глобальная функция для уведомлений (если нужно)
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

function openMapModal(order) {
    if (typeof ymaps === 'undefined') {
        console.error('❌ [DEBUG] Yandex.Maps не подключен');
        showNotification('Ошибка: Карта недоступна. Проверьте настройки API-ключа.');
        return;
    }

    const mapModal = document.getElementById('mapModal');
    if (!mapModal) return;

    const closeModal = mapModal.querySelector('.close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', () => mapModal.style.display = 'none');
    }

    const mapContainer = document.getElementById('mapContainer');
    const completeBtn = document.getElementById('completeDeliveryBtn');

    if (mapContainer) {
        mapContainer.innerHTML = `<p class="muted">Загрузка карты...</p>`;
        ymaps.ready(() => {
            try {
                const map = new ymaps.Map(mapContainer, {
                    center: [55.751574, 37.573856], // Москва, центр
                    zoom: 10,
                });

                // Выполняем поиск адреса через геокодер
                if (order.DeliveryAddress) {
                    console.log('🔍 [DEBUG] Геокодирование адреса:', order.DeliveryAddress);
                    ymaps.geocode(order.DeliveryAddress).then(
                        (res) => {
                            const firstGeoObject = res.geoObjects.get(0);
                            if (firstGeoObject) {
                                const coords = firstGeoObject.geometry.getCoordinates();
                                console.log('✅ [DEBUG] Координаты адреса:', coords);
                                map.setCenter(coords, 15); // Центрируем карту на найденный адрес
                                map.geoObjects.add(firstGeoObject); // Добавляем метку на карту
                            } else {
                                console.warn('⚠️ [DEBUG] Адрес не найден');
                                showNotification('Адрес не найден. Проверьте корректность данных.');
                            }
                        },
                        (err) => {
                            console.error('❌ [DEBUG] Ошибка геокодирования:', err);
                            showNotification('Ошибка поиска адреса. Проверьте корректность данных.');
                        }
                    );
                } else {
                    console.warn('⚠️ [DEBUG] Адрес доставки отсутствует');
                    showNotification('Адрес доставки отсутствует.');
                }
            } catch (err) {
                console.error('❌ [DEBUG] Ошибка инициализации карты:', err);
                showNotification('Ошибка инициализации карты.');
            }
        });
    }

    if (completeBtn) {
        // Удаляем старый обработчик события если был
        completeBtn.onclick = async () => {
            try {
                const res = await fetch(`/api/admin/orders/${order.OrderID}/complete`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                });
                
                if (!res.ok) throw new Error('Ошибка завершения доставки');
                
                console.log('✅ [DEBUG] Заказ доставлен, удаляю из контейнера');
                showNotification('Заказ доставлен');
                
                // Закрываем модалку
                mapModal.style.display = 'none';

                // ГЛАВНОЕ: сразу ищем и удаляем карточку заказа из контейнера
                const ordersContainer = document.getElementById('deliveryOrdersContainer');
                if (ordersContainer) {
                    // Ищем все карточки с этим заказом
                    const orderCards = ordersContainer.querySelectorAll('.order-card');
                    orderCards.forEach(card => {
                        // Проверяем, содержит ли карточка номер этого заказа
                        if (card.innerHTML.includes(`Заказ #${order.OrderID}`)) {
                            console.log(`🗑️ [DEBUG] Удаляю карточку заказа #${order.OrderID}`);
                            card.remove();
                        }
                    });
                }
            } catch (err) {
                console.error(err);
                showNotification('Ошибка завершения доставки');
            }
        };
    }

    mapModal.style.display = 'flex';
}

function openAdminPanel() {
    const adminPanelModal = document.getElementById('adminPanelModal');
    if (!adminPanelModal) {
        console.error('❌ [DEBUG] adminPanelModal не найден');
        return;
    }
    
    adminPanelModal.style.display = 'flex';
    
    const closeModal = adminPanelModal.querySelector('.close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            adminPanelModal.style.display = 'none';
        });
    }
    
    // Обработка кнопки аналитики
    const analyticsBtn = document.getElementById('analyticsBtn');
    if (analyticsBtn) {
        analyticsBtn.addEventListener('click', openAnalyticsModal);
    }
}

async function openAnalyticsModal() {
    console.log('📊 [DEBUG] Открываю модалку аналитики...');
    
    // Создаём модалку если нет
    if (!document.getElementById('analyticsModal')) {
        createAnalyticsModal();
    }
    
    const modal = document.getElementById('analyticsModal');
    modal.style.display = 'flex';
    
    // Загружаем аналитику
    await loadAnalytics();
}

function createAnalyticsModal() {
    const modal = document.createElement('div');
    modal.id = 'analyticsModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content analytics-modal glass">
            <span class="close-modal">&times;</span>
            <h2>📊 Аналитика</h2>
            
            <div class="analytics-period-tabs">
                <button class="period-tab-btn active" data-period="day">📅 День</button>
                <button class="period-tab-btn" data-period="week">📆 Неделя</button>
                <button class="period-tab-btn" data-period="month">📈 Месяц</button>
                <button class="period-tab-btn" data-period="year">📊 Год</button>
            </div>
            
            <div class="analytics-content">
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <div class="analytics-card-icon">📚</div>
                        <div class="analytics-card-info">
                            <p class="analytics-label">Продано книг</p>
                            <p class="analytics-value" id="analytics-books">0</p>
                        </div>
                    </div>
                    
                    <div class="analytics-card">
                        <div class="analytics-card-icon">👥</div>
                        <div class="analytics-card-info">
                            <p class="analytics-label">Новых клиентов</p>
                            <p class="analytics-value" id="analytics-clients">0</p>
                        </div>
                    </div>
                    
                    <div class="analytics-card">
                        <div class="analytics-card-icon">💰</div>
                        <div class="analytics-card-info">
                            <p class="analytics-label">Прибыль</p>
                            <p class="analytics-value" id="analytics-revenue">0 BYN</p>
                        </div>
                    </div>
                    
                    <div class="analytics-card">
                        <div class="analytics-card-icon">📦</div>
                        <div class="analytics-card-info">
                            <p class="analytics-label">Завершённо заказов</p>
                            <p class="analytics-value" id="analytics-orders">0</p>
                        </div>
                    </div>
                    
                    <div class="analytics-card">
                        <div class="analytics-card-icon">⭐</div>
                        <div class="analytics-card-info">
                            <p class="analytics-label">Популярная книга</p>
                            <p class="analytics-value-text" id="analytics-popular">-</p>
                        </div>
                    </div>
                    
                    <div class="analytics-card">
                        <div class="analytics-card-icon">🎯</div>
                        <div class="analytics-card-info">
                            <p class="analytics-label">Средний чек</p>
                            <p class="analytics-value" id="analytics-avg-check">0 BYN</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="analytics-actions">
                <button id="downloadAnalyticsBtn" class="btn-download-analytics">
                    📥 Скачать отчёт (DOCX)
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Обработчики
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // Переключение периодов
    const periodBtns = modal.querySelectorAll('.period-tab-btn');
    periodBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            periodBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            await loadAnalytics();
        });
    });
    
    // Скачивание отчёта
    const downloadBtn = document.getElementById('downloadAnalyticsBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadAnalyticsReport);
    }
    
    // Закрытие кликом на фон
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

async function loadAnalytics() {
    const activePeriod = document.querySelector('.period-tab-btn.active')?.dataset.period || 'day';
    console.log(`� [DEBUG] Загружаю аналитику за ${activePeriod}...`);
    
    try {
        const res = await fetch(`/api/admin/analytics?period=${activePeriod}`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            throw new Error('Ошибка загрузки аналитики');
        }
        
        const data = await res.json();
        console.log('📊 [DEBUG] Аналитика:', data);
        
        // Обновляем данные в модалке
        document.getElementById('analytics-books').textContent = data.booksSold || '0';
        document.getElementById('analytics-clients').textContent = data.newClients || '0';
        document.getElementById('analytics-revenue').textContent = `${data.revenue || 0} BYN`;
        document.getElementById('analytics-orders').textContent = data.completedOrders || '0';
        document.getElementById('analytics-popular').textContent = data.popularBook || '-';
        document.getElementById('analytics-avg-check').textContent = `${data.avgCheck || 0} BYN`;
        
        // Сохраняем данные для скачивания
        window.currentAnalytics = data;
        window.currentPeriod = activePeriod;
        
    } catch (err) {
        console.error('❌ [DEBUG] Ошибка загрузки аналитики:', err);
        showNotification('Ошибка загрузки аналитики');
    }
}

async function downloadAnalyticsReport() {
    if (!window.currentAnalytics) {
        showNotification('Данные аналитики не загружены');
        return;
    }
    
    try {
        const res = await fetch('/api/admin/analytics/download', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                period: window.currentPeriod,
                data: window.currentAnalytics
            })
        });
        
        if (!res.ok) {
            throw new Error('Ошибка скачивания отчёта');
        }
        
        // Скачиваем файл
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${window.currentPeriod}_${new Date().toISOString().split('T')[0]}.docx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('✅ Отчёт скачан успешно!');
        
    } catch (err) {
        console.error('❌ Ошибка скачивания:', err);
        showNotification('Ошибка скачивания отчёта');
    }
}