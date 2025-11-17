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
        await fetchCart(true); // передаем флаг "silent" — не показывать уведомления
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
// Модалка заказа (функции определены в логическом порядке)
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
                    <div id="balanceWarning" class="balance-warning" style="display:none;"></div>
                </div>
                <div class="order-total">
                    <p>Сумма товаров: <span id="cartTotalAmount">0 BYN</span></p>
                    <p>Доставка: <span id="deliveryFee">0 BYN</span></p>
                    <p><strong>Итого: <span id="finalTotal">0 BYN</span></strong></p>
                </div>
                <button type="submit" class="submit-order-btn" id="submitOrderBtn" disabled>Оформить заказ</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Динамическое прикрепление событий
    attachOrderEvents();
    
    // Закрытие модалки
    modal.addEventListener('click', e => { if (e.target === modal) closeOrderModal(); });
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeOrderModal);
    
    // Submit формы
    const form = modal.querySelector('#orderForm');
    if (form) form.addEventListener('submit', submitOrder);
}

function attachOrderEvents() {
    // Доставка: change для radio
    const deliveryRadios = document.querySelectorAll('input[name="delivery"]');
    deliveryRadios.forEach(radio => {
        radio.removeEventListener('change', calculateTotal); // Убираем дубли
        radio.addEventListener('change', calculateTotal);
    });
    
    // Карта: change для select
    const orderCardSelect = document.getElementById('orderCard');
    if (orderCardSelect) {
        orderCardSelect.removeEventListener('change', checkBalance);
        orderCardSelect.addEventListener('change', checkBalance);
    }
    

    // Кнопка сохранения новой карты
    const saveNewCardBtn = document.getElementById('saveNewCardBtn');
    if (saveNewCardBtn) {
        saveNewCardBtn.removeEventListener('click', saveNewCard);
        saveNewCardBtn.addEventListener('click', saveNewCard);
    }
}

function toggleNewCardForm() {
    const fields = document.getElementById('newCardFields');
    newCardFormVisible = !newCardFormVisible;
    fields.style.display = newCardFormVisible ? 'block' : 'none';
    if (newCardFormVisible) {
        document.getElementById('orderCard').value = '';  // Сброс выбора
        
        // Динамически добавляем required при показе
        const newCardInputs = ['newCardNumber', 'newCardExpiry', 'newCardCVV'];
        newCardInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.required = true;
        });
        document.getElementById('newCardNumber').focus();
    } else {
        // Убираем required при скрытии
        const newCardInputs = ['newCardNumber', 'newCardExpiry', 'newCardCVV'];
        newCardInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.required = false;
        });
    }
    attachOrderEvents(); // Переприкрепляем события
}

async function saveNewCard() {
    const number = document.getElementById('newCardNumber').value.replace(/\s/g, '');
    const expiry = document.getElementById('newCardExpiry').value;
    const cvv = document.getElementById('newCardCVV').value;
    if (!number || number.length !== 16 || !expiry || !cvv || cvv.length !== 3) {
        return showNotification('Неверный формат карты');
    }
    try {
        const res = await fetch('/api/cards', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardNumber: number, expiry, cvv })
        });
        if (!res.ok) {
            const result = await res.json();
            return showNotification(result.error || 'Ошибка добавления карты');
        }
        const result = await res.json();
        showNotification('Карта добавлена');
        toggleNewCardForm();  // Скрыть форму
        await loadUserDataAndCards();  // Обновить селект
        // Очистка полей
        document.getElementById('newCardNumber').value = '';
        document.getElementById('newCardExpiry').value = '';
        document.getElementById('newCardCVV').value = '';
    } catch (err) {
        console.error(err);
        showNotification('Ошибка добавления карты');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('orderModal');
    if (modal) modal.style.display = 'none';
    newCardFormVisible = false;
    const fields = document.getElementById('newCardFields');
    if (fields) fields.style.display = 'none';
    
    // Убираем required при закрытии
    const newCardInputs = ['newCardNumber', 'newCardExpiry', 'newCardCVV'];
    newCardInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.required = false;
    });
}

// ------------------------------
// Checkout логика
// ------------------------------
async function handleCheckout() {
    try {
        // 1. Сначала проверяем авторизацию
        const meRes = await fetch('/api/me', { credentials: 'include' });
        if (!meRes.ok) {
            showNotification('Авторизуйтесь для оформления заказа');
            setTimeout(() => window.location.href = '/auth', 1500);
            return;
        }

        const user = await meRes.json();

        // Гость или сотрудник — сразу блокируем
        if (user.isGuest || user.userType !== 'client') {
            showNotification('Авторизуйтесь для оформления заказа');
            setTimeout(() => window.location.href = '/auth', 1500);
            return;
        }

        // 2. Только после успешной проверки авторизации проверяем корзину
        const cartRes = await fetch('/api/cart', { credentials: 'include' });
        if (cartRes.status === 403) {
            showNotification('Доступ запрещён');
            return;
        }
        if (!cartRes.ok) {
            showNotification('Не удалось загрузить корзину');
            return;
        }

        const cartData = await cartRes.json();
        if (!Array.isArray(cartData) || cartData.length === 0) {
            showNotification('Корзина пуста');
            return;
        }

        // 3. Только теперь открываем модалку — никаких мельканий!
        await openOrderModal();

    } catch (err) {
        console.error(err);
        showNotification('Ошибка проверки авторизации');
        setTimeout(() => window.location.href = '/auth', 1500);
    }
}

async function openOrderModal() {
    try {
        // Создаём модалку если нет
        if (!document.getElementById('orderModal')) createOrderModal();
        const modal = document.getElementById('orderModal');
        await loadUserDataAndCards(); // Загружаем данные пользователя и карты
        calculateTotal(); // Расчёт итога
        // Плейсхолдер для номера (обновится после submit)
        const orderNumber = document.getElementById('orderNumber');
        if (orderNumber) orderNumber.textContent = 'Автогенерация (будет присвоен после оплаты)';
        modal.style.display = 'block';
        attachOrderEvents(); // Прикрепляем события после открытия
    } catch (err) {
        console.error('Ошибка открытия модалки заказа:', err);
        showNotification('Ошибка открытия формы заказа');
    }
}

async function loadUserDataAndCards() {
    const userRes = await fetch('/api/me', { credentials: 'include' });
    if (!userRes.ok) {
        showNotification('Ошибка загрузки профиля');
        setTimeout(() => window.location.href = '/auth', 2000);
        return;
    }
    const user = await userRes.json();
    const orderName = document.getElementById('orderName');
    if (orderName) orderName.textContent = user.FullName || 'Гость';
    
    // Загружаем карты
    const cardsRes = await fetch('/api/cards', { credentials: 'include' });
    let cards = [];
    if (cardsRes.ok) {
        const cardsData = await cardsRes.json();
        // Проверка: если cardsData — объект с error, используем []
        if (cardsData && typeof cardsData === 'object' && cardsData.error) {
            cards = [];
            showNotification(cardsData.error);
            setTimeout(() => window.location.href = '/auth', 2000);
        } else {
            cards = Array.isArray(cardsData) ? cardsData : [];
        }
    } else {
        const errorData = await cardsRes.json().catch(() => ({}));
        showNotification(errorData.error || 'Ошибка загрузки карт');
        setTimeout(() => window.location.href = '/auth', 2000);
    }
    
    const select = document.getElementById('orderCard');
    if (select) {
        select.innerHTML = '<option value="">Выберите карту</option>';
        cards.forEach(card => {
            const option = document.createElement('option');
            option.value = card.CardID;
            option.dataset.balance = card.Balance;
            option.textContent = `**** **** **** ${card.Last4Digits} (Баланс: ${card.Balance} BYN)`;
            select.appendChild(option);
        });
    }
    
    // Загружаем корзину для суммы
    await fetchCart();
    const cartTotalAmount = document.getElementById('cartTotalAmount');
    if (cartTotalAmount) {
        cartTotalAmount.textContent = `${cart.reduce((sum, item) => sum + item.Price * item.Quantity, 0)} BYN`;
    }
    checkBalance();  // Проверка после загрузки
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
    checkBalance();  // Проверка после изменения суммы
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
    const address = document.getElementById('orderAddress')?.value || '';
    const cardId = document.getElementById('orderCard')?.value || '';
    if (!cardId) return showNotification('Выберите карту');
    if (!phone || !address) return showNotification('Заполните телефон и адрес');
    const cartTotal = cart.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
    const delivery = document.querySelector('input[name="delivery"]:checked')?.value || 'pickup';
    let deliveryFee = 0;
    switch (delivery) {
        case '3km': deliveryFee = 5; break;
        case '5km': deliveryFee = 10; break;
        case 'over5km': deliveryFee = 20; break;
    }
    const total = cartTotal + deliveryFee;
    if (total === 0) return showNotification('Корзина пуста');
    try {
        const res = await fetch('/api/orders/create', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, address, delivery, cardId, total })
        });
        if (res.status === 403 || res.status === 401) {
            showNotification('Доступ запрещен');
            closeOrderModal();
            setTimeout(() => window.location.href = '/auth', 2000);
            return;
        }
        if (!res.ok) {
            const result = await res.json();
            return showNotification(result.error || 'Ошибка оформления заказа');
        }
        const result = await res.json();
        const orderNumber = document.getElementById('orderNumber');
        if (orderNumber) orderNumber.textContent = result.orderId;
        showNotification(`Заказ #${result.orderId} оформлен! Сумма: ${total} BYN`);
        closeOrderModal();
        await updateCartCount();
        await displayCartItems();
        closeCart();
        // Go to accountModal on orders tab
        if (window.openAccountModal) window.openAccountModal();
        if (window.loadOrders) window.loadOrders();
    } catch (err) {
        console.error(err);
        showNotification('Ошибка оформления заказа');
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
    // Кнопки "Добавить в корзину"
    booksGrid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            await addToCart(btn.dataset.id);
        });
    });
    // Клик по карточке книги
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
    // Закрытие кликом вне модалки
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
    const cartModal = document.getElementById('cartModal');
    if (cartModal) {
        await displayCartItems();
        cartModal.style.display = 'block';
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
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    if (dropdownToggle) {
        dropdownToggle.addEventListener('click', e => {
            e.preventDefault(); // Предотвращаем скролл к #categories
            const dropdown = e.target.closest('.dropdown');
            if (dropdown) dropdown.classList.toggle('open'); // Toggle показа меню
        });
    }
    // Клик по ссылкам в меню категорий
    const dropdownLinks = document.querySelectorAll('.dropdown-menu a[data-category]');
    dropdownLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const category = link.dataset.category;
            currentFilters.category = category;
            
            // Синхронизируем селект снизу
            const categorySelect = document.getElementById('category-filter');
            if (categorySelect) {
                categorySelect.value = category; // Устанавливаем выбранный option
            }
            
            applyFilters();
            // Прокрутка к каталогу после фильтра
            const catalog = document.getElementById('catalog');
            if (catalog) catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Закрыть меню
            const dropdown = link.closest('.dropdown');
            if (dropdown) dropdown.classList.remove('open');
        });
    });
    // Плавный скролл для остальных якорей (пропускаем data-category)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            if (anchor.hasAttribute('data-category') || anchor.classList.contains('dropdown-toggle')) return;
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    const cartClose = document.querySelector('#cartModal .close-modal');
    if (cartClose) cartClose.addEventListener('click', closeCart);
    const checkoutBtn = document.querySelector('.checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
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