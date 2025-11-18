let cart = [];

// ------------------------------
// Глобальные фильтры
// ------------------------------
const currentFilters = {
    category: 'all',
    minPrice: null,
    maxPrice: null,
    sort: null,
    q: ''
};

// ------------------------------
// Инициализация
// ------------------------------
document.addEventListener('DOMContentLoaded', () => {
    applyFilters(); // Загрузка книг с текущими фильтрами
    updateCartCount();
    setupEventListeners();
    setupAdminPanelEventListeners();
});

// ------------------------------
// API функции (с обработкой ошибок)
// ------------------------------
async function loadBooksFromServer(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/books?${query}`, { credentials: 'include' });
    if (!res.ok) {
        console.error('Ошибка загрузки книг:', res.status);
        showNotification('Ошибка загрузки каталога');
        return;
    }
    const books = await res.json();
    displayBooks(books);
}

async function fetchCart(silent = false) {
    const res = await fetch('/api/cart', { credentials: 'include' });
    if (res.status === 403) {
        if (!silent) alert('Перейдите на аккаунт покупателя');
        return [];
    }
    if (!res.ok) {
        if (!silent) console.error('Ошибка загрузки корзины:', res.status);
        return [];
    }
    const data = await res.json();
    cart = Array.isArray(data) ? data : [];
    return cart;
}

async function updateCartCount() {
    try {
        await fetchCart(true);
        const cartCount = document.querySelector('.cart-count');
        if (cartCount) {
            const totalItems = cart.reduce((sum, item) => sum + (item.Quantity || 0), 0);
            cartCount.textContent = totalItems;
        }
    } catch (err) {
        console.error('Ошибка обновления корзины:', err);
    }
}

async function addToCart(bookId) {
    const res = await fetch('/api/cart', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId })
    });
    if (res.status === 403) {
        alert('Перейдите на аккаунт покупателя');
        return;
    }
    if (!res.ok) {
        showNotification('Ошибка добавления в корзину');
        return;
    }
    await updateCartCount();
    showNotification('Книга добавлена в корзину!');
}

async function removeFromCart(bookId) {
    const res = await fetch(`/api/cart/${bookId}`, { method: 'DELETE', credentials: 'include' });
    if (res.status === 403) {
        alert('Перейдите на аккаунт покупателя');
        return;
    }
    if (!res.ok) {
        showNotification('Ошибка удаления из корзины');
        return;
    }
    await displayCartItems();
    await updateCartCount();
}

// ------------------------------
// Модалка заказа
// ------------------------------
let newCardFormVisible = false;

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
                    <label>Способ доставки:</label>
                    <div class="delivery-options">
                        <label><input type="radio" name="delivery" value="pickup" checked> Самовывоз (бесплатно)</label>
                        <label><input type="radio" name="delivery" value="3km"> В пределах 3 км (+5 BYN)</label>
                        <label><input type="radio" name="delivery" value="5km"> В пределах 5 км (+10 BYN)</label>
                        <label><input type="radio" name="delivery" value="over5km"> Более 5 км (+20 BYN)</label>
                    </div>
                </div>
                <div class="form-group" id="addressGroup" style="display: none;">
                    <label>Адрес доставки:</label>
                    <textarea id="orderAddress"></textarea>
                </div>
                <div class="form-group">
                    <label>Оплата картой:</label>
                    <select id="orderCard" required>
                        <option value="">Выберите карту</option>
                    </select>
                </div>
                <div id="balanceWarning" style="display: none; color: #f44336; font-size: 0.9rem; margin-top: 0.5rem;"></div>
                <div class="order-total">
                    <p>Сумма товаров: <span id="cartTotalAmount">0 BYN</span></p>
                    <p>Доставка: <span id="deliveryFee">0 BYN</span></p>
                    <p><strong>Итого: <span id="finalTotal">0 BYN</span></strong></p>
                </div>
                <button type="submit" id="submitOrderBtn" class="submit-order-btn">Оформить заказ</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn.addEventListener('click', closeOrderModal);
    
    const form = document.getElementById('orderForm');
    form.addEventListener('submit', submitOrder);
    
    const deliveryRadios = modal.querySelectorAll('input[name="delivery"]');
    deliveryRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            toggleAddressField(e.target.value);
            calculateTotal();
        });
    });
    
    modal.addEventListener('click', e => {
        if (e.target === modal) closeOrderModal();
    });
}

function toggleAddressField(deliveryType) {
    const addressGroup = document.getElementById('addressGroup');
    const addressInput = document.getElementById('orderAddress');
    
    if (deliveryType === 'pickup') {
        addressGroup.style.display = 'none';
        addressInput.removeAttribute('required');
        addressInput.value = '';
    } else {
        addressGroup.style.display = 'block';
        addressInput.setAttribute('required', 'required');
    }
}

function attachOrderEvents() {
    const deliveryRadios = document.querySelectorAll('input[name="delivery"]');
    deliveryRadios.forEach(radio => {
        radio.removeEventListener('change', calculateTotal);
        radio.addEventListener('change', calculateTotal);
    });
    
    const orderCardSelect = document.getElementById('orderCard');
    if (orderCardSelect) {
        orderCardSelect.removeEventListener('change', checkBalance);
        orderCardSelect.addEventListener('change', checkBalance);
    }
}

// ------------------------------
// Checkout логика
// ------------------------------
async function handleCheckout() {
    try {
        console.log('📝 [DEBUG] handleCheckout - начало проверки...');
        
        const meRes = await fetch('/api/me', { credentials: 'include' });
        if (!meRes.ok) {
            console.log('❌ [DEBUG] handleCheckout - не авторизован');
            showNotification('Авторизуйтесь для оформления заказа');
            setTimeout(() => window.location.href = '/auth', 1500);
            return;
        }

        const user = await meRes.json();
        console.log('👤 [DEBUG] handleCheckout - пользователь:', user);

        if (user.isGuest) {
            console.log('❌ [DEBUG] handleCheckout - гостевой аккаунт');
            showNotification('Гостям запрещено оформлять заказы. Пожалуйста, зарегистрируйтесь');
            setTimeout(() => window.location.href = '/auth', 2000);
            return;
        }
        
        if (user.userType === 'employee') {
            console.log('❌ [DEBUG] handleCheckout - администратор');
            showNotification('Администраторы не могут оформлять заказы');
            return;
        }

        console.log('✅ [DEBUG] handleCheckout - авторизация успешна, проверяю корзину...');

        const cartRes = await fetch('/api/cart', { credentials: 'include' });
        if (cartRes.status === 403) {
            console.log('❌ [DEBUG] handleCheckout - доступ к корзине запрещен');
            showNotification('Доступ запрещён');
            return;
        }
        if (!cartRes.ok) {
            console.log('❌ [DEBUG] handleCheckout - ошибка загрузки корзины');
            showNotification('Не удалось загрузить корзину');
            return;
        }

        const cartData = await cartRes.json();
        if (!Array.isArray(cartData) || cartData.length === 0) {
            console.log('❌ [DEBUG] handleCheckout - корзина пуста');
            showNotification('Корзина пуста');
            return;
        }

        console.log('✅ [DEBUG] handleCheckout - все проверки пройдены, открываю форму...');
        await openOrderModal();

    } catch (err) {
        console.error('❌ [DEBUG] handleCheckout - критическая ошибка:', err);
        showNotification('Ошибка проверки авторизации');
        setTimeout(() => window.location.href = '/auth', 1500);
    }
}

async function openOrderModal() {
    try {
        console.log('📝 [DEBUG] openOrderModal - начало открытия...');
        
        const oldModal = document.getElementById('orderModal');
        if (oldModal) {
            console.log('📝 [DEBUG] openOrderModal - удаляю старую модалку...');
            oldModal.remove();
        }
        
        console.log('📝 [DEBUG] openOrderModal - создаю новую модалку...');
        createOrderModal();
        
        const modal = document.getElementById('orderModal');
        
        console.log('📝 [DEBUG] openOrderModal - загружаю данные пользователя и карты...');
        await loadUserDataAndCards();
        
        calculateTotal();
        
        const orderNumber = document.getElementById('orderNumber');
        if (orderNumber) orderNumber.textContent = 'Автогенерация (будет присвоен после оплаты)';
        
        console.log('✅ [DEBUG] openOrderModal - показываю модалку...');
        modal.style.display = 'block';
        attachOrderEvents();
        
    } catch (err) {
        console.error('❌ [DEBUG] openOrderModal - критическая ошибка:', err);
        showNotification('Ошибка открытия формы заказа');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('orderModal');
    if (modal) {
        modal.style.display = 'none';
        setTimeout(() => {
            if (modal && modal.parentElement) {
                modal.remove();
            }
        }, 300);
    }
}

async function loadUserDataAndCards() {
    try {
        const userRes = await fetch('/api/me', { credentials: 'include' });
        if (!userRes.ok) {
            console.log('❌ [DEBUG] loadUserDataAndCards - не авторизован (статус:', userRes.status, ')');
            showNotification('Ошибка загрузки профиля - требуется авторизация');
            closeOrderModal();
            setTimeout(() => window.location.href = '/auth', 2000);
            return;
        }
        
        const user = await userRes.json();
        console.log('👤 [DEBUG] loadUserDataAndCards - user:', user);
        
        if (user.isGuest || user.userType !== 'client') {
            console.log('❌ [DEBUG] loadUserDataAndCards - недопустимый тип пользователя:', user.userType);
            showNotification('Ошибка: некорректный тип пользователя');
            closeOrderModal();
            setTimeout(() => window.location.href = '/auth', 2000);
            return;
        }
        
        const orderName = document.getElementById('orderName');
        if (orderName) orderName.textContent = user.FullName || 'Пользователь';
        
        console.log('📝 [DEBUG] loadUserDataAndCards - загружаю карты...');
        const cardsRes = await fetch('/api/cards', { credentials: 'include' });
        
        console.log('📥 [DEBUG] loadUserDataAndCards - статус ответа карт:', cardsRes.status);
        
        let cards = [];
        if (cardsRes.status === 401) {
            console.log('❌ [DEBUG] loadUserDataAndCards - 401 при загрузке карт - требуется повторная авторизация');
            showNotification('Требуется авторизация!!!');
            closeOrderModal();
            setTimeout(() => window.location.href = '/auth', 2000);
            return;
        }
        
        if (cardsRes.ok) {
            const cardsData = await cardsRes.json();
            if (cardsData && typeof cardsData === 'object' && cardsData.error) {
                console.log('⚠️ [DEBUG] loadUserDataAndCards - ошибка от сервера:', cardsData.error);
                cards = [];
                showNotification(cardsData.error);
            } else {
                cards = Array.isArray(cardsData) ? cardsData : [];
                console.log('✅ [DEBUG] loadUserDataAndCards - загружено карт:', cards.length);
            }
        } else {
            const errorData = await cardsRes.json().catch(() => ({}));
            console.log('❌ [DEBUG] loadUserDataAndCards - ошибка статуса:', cardsRes.status, errorData);
            showNotification(errorData.error || 'Ошибка загрузки карт');
        }
        
        const select = document.getElementById('orderCard');
        if (select) {
            select.innerHTML = '<option value="">Выберите карту</option>';
            if (cards.length > 0) {
                cards.forEach(card => {
                    const option = document.createElement('option');
                    option.value = card.CardID;
                    option.dataset.balance = card.Balance;
                    option.textContent = `**** **** **** ${card.Last4Digits} (Баланс: ${card.Balance} BYN)`;
                    select.appendChild(option);
                });
                console.log('✅ [DEBUG] loadUserDataAndCards - карты добавлены в селект');
            } else {
                console.log('⚠️ [DEBUG] loadUserDataAndCards - карт не найдено');
                showNotification('⚠️ У вас нет сохранённых карт');
            }
        }
        
        console.log('📝 [DEBUG] loadUserDataAndCards - загружаю корзину...');
        await fetchCart();
        const cartTotalAmount = document.getElementById('cartTotalAmount');
        if (cartTotalAmount) {
            const total = cart.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
            cartTotalAmount.textContent = `${total} BYN`;
            console.log('✅ [DEBUG] loadUserDataAndCards - сумма корзины:', total);
        }
        checkBalance();
        
    } catch (err) {
        console.error('❌ [DEBUG] loadUserDataAndCards - критическая ошибка:', err);
        showNotification('Ошибка загрузки данных заказа');
        closeOrderModal();
        setTimeout(() => window.location.href = '/auth', 2000);
    }
}

function calculateTotal() {
    const delivery = document.querySelector('input[name="delivery"]:checked')?.value || 'pickup';
    let fee = 0;
    switch (delivery) {
        case '3km': fee = 5; break;
        case '5km': fee = 10; break;
        case 'over5km': fee = 20; break;
    }
    const cartTotal = cart.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
    const finalTotal = cartTotal + fee;
    const deliveryFeeEl = document.getElementById('deliveryFee');
    const finalTotalEl = document.getElementById('finalTotal');
    if (deliveryFeeEl) deliveryFeeEl.textContent = `${fee} BYN`;
    if (finalTotalEl) finalTotalEl.textContent = `${finalTotal} BYN`;
    checkBalance();
}

function checkBalance() {
    const cardSelect = document.getElementById('orderCard');
    if (!cardSelect) return;
    const cardId = cardSelect.value;
    const finalTotalText = document.getElementById('finalTotal')?.textContent.replace(' BYN', '').trim() || '0';
    const finalTotal = parseFloat(finalTotalText) || 0;
    const warning = document.getElementById('balanceWarning');
    const submitBtn = document.getElementById('submitOrderBtn');
    if (!cardId || finalTotal === 0) {
        if (warning) warning.style.display = 'none';
        if (submitBtn) submitBtn.disabled = true;
        return;
    }
    const selectedOption = cardSelect.options[cardSelect.selectedIndex];
    const balance = parseFloat(selectedOption.dataset.balance) || 0;
    if (warning && submitBtn) {
        if (balance < finalTotal) {
            warning.textContent = `Недостаточно средств (баланс: ${balance} BYN, требуется: ${finalTotal} BYN)`;
            warning.style.display = 'block';
            submitBtn.disabled = true;
        } else {
            warning.style.display = 'none';
            submitBtn.disabled = false;
        }
    }
}

async function submitOrder(e) {
    e.preventDefault();
    
    const phone = document.getElementById('orderPhone')?.value || '';
    const delivery = document.querySelector('input[name="delivery"]:checked')?.value || 'pickup';
    const address = delivery === 'pickup' ? '' : (document.getElementById('orderAddress')?.value || '');
    const cardId = document.getElementById('orderCard')?.value || '';
    
    console.log('📝 [DEBUG] submitOrder - Параметры:', { phone, address, cardId, delivery });
    
    if (!cardId) {
        showNotification('Выберите карту');
        return;
    }
    if (!phone) {
        showNotification('Заполните номер телефона');
        return;
    }
    if (delivery !== 'pickup' && !address) {
        showNotification('Заполните адрес доставки');
        return;
    }
    
    const cartTotal = cart.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
    
    let deliveryFee = 0;
    switch (delivery) {
        case '3km': deliveryFee = 5; break;
        case '5km': deliveryFee = 10; break;
        case 'over5km': deliveryFee = 20; break;
    }
    
    const total = cartTotal + deliveryFee;
    
    console.log('📊 [DEBUG] submitOrder - Расчеты:', { cartTotal, deliveryFee, total, delivery });
    
    if (total === 0) {
        showNotification('Корзина пуста');
        return;
    }
    
    try {
        console.log('📤 [DEBUG] submitOrder - Отправляю заказ на сервер...');
        
        const res = await fetch('/api/orders/create', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                phone, 
                address: address || null, 
                delivery, 
                cardId: parseInt(cardId),
                total: parseFloat(total)
            })
        });
        
        console.log(`📥 [DEBUG] submitOrder - Ответ сервера: ${res.status}`);
        
        const result = await res.json();
        console.log('📨 [DEBUG] submitOrder - Результат:', result);
        
        if (res.status === 403 || res.status === 401) {
            showNotification('Доступ запрещен');
            closeOrderModal();
            setTimeout(() => window.location.href = '/auth', 2000);
            return;
        }
        
        if (!res.ok) {
            const errorMsg = result.error || `Ошибка: ${res.status}`;
            console.error('❌ [DEBUG] submitOrder - Ошибка от сервера:', errorMsg);
            showNotification(errorMsg);
            return;
        }
        
        console.log('✅ [DEBUG] submitOrder - Заказ успешно создан!');
        const orderNumber = document.getElementById('orderNumber');
        if (orderNumber) orderNumber.textContent = result.orderId;
        
        showNotification(`✅ Заказ #${result.orderId} оформлен! Сумма: ${total} BYN`);
        closeOrderModal();
        await updateCartCount();
        await displayCartItems();
        closeCart();
        
        if (window.openAccountModal) {
            setTimeout(() => window.openAccountModal(), 500);
        }
        
    } catch (err) {
        console.error('❌ [DEBUG] submitOrder - Критическая ошибка:', err);
        showNotification(`Ошибка оформления заказа: ${err.message}`);
    }
}

// ------------------------------
// Отображение каталога
// ------------------------------
function displayBooks(books) {
    const booksGrid = document.getElementById('booksGrid');
    if (!booksGrid) return;
    booksGrid.innerHTML = books.map(book => `
        <div class="book-card" data-id="${book.BookID}">
            <div class="book-cover-placeholder">📖</div>
            <div class="book-info">
                <h3 class="book-title">${book.Title}</h3>
                <p class="book-author">${book.AuthorName || 'Неизвестно'}</p>
                <p class="book-price">${book.Price} BYN</p>
                <button class="add-to-cart-btn" data-id="${book.BookID}">
                    <i class="fas fa-shopping-cart"></i> В корзину
                </button>
            </div>
        </div>
    `).join('');
    booksGrid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            await addToCart(btn.dataset.id);
        });
    });
    booksGrid.querySelectorAll('.book-card').forEach(card => {
        card.addEventListener('click', () => openBookModal(card.dataset.id));
    });
}

// ------------------------------
// Модалка книги
// ------------------------------
function createBookModal() {
    if (document.getElementById('bookModal')) return;
    const modal = document.createElement('div');
    modal.id = 'bookModal';
    modal.className = 'modal book-modal';
    modal.innerHTML = `
        <div class="modal-content book-modal-content">
            <span class="close-modal" id="closeBookModalBtn">&times;</span>
            <div class="book-modal-body">
                <div class="book-modal-cover"><div class="book-cover-large">📖</div></div>
                <div class="book-modal-info">
                    <h1 id="modalBookTitle" class="modal-book-title"></h1>
                    <p id="modalBookAuthor" class="modal-book-meta"></p>
                    <p id="modalBookPublisher" class="modal-book-meta"></p>
                    <p id="modalBookYear" class="modal-book-meta"></p>
                    <p id="modalBookPages" class="modal-book-meta"></p>
                    <div id="modalBookRating" class="modal-book-rating"></div>
                    <div class="modal-book-description"><h3>Описание:</h3><p id="modalBookDescription"></p></div>
                    <div class="modal-book-price"><span class="price-label">Цена:</span> <span id="modalBookPrice" class="price-value"></span></div>
                    <button id="modalAddToCartBtn" class="add-to-cart-btn modal-btn"><i class="fas fa-shopping-cart"></i> Добавить в корзину</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeBookModal(); });
    const closeBtn = document.getElementById('closeBookModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeBookModal);
}

async function openBookModal(bookId) {
    const res = await fetch(`/api/books/${bookId}`, { credentials: 'include' });
    if (!res.ok) {
        showNotification('Ошибка загрузки книги');
        return;
    }
    const book = await res.json();
    if (!book) return;
    if (!document.getElementById('bookModal')) createBookModal();
    const modal = document.getElementById('bookModal');
    const stars = '⭐'.repeat(Math.floor(book.Rating || 0));
    document.getElementById('modalBookTitle').textContent = book.Title;
    document.getElementById('modalBookAuthor').textContent = 'Автор: ' + (book.AuthorName || 'Неизвестно');
    document.getElementById('modalBookPublisher').textContent = 'Издательство: ' + (book.PublisherName || 'Неизвестно');
    document.getElementById('modalBookYear').textContent = 'Год: ' + (book.Year || '-');
    document.getElementById('modalBookPages').textContent = 'Страниц: ' + (book.Pages || '-');
    document.getElementById('modalBookPrice').textContent = book.Price + ' BYN';
    document.getElementById('modalBookRating').innerHTML = `${stars} <span>${book.Rating || 0}/5</span>`;
    document.getElementById('modalBookDescription').textContent = book.Description || '';
    const addBtn = document.getElementById('modalAddToCartBtn');
    if (addBtn) {
        addBtn.onclick = async () => { await addToCart(bookId); closeBookModal(); };
    }
    modal.style.display = 'block';
}

function closeBookModal() {
    const modal = document.getElementById('bookModal');
    if (modal) modal.style.display = 'none';
}

// ------------------------------
// Корзина
// ------------------------------
async function openCart() {
    try {
        const meRes = await fetch('/api/me', { credentials: 'include' });
        if (!meRes.ok) {
            showNotification('Ошибка проверки прав доступа');
            return;
        }
        
        const user = await meRes.json();
        
        if (user.userType === 'employee') {
            showNotification('Администраторы не могут использовать корзину');
            return;
        }
        
        const cartModal = document.getElementById('cartModal');
        if (cartModal) {
            await displayCartItems();
            cartModal.style.display = 'block';
        }
    } catch (err) {
        console.error('Ошибка при открытии корзины:', err);
        showNotification('Ошибка при открытии корзины');
    }
}

async function displayCartItems() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    if (!cartItems || !cartTotal) return;
    await fetchCart();
    if (cart.length === 0) {
        cartItems.innerHTML = '<p style="text-align:center;padding:2rem;">Корзина пуста</p>';
        cartTotal.textContent = '0 BYN';
        return;
    }
    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div>
                <div class="cart-item-title">${item.Title}</div>
                <div class="cart-item-author">${item.AuthorName || 'Неизвестно'}</div>
                <div>Количество: ${item.Quantity}</div>
            </div>
            <div class="cart-item-actions">
                <div class="cart-item-price">${item.Price * item.Quantity} BYN</div>
                <button data-id="${item.BookID}" class="btn-remove"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
    cartItems.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', async () => { await removeFromCart(btn.dataset.id); });
    });
    const total = cart.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
    cartTotal.textContent = `${total} BYN`;
}

function closeCart() {
    const cartModal = document.getElementById('cartModal');
    if (cartModal) cartModal.style.display = 'none';
}

// ------------------------------
// Фильтры
// ------------------------------
async function applyFilters() {
    await loadBooksFromServer(currentFilters);
}

// ------------------------------
// Admin Panel
// ------------------------------
function setupAdminPanelEventListeners() {
    const deleteBookBtn = document.getElementById('deleteBookBtn');
    if (deleteBookBtn) {
        deleteBookBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const title = prompt('Введите название книги для удаления:');
            if (!title || title.trim() === '') {
                showNotification('Название не введено');
                return;
            }
            
            if (!confirm(`Вы уверены, что хотите удалить книгу "${title}"?`)) {
                return;
            }
            
            try {
                console.log(`🗑️ [DEBUG] Удаляю книгу: "${title}"`);
                
                const res = await fetch('/api/admin/books/delete-by-title', {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: title.trim() })
                });
                
                const result = await res.json();
                
                if (!res.ok) {
                    console.error(`❌ [DEBUG] Ошибка удаления:`, result.error);
                    showNotification(`Ошибка: ${result.error}`);
                    return;
                }
                
                console.log(`✅ [DEBUG] Книга удалена успешно`);
                showNotification(`✅ Книга "${result.bookTitle}" успешно удалена!`);
                
                await applyFilters();
                
            } catch (err) {
                console.error(`❌ [DEBUG] Критическая ошибка при удалении:`, err);
                showNotification(`Ошибка удаления: ${err.message}`);
            }
        });
    }
    
    const addBookForm = document.getElementById('addBookForm');
    if (addBookForm) {
        addBookForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('bookTitle')?.value.trim();
            const author = document.getElementById('bookAuthor')?.value.trim();
            const publisher = document.getElementById('bookPublisher')?.value.trim();
            const genre = document.getElementById('bookGenre')?.value.trim();
            const year = document.getElementById('bookYear')?.value.trim();
            const pages = document.getElementById('bookPages')?.value.trim();
            const rating = document.getElementById('bookRating')?.value.trim();
            const price = document.getElementById('bookPrice')?.value.trim();
            const description = document.getElementById('bookDescription')?.value.trim();
            
            if (!title || !price) {
                showNotification('Название и цена обязательны');
                return;
            }
            
            try {
                console.log('📝 [DEBUG] Отправляю форму добавления книги...');
                
                const res = await fetch('/api/admin/books/add', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        author,
                        publisher,
                        genre,
                        year,
                        pages,
                        rating,
                        price,
                        description
                    })
                });
                
                const result = await res.json();
                
                if (!res.ok) {
                    console.error(`❌ [DEBUG] Ошибка добавления:`, result.error);
                    showNotification(`Ошибка: ${result.error}`);
                    return;
                }
                
                console.log(`✅ [DEBUG] Книга добавлена успешно`);
                showNotification(`✅ Книга "${result.book.Title}" успешно добавлена!`);
                
                addBookForm.reset();
                
                await applyFilters();
                
            } catch (err) {
                console.error(`❌ [DEBUG] Критическая ошибка при добавлении:`, err);
                showNotification(`Ошибка добавления: ${err.message}`);
            }
        });
    }

    // НОВОЕ: Обработчик загрузки JSON файла
    const jsonFileInput = document.getElementById('jsonFileInput');
    if (jsonFileInput) {
        jsonFileInput.addEventListener('change', handleJsonUpload);
    }
}

async function handleJsonUpload(e) {
    const file = e.target.files[0];
    if (!file) {
        console.log('❌ Файл не выбран');
        return;
    }

    console.log(`📂 [DEBUG] Загружаю JSON файл: ${file.name}`);

    try {
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                console.log('📄 [DEBUG] JSON распарсен успешно:', json);

                // Проверяем, это массив или одна книга
                const books = Array.isArray(json) ? json : [json];
                
                if (books.length === 0) {
                    showNotification('❌ JSON не содержит книг');
                    return;
                }

                console.log(`📚 [DEBUG] Найдено книг: ${books.length}`);

                let successCount = 0;
                let errorCount = 0;

                // Загружаем каждую книгу
                for (const book of books) {
                    try {
                        console.log(`➕ [DEBUG] Добавляю книгу: ${book.title}`);
                        
                        const res = await fetch('/api/admin/books/add', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: book.title || book.Title || '',
                                author: book.author || book.Author || '',
                                publisher: book.publisher || book.Publisher || '',
                                genre: book.genre || book.Genre || '',
                                year: book.year || book.Year || '',
                                pages: book.pages || book.Pages || '',
                                rating: book.rating || book.Rating || '',
                                price: book.price || book.Price || 0,
                                description: book.description || book.Description || ''
                            })
                        });

                        if (res.ok) {
                            const result = await res.json();
                            console.log(`✅ [DEBUG] Книга добавлена: ${result.book.Title}`);
                            successCount++;
                        } else {
                            const error = await res.json();
                            console.error(`❌ [DEBUG] Ошибка добавления:`, error.error);
                            errorCount++;
                        }

                    } catch (err) {
                        console.error(`❌ [DEBUG] Ошибка при обработке книги:`, err);
                        errorCount++;
                    }
                }

                // Уведомление о результатах
                if (successCount > 0) {
                    showNotification(`✅ Загружено ${successCount} книг`);
                }
                if (errorCount > 0) {
                    showNotification(`⚠️ Ошибки при загрузке ${errorCount} книг`);
                }

                // Перезагружаем каталог
                await applyFilters();

                // Очищаем input
                document.getElementById('jsonFileInput').value = '';

            } catch (parseErr) {
                console.error('❌ [DEBUG] Ошибка парсинга JSON:', parseErr);
                showNotification('❌ Ошибка парсинга JSON файла. Проверьте формат.');
            }
        };

        reader.onerror = () => {
            console.error('❌ [DEBUG] Ошибка чтения файла');
            showNotification('❌ Ошибка чтения файла');
        };

        reader.readAsText(file);

    } catch (err) {
        console.error('❌ [DEBUG] Критическая ошибка при загрузке JSON:', err);
        showNotification(`❌ Ошибка: ${err.message}`);
    }
}

// ------------------------------
// Events & setup
// ------------------------------
function setupEventListeners() {
    const goToCatalogBtn = document.getElementById('goToCatalogBtn');
    if (goToCatalogBtn) {
        goToCatalogBtn.addEventListener('click', () => {
            const catalog = document.getElementById('catalog');
            if (catalog) catalog.scrollIntoView({ behavior: 'smooth' });
        });
    }
    
    const cartIcon = document.getElementById('cartIcon');
    if (cartIcon) {
        cartIcon.addEventListener('click', openCart);
    }
    
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', e => {
            currentFilters.category = e.target.value;
            applyFilters();
        });
    }
    
    const sortFilter = document.getElementById('sort-filter');
    if (sortFilter) {
        sortFilter.addEventListener('change', e => {
            currentFilters.sort = e.target.value;
            applyFilters();
        });
    }
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            currentFilters.q = e.target.value;
            applyFilters();
        });
    }
    
    const cartClose = document.querySelector('#cartModal .close-modal');
    if (cartClose) cartClose.addEventListener('click', closeCart);
    
    const checkoutBtn = document.querySelector('.checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
    
    // Плавный скролл для якорей
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            if (anchor.hasAttribute('data-category') || anchor.classList.contains('dropdown-toggle')) return;
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// ------------------------------
// Notification
// ------------------------------
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