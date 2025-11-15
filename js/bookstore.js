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
// API функции
// ------------------------------
async function loadBooksFromServer(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/books?${query}`, { credentials: 'include' });
    const books = await res.json();
    displayBooks(books);
}

async function fetchCart() {
    const res = await fetch('/api/cart', { credentials: 'include' });
    cart = await res.json();
    return cart;
}

async function updateCartCount() {
    await fetchCart();
    const cartCount = document.querySelector('.cart-count');
    const totalItems = cart.reduce((sum, item) => sum + (item.Quantity || 0), 0);
    cartCount.textContent = totalItems;
}

async function addToCart(bookId) {
    await fetch('/api/cart', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId })
    });
    await updateCartCount();
    showNotification('Книга добавлена в корзину!');
}

async function removeFromCart(bookId) {
    await fetch(`/api/cart/${bookId}`, { method: 'DELETE', credentials: 'include' });
    await displayCartItems();
    await updateCartCount();
}

async function handleCheckout() {
    if (cart.length === 0) {
        alert('Корзина пуста!');
        return;
    }
    const res = await fetch('/api/checkout', { method: 'POST', credentials: 'include' });
    const result = await res.json();
    if (result.error) { alert(result.error); return; }
    alert(`Заказ оформлен! Сумма: ${result.total} ₽\nСпасибо за покупку!`);
    await updateCartCount();
    await displayCartItems();
    closeCart();
}

// ------------------------------
// Отображение каталога
// ------------------------------
function displayBooks(books) {
    const booksGrid = document.getElementById('booksGrid');
    booksGrid.innerHTML = books.map(book => `
        <div class="book-card" data-id="${book.BookID}">
            <div class="book-cover-placeholder">📖</div>
            <div class="book-info">
                <h3 class="book-title">${book.Title}</h3>
                <p class="book-author">${book.AuthorName || 'Неизвестно'}</p>
                <p class="book-price">${book.Price} ₽</p>
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
    document.getElementById('closeBookModalBtn').addEventListener('click', closeBookModal);
}

async function openBookModal(bookId) {
    const res = await fetch(`/api/books/${bookId}`, { credentials: 'include' });
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
    document.getElementById('modalBookPrice').textContent = book.Price + ' ₽';
    document.getElementById('modalBookRating').innerHTML = `${stars} <span>${book.Rating || 0}/5</span>`;
    document.getElementById('modalBookDescription').textContent = book.Description || '';

    const addBtn = document.getElementById('modalAddToCartBtn');
    addBtn.onclick = async () => { await addToCart(bookId); closeBookModal(); };

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
    await displayCartItems();
    cartModal.style.display = 'block';
}

async function displayCartItems() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    await fetchCart();
    if (cart.length === 0) {
        cartItems.innerHTML = '<p style="text-align:center;padding:2rem;">Корзина пуста</p>';
        cartTotal.textContent = '0 ₽';
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
                <div class="cart-item-price">${item.Price * item.Quantity} ₽</div>
                <button data-id="${item.BookID}" class="btn-remove"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
    cartItems.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', async () => { await removeFromCart(btn.dataset.id); });
    });
    const total = cart.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
    cartTotal.textContent = `${total} ₽`;
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
    document.getElementById('goToCatalogBtn')?.addEventListener('click', () => {
        document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
    });


    document.getElementById('cartIcon')?.addEventListener('click', openCart);

    document.getElementById('category-filter')?.addEventListener('change', e => {
        currentFilters.category = e.target.value;
        applyFilters();
    });

    document.getElementById('sort-filter')?.addEventListener('change', e => {
        currentFilters.sort = e.target.value;
        applyFilters();
    });

    document.getElementById('search-input')?.addEventListener('input', e => {
        currentFilters.q = e.target.value;
        applyFilters();
    });

  const dropdownToggle = document.querySelector('.dropdown-toggle');
    dropdownToggle?.addEventListener('click', e => {
        e.preventDefault();  // Предотвращаем скролл к #categories
        const dropdown = e.target.closest('.dropdown');
        dropdown.classList.toggle('open');  // Toggle показа меню
    });

    // Клик по ссылкам в меню категорий (убрал вложенный DOMContentLoaded)
   // Клик по ссылкам в меню категорий
const dropdownLinks = document.querySelectorAll('.dropdown-menu a[data-category]');
dropdownLinks.forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        const category = link.dataset.category;
        currentFilters.category = category;
        
        // НОВОЕ: Синхронизируем селект снизу
        const categorySelect = document.getElementById('category-filter');
        if (categorySelect) {
            categorySelect.value = category;  // Устанавливаем выбранный option
        }
        
        applyFilters();
        // Опционально: Прокрутка к каталогу после фильтра
        document.getElementById('catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Закрыть меню
        const dropdown = link.closest('.dropdown');
        dropdown?.classList.remove('open');
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


    document.querySelector('#cartModal .close-modal')?.addEventListener('click', closeCart);
    document.querySelector('.checkout-btn')?.addEventListener('click', handleCheckout);
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
    document.head.appendChild(style);
}
