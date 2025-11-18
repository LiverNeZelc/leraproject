// admin_main.js
document.addEventListener('DOMContentLoaded', () => {
    const adminModal = document.getElementById('adminModal');
    if (!adminModal) return;

    const closeModal = adminModal.querySelector('.close-modal');
    const logoutBtn = document.getElementById('adminLogoutBtn');
    const issueModeBtn = document.getElementById('issueModeBtn');
    const deliveryModeBtn = document.getElementById('deliveryModeBtn');
    const adminPanelBtn = document.getElementById('adminPanelBtn');

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
                            `;
                            div.addEventListener('click', () => openMapModal(order));
                            ordersContainer.appendChild(div);
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
    
    // Закрытие при клике на фон
    window.addEventListener('click', (e) => {
        if (e.target === adminPanelModal) {
            adminPanelModal.style.display = 'none';
        }
    });
    
    const addBookForm = document.getElementById('addBookForm');
    if (addBookForm) {
        addBookForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const titleVal = document.getElementById('bookTitle').value.trim();
            const authorVal = document.getElementById('bookAuthor').value.trim();
            const publisherVal = document.getElementById('bookPublisher').value.trim();
            const genreVal = document.getElementById('bookGenre').value.trim();
            const yearVal = document.getElementById('bookYear').value;
            const pagesVal = document.getElementById('bookPages').value;
            const ratingVal = document.getElementById('bookRating').value;
            const descriptionVal = document.getElementById('bookDescription').value.trim();
            const priceVal = document.getElementById('bookPrice').value;
            
            // Валидация
            if (!titleVal || !priceVal) {
                showNotification('⚠️ Пожалуйста, заполните название и цену');
                return;
            }
            
            const formData = {
                title: titleVal,
                author: authorVal || null,
                publisher: publisherVal || null,
                genre: genreVal || null,
                year: yearVal ? parseInt(yearVal) : null,
                pages: pagesVal ? parseInt(pagesVal) : null,
                rating: ratingVal ? parseFloat(ratingVal) : 0,
                description: descriptionVal || null,
                price: parseFloat(priceVal)
            };
            
            console.log('📤 [DEBUG] Отправляю данные:', formData);
            
            try {
                const res = await fetch('/api/admin/books/add', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || 'Ошибка добавления книги');
                }
                
                const result = await res.json();
                showNotification('✅ Книга успешно добавлена!');
                console.log('📚 [DEBUG] Добавлена книга с ID:', result.bookId);
                addBookForm.reset();
                document.getElementById('bookYear').value = '';
                document.getElementById('bookPages').value = '';
                document.getElementById('bookRating').value = '';
                document.getElementById('bookGenre').value = '';
            } catch (err) {
                console.error('❌ Ошибка:', err);
                showNotification(`❌ ${err.message}`);
            }
        });
        
        // Обработка загрузки JSON файла
        const jsonFileInput = document.getElementById('jsonFileInput');
        if (jsonFileInput) {
            jsonFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    // Проверка авторизации перед загрузкой
                    const meRes = await fetch('/api/me', { credentials: 'include' });
                    const meData = await meRes.json();
                    
                    if (!meRes.ok || meData.userType !== 'employee') {
                        showNotification('❌ Только сотрудники могут загружать книги');
                        console.error('❌ Пользователь не является сотрудником:', meData);
                        return;
                    }
                    
                    console.log('✅ Авторизация успешна, пользователь:', meData.FullName);
                    
                    const text = await file.text();
                    const books = JSON.parse(text);
                    
                    // Проверка структуры
                    if (!Array.isArray(books)) {
                        showNotification('❌ JSON должен быть массивом книг');
                        return;
                    }
                    
                    console.log(`📥 Начинаю загрузку ${books.length} книг...`);
                    
                    let successCount = 0;
                    let errorCount = 0;
                    
                    // Загружаем каждую книгу
                    for (let i = 0; i < books.length; i++) {
                        const book = books[i];
                        try {
                            const formData = {
                                title: book.title || book.Title,
                                author: book.author || book.Author || null,
                                publisher: book.publisher || book.Publisher || null,
                                genre: book.genre || book.Genre || null,
                                year: book.year || book.Year ? parseInt(book.year || book.Year) : null,
                                pages: book.pages || book.Pages ? parseInt(book.pages || book.Pages) : null,
                                rating: book.rating || book.Rating ? parseFloat(book.rating || book.Rating) : 0,
                                description: book.description || book.Description || null,
                                price: parseFloat(book.price || book.Price)
                            };
                            
                            if (!formData.title || !formData.price) {
                                console.warn(`⚠️ Книга ${i + 1} пропущена (нет названия или цены)`);
                                errorCount++;
                                continue;
                            }
                            
                            console.log(`📤 Загружаю книгу ${i + 1}/${books.length}: ${formData.title}`);
                            
                            const res = await fetch('/api/admin/books/add', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(formData)
                            });
                            
                            if (res.ok) {
                                const result = await res.json();
                                console.log(`✅ Книга добавлена с ID: ${result.bookId}`);
                                successCount++;
                            } else {
                                const error = await res.json();
                                console.error(`❌ Ошибка загрузки книги ${i + 1}:`, error);
                                errorCount++;
                            }
                        } catch (err) {
                            console.error(`❌ Ошибка обработки книги ${i + 1}:`, err);
                            errorCount++;
                        }
                        
                        // Небольшая задержка между запросами
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    showNotification(`✅ Загружено: ${successCount} книг, ошибок: ${errorCount}`);
                    console.log(`📊 Итоговая статистика: успехов ${successCount}, ошибок ${errorCount}`);
                    jsonFileInput.value = ''; // Очищаем input
                } catch (err) {
                    console.error('❌ Ошибка парсинга JSON:', err);
                    showNotification('❌ Ошибка парсинга JSON файла: ' + err.message);
                }
            });
        }
        
        // Обработка удаления книги
        const deleteBookBtn = document.getElementById('deleteBookBtn');
        if (deleteBookBtn) {
            deleteBookBtn.addEventListener('click', openDeleteBookModal);
        }
    }
}

function openDeleteBookModal() {
    // Создаём модалку если нет
    if (!document.getElementById('deleteBookModal')) {
        createDeleteBookModal();
    }
    const modal = document.getElementById('deleteBookModal');
    modal.style.display = 'flex';
    // Очищаем поле ввода
    document.getElementById('deleteBookTitle').value = '';
    document.getElementById('deleteBookTitle').focus();
}

function createDeleteBookModal() {
    const modal = document.createElement('div');
    modal.id = 'deleteBookModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content delete-modal">
            <span class="close-modal">&times;</span>
            <h2>🗑️ Удалить книгу</h2>
            
            <div class="warning">
                ⚠️ <strong>Внимание!</strong> Эта операция удалит книгу из базы данных. Все связанные данные (заказы, корзина) будут сохранены.
            </div>
            
            <div class="form-group">
                <label for="deleteBookTitle">Введите название книги для удаления:</label>
                <input 
                    type="text" 
                    id="deleteBookTitle" 
                    placeholder="Например: Война и мир"
                >
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-confirm" id="confirmDeleteBtn">
                    ✓ Удалить
                </button>
                <button type="button" class="btn-cancel" id="cancelDeleteBtn">
                    ✕ Отмена
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Обработчики в JS вместо inline
    modal.querySelector('.close-modal').addEventListener('click', closeDeleteBookModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDeleteBook);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteBookModal);
    document.getElementById('deleteBookTitle').addEventListener('keypress', e => {
        if (e.key === 'Enter') confirmDeleteBook();
    });
    
    modal.addEventListener('click', e => {
        if (e.target === modal) closeDeleteBookModal();
    });
}

async function confirmDeleteBook() {
    const bookTitle = document.getElementById('deleteBookTitle').value.trim();
    
    if (!bookTitle) {
        showNotification('⚠️ Пожалуйста, введите название книги');
        return;
    }
    
    if (!confirm(`Вы уверены? Это удалит книгу "${bookTitle}" из базы данных.`)) {
        return;
    }
    
    try {
        console.log(`📤 Отправляю запрос на удаление книги: ${bookTitle}`);
        
        const res = await fetch(`/api/admin/books/delete-by-title`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: bookTitle })
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            throw new Error(result.error || 'Ошибка удаления книги');
        }
        
        showNotification(`✅ ${result.message}`);
        console.log('📚 [DEBUG] Книга удалена:', result.bookTitle);
        closeDeleteBookModal();
    } catch (err) {
        console.error('❌ Ошибка:', err);
        showNotification(`❌ ${err.message}`);
    }
}

function closeDeleteBookModal() {
    const modal = document.getElementById('deleteBookModal');
    if (modal) modal.style.display = 'none';
}