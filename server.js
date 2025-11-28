const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const db = require('./js/db');
const cardsDb = require('./js/cardsdb'); // Новый модуль для карт
const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                "default-src": ["'self'"],
                "script-src": [
                    "'self'",
                    "https://api-maps.yandex.ru",
                    "https://yastatic.net",
                    "https://core-renderer-tiles.maps.yandex.net"
                ],
                "script-src-attr": ["'none'"],
                "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                "img-src": [
                    "'self'",
                    "data:",
                    "https://yastatic.net",
                    "https://core-renderer-tiles.maps.yandex.net",
                    "https://yandex.ru"
                ],
                "connect-src": [
                    "'self'",
                    "https://api-maps.yandex.ru",
                    "https://core-renderer-tiles.maps.yandex.net",
                    "https://*.yandex.ru"
                ],
                "font-src": ["'self'", "https://cdnjs.cloudflare.com"],
            },
        },
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(session({
  name: "bookstore.sid",
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, secure: false, maxAge: 1000*60*60*1/4 }
}));

app.get('/auth', (req, res) => {
    res.render('auth.ejs'); // просто рендерим EJS страницу
});
app.get("/account_main", async (req, res) => {
    let userType = 'guest';
    if (req.session.userType) userType = req.session.userType;

    // Если гость или сотрудник, не передаем данные для формы оплаты
    const showPaymentForm = userType === 'client';

    res.render('index.ejs', {
        clientId: req.session.clientId || null,
        userType,
        showPaymentForm
    });
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Инициализация БД ---
(async () => {
    await db.initDB();
    await cardsDb.initDB(); // Инициализация БД карт
})();

// --- API для просмотра VIEW (опционально - для отладки и проверки) ---
// Просмотр заказов с деталями через VIEW
app.get('/api/admin/views/orders-details', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const result = await db.pool.query(`SELECT * FROM "OrdersWithDetails1" ORDER BY "OrderDate" DESC LIMIT 50`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения данных VIEW' });
    }
});

// Просмотр статистики продаж книг через VIEW
app.get('/api/admin/views/books-stats', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const result = await db.pool.query(`SELECT * FROM "BooksSalesStats1" ORDER BY "TotalRevenue" DESC NULLS LAST`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения данных VIEW' });
    }
});

// Просмотр истории заказов клиента через VIEW
app.get('/api/admin/views/client-history', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const result = await db.pool.query(`SELECT * FROM "ClientOrderHistory1" WHERE "OrderID" IS NOT NULL ORDER BY "OrderDate" DESC`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения данных VIEW' });
    }
});

// --- API ---
// Получить все книги
app.get("/api/books", async (req, res) => {
    try {
        let books = await db.getAllBooks(); // все книги с AuthorName, PublisherName, Price, Genre, Year, Pages, Rating
        const { category, minPrice, maxPrice, sort, q } = req.query;
        // Применяем все фильтры последовательно
        books = books.filter(b => {
            let ok = true;
            if (category && category.toLowerCase() !== "all") {
                ok = ok && b.Genre && b.Genre.toLowerCase() === category.toLowerCase();
            }
            if (minPrice) {
                const min = parseFloat(minPrice);
                if (!isNaN(min)) ok = ok && b.Price >= min;
            }
            if (maxPrice) {
                const max = parseFloat(maxPrice);
                if (!isNaN(max)) ok = ok && b.Price <= max;
            }
            if (q) {
                const search = q.toLowerCase();
                ok = ok && (
                    (b.Title && b.Title.toLowerCase().includes(search)) ||
                    (b.AuthorName && b.AuthorName.toLowerCase().includes(search))
                );
            }
            return ok;
        });
        // Сортировка
        if (sort) {
            if (sort === "price-asc") books.sort((a,b) => a.Price - b.Price);
            if (sort === "price-desc") books.sort((a,b) => b.Price - a.Price);
            if (sort === "newest") books.sort((a,b) => b.BookID - a.BookID);
            if (sort === "rating-desc") books.sort((a,b) => (b.Rating || 0) - (a.Rating || 0));
        }
        res.json(books);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// Получить книгу по ID
app.get("/api/books/:id", async (req, res) => {
    try {
        const book = await db.getBookById(Number(req.params.id));
        if (!book) return res.status(404).json({ error: "Книга не найдена" });
        res.json(book);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// --- Работа с корзиной ---
async function getSessionClientId(req) {
    if (req.session.userType === 'employee') {
        throw new Error('No cart for employees');
    }
    if (req.session.userId && req.session.userType === 'client') {
        return req.session.userId;
    }
    // Создаём гостевого клиента
    const guest = await db.addClient({
        FullName: 'Гость',
        Email: null,
        Phone: null,
        Address: null
    });
    req.session.userId = guest.ClientID;
    req.session.userType = 'client';
    return req.session.userId;
}

app.get("/api/cart", async (req, res) => {
    try {
        if (req.session.userType === 'employee') {
            // Если пользователь — сотрудник, возвращаем заказы напрямую
            const orders = await db.getOrdersByEmployee(req.session.userId, 'Оплачен%');
            return res.json(orders);
        }

        const clientId = await getSessionClientId(req);
        const cart = await db.getCartByClient(clientId);
        res.json(cart);
    } catch(err) {
        if (err.message === 'No cart for employees') {
            return res.status(403).json({ error: "Доступ запрещен для сотрудников" });
        }
        console.error(err);
        res.status(500).json({ error: "Ошибка получения корзины" });
    }
});

app.post("/api/cart", async (req, res) => {
    try {
        const clientId = await getSessionClientId(req);
        const { bookId, quantity } = req.body;
        await db.addToCart(clientId, Number(bookId), quantity || 1);
        const cart = await db.getCartByClient(clientId);
        res.json(cart);
    } catch(err) {
        if (err.message === 'No cart for employees') {
            return res.status(403).json({ error: "Доступ запрещен для сотрудников" });
        }
        console.error(err);
        res.status(500).json({ error: "Ошибка добавления в корзину" });
    }
});

app.delete("/api/cart/:bookId", async (req,res)=>{
    try {
        const clientId = await getSessionClientId(req);
        await db.removeFromCart(clientId, Number(req.params.bookId));
        const cart = await db.getCartByClient(clientId);
        res.json(cart);
    } catch(err) {
        if (err.message === 'No cart for employees') {
            return res.status(403).json({ error: "Доступ запрещен для сотрудников" });
        }
        console.error(err);
        res.status(500).json({ error: "Ошибка удаления из корзины" });
    }
});

// --- API для карт (GET и POST — без дубликатов) ---
app.get("/api/cards", async (req, res) => {
    try {
        if (req.session.userType !== 'client') {
            return res.status(403).json({ error: "Доступ запрещен" });
        }
        const clientId = await getSessionClientId(req);
        const user = await db.getClientById(clientId);
        if (!user || !user.Email) return res.status(401).json({ error: "Авторизуйтесь" });
        const cards = await cardsDb.getCardsByClient(clientId);
        res.status(200).json(cards || []); // Explicit 200 + empty array if none
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка получения карт" });
    }
});

app.post("/api/cards", async (req, res) => {
    try {
        if (req.session.userType !== 'client') {
            return res.status(403).json({ error: "Доступ запрещен" });
        }
        const { cardNumber, expiry, cvv } = req.body;
        const clientId = await getSessionClientId(req);
        const user = await db.getClientById(clientId);
        if (!user || !user.Email) return res.status(401).json({ error: "Авторизуйтесь" });
        const last4 = cardNumber.slice(-4);
        const card = await cardsDb.addCard(clientId, cardNumber, expiry, cvv, last4, 0);
        res.status(201).json({ message: "Карта добавлена", cardId: card.CardID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка добавления карты" });
    }
});
// --- Создание заказа (новый эндпоинт) ---
app.post("/api/orders/create", async (req, res) => {
    try {
        console.log('📥 [DEBUG] POST /api/orders/create');
        console.log('📥 [DEBUG] session.userType:', req.session.userType);
        console.log('📥 [DEBUG] session.userId:', req.session.userId);
        console.log('📥 [DEBUG] body:', req.body);
        
        // Доступ только для зарегистрированных клиентов
        if (req.session.userType !== 'client') {
            console.log('❌ [DEBUG] Ошибка: userType не client');
            return res.status(403).json({ error: "Доступ запрещен" });
        }

        const clientId = await getSessionClientId(req);
        console.log('👤 [DEBUG] clientId:', clientId);
        
        const user = await db.getClientById(clientId);
        console.log('👤 [DEBUG] user:', user);

        // Гость не может оформить заказ
        if (!user || !user.Email) {
            console.log('❌ [DEBUG] Ошибка: гостевой заказ');
            return res.status(403).json({ error: "Гостям запрещено оформлять заказ" });
        }

        const { phone, address, delivery, cardId, total } = req.body;
        console.log('📋 [DEBUG] Параметры заказа:', { phone, address, delivery, cardId, total });

        // Валидация - адрес обязателен только при доставке
        if (!phone || !delivery || !cardId || total === null || total === undefined) {
            console.log('❌ [DEBUG] Ошибка валидации: отсутствуют требуемые параметры');
            return res.status(400).json({ error: "Отсутствуют требуемые параметры" });
        }

        // Адрес требуется только если не самовывоз
        if (delivery !== 'pickup' && !address) {
            console.log('❌ [DEBUG] Ошибка валидации: адрес требуется для доставки');
            return res.status(400).json({ error: "Адрес доставки обязателен" });
        }

        // Проверка карты
        console.log('🔍 [DEBUG] Проверяю карту с ID:', cardId);
        const card = await cardsDb.getCardById(cardId);
        console.log('💳 [DEBUG] Карта:', card);
        
        if (!card) {
            console.log('❌ [DEBUG] Ошибка: карта не найдена');
            return res.status(400).json({ error: "Карта не найдена" });
        }
        
        if (card.Balance < total) {
            console.log(`❌ [DEBUG] Ошибка: недостаточно средств (баланс: ${card.Balance}, требуется: ${total})`);
            return res.status(400).json({ error: "Недостаточно средств на карте" });
        }

        // Создание заказа
        console.log('📝 [DEBUG] Создаю заказ...');
        const order = await db.createOrder(clientId, null, total, "Новый");
        console.log('✅ [DEBUG] Заказ создан с ID:', order.OrderID);
        
        // Загружаем корзину
        console.log('🛒 [DEBUG] Загружаю корзину для клиента:', clientId);
        const cartBeforeClear = await db.getCartByClient(clientId);
        console.log('📦 [DEBUG] Товары в корзине:', cartBeforeClear);
        
        // Добавляем товары в заказ
        console.log('📝 [DEBUG] Добавляю товары в заказ...');
        await db.addOrderItems(order.OrderID, cartBeforeClear);
        console.log('✅ [DEBUG] Товары добавлены');

        // Определяем метод доставки
        let deliveryMethod = 'Самовывоз';
        let status = 'Оплачен, ожидает получения';
        
        switch (delivery) {
            case '3km': 
                deliveryMethod = 'Доставка 3км'; 
                status = 'Оплачен, ожидается доставка'; 
                break;
            case '5km': 
                deliveryMethod = 'Доставка 5км'; 
                status = 'Оплачен, ожидается доставка'; 
                break;
            case 'over5km': 
                deliveryMethod = 'Доставка >5км'; 
                status = 'Оплачен, ожидается доставка'; 
                break;
        }
        
        console.log('🚚 [DEBUG] Добавляю доставку:', { deliveryMethod, status, phone, address });
        await db.addDelivery(order.OrderID, deliveryMethod, address, 'Ожидает', null, null, phone);
        console.log('✅ [DEBUG] Доставка добавлена');

        // Списываем с карты
        console.log(`💳 [DEBUG] Списываю ${total} с карты ${cardId}`);
        await cardsDb.updateCardBalance(cardId, card.Balance - total);
        console.log('✅ [DEBUG] Средства списаны');

        // Обновляем статус
        console.log('📊 [DEBUG] Обновляю статус заказа на:', status);
        await db.updateOrderStatus(order.OrderID, status);
        console.log('✅ [DEBUG] Статус обновлен');

        // Очищаем корзину
        console.log('🗑️ [DEBUG] Очищаю корзину');
        await db.clearCart(clientId);
        console.log('✅ [DEBUG] Корзина очищена');

        console.log('✅ [DEBUG] Заказ успешно оформлен!');
        
        res.json({
            message: "Заказ оформлен",
            orderId: order.OrderID,
            items: cartBeforeClear.map(item => ({ 
                Title: item.Title, 
                Quantity: item.Quantity, 
                Price: item.Price 
            }))
        });

    } catch (err) {
        console.error('❌ [DEBUG] КРИТИЧЕСКАЯ ОШИБКА в /api/orders/create:', err);
        console.error('❌ [DEBUG] Stack:', err.stack);
        res.status(500).json({ error: `Ошибка создания заказа: ${err.message}` });
    }
});

// Checkout (устаревший, теперь перенаправляет на новый)
app.post("/api/checkout", async (req,res)=>{
    res.status(410).json({ error: "Используйте /api/orders/create" });
});

// --- Регистрация ---
app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, password, password2 } = req.body;
        if (!name || !email || !password || !password2)
            return res.status(400).json({ error: "Все поля обязательны" });
        if (password !== password2)
            return res.status(400).json({ error: "Пароли не совпадают" });
        const existing = await db.getClientByEmail(email);
        if (existing) return res.status(400).json({ error: "Пользователь уже существует" });
        // Сохранение старой корзины гостя
        const oldClientId = req.session.clientId;
        const client = await db.registerClient({ FullName: name, Email: email, Password: password });
        req.session.clientId = client.ClientID;
        // Слияние корзины гостя
        if (oldClientId && oldClientId !== client.ClientID) {
            await db.mergeCarts(oldClientId, client.ClientID);
            await db.clearCart(oldClientId); // Опционально удалить гостя
        }
        res.json({ message: "Регистрация успешна", clientId: client.ClientID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка регистрации" });
    }
});

// --- Вход ---
// --- Вход (обновленный для клиентов и сотрудников) ---
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Все поля обязательны" });

        // Проверяем клиента
        let user = await db.authenticateClient(email, password);
        let userType = 'client';
        let userIdField = 'ClientID';

        // Если не клиент, проверяем сотрудника
        if (!user) {
            user = await db.authenticateEmployee(email, password);
            userType = 'employee';
            userIdField = 'EmployeeID';
        }

        if (!user) return res.status(401).json({ error: "Неверный email или пароль" });

        // Сохранение старой корзины гостя (только для клиентов)
        const oldClientId = req.session.userId;
        req.session.userId = user[userIdField];
        req.session.userType = userType;

        // Сливаем корзину только если текущий пользователь — клиент
        if (userType === 'client' && oldClientId && oldClientId !== user.ClientID) {
            await db.mergeCarts(oldClientId, user.ClientID);
            await db.clearCart(oldClientId);
        }

        res.json({ message: "Вход успешен", userId: user[userIdField], userType });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка входа" });
    }
});

// --- Получить текущего клиента ---
// api/me
// --- Получить текущего пользователя (обновленный для типа) ---
app.get("/api/me", async (req,res)=>{
    try {
        if (!req.session.userId) return res.status(401).json({ error: "Not authorized" });
        let user;
        if (req.session.userType === 'employee') {
            user = await db.getEmployeeById(req.session.userId);
        } else {
            user = await db.getClientById(req.session.userId);
        }
        if (!user) return res.status(404).json({ error: "User not found" });
        const isGuest = req.session.userType !== 'client' && req.session.userType !== 'employee';
        res.json({ ...user, userType: req.session.userType, isGuest });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Error" });
    }
});

// --- Выход ---
app.post("/api/auth/logout", (req,res)=>{
    req.session.destroy(err=>{
        if(err) return res.status(500).json({ error: "Ошибка выхода" });
        res.json({ message: "Выход успешен" });
    });
});

// API для заказов
app.get("/api/orders/current", async (req, res) => {
    try {
        if (req.session.userType !== 'client') {
            return res.status(403).json({ error: "Доступ запрещен" });
        }
        const clientId = await getSessionClientId(req);
        const user = await db.getClientById(clientId);
        if (!user.Email) {
            return res.status(403).json({ error: "Доступ запрещен для гостей" });
        }
        const ordersResult = await db.pool.query(`
            SELECT o.*, d."Phone"
            FROM "Orders" o
            LEFT JOIN "Deliveries" d ON o."OrderID" = d."OrderID"
            WHERE o."ClientID" = $1 AND o."Status" LIKE $2
        `, [clientId, 'Оплачен%']);
        const orders = ordersResult.rows;

        const ordersWithItems = await Promise.all(orders.map(async (o) => {
            const items = await db.getOrderItems(o.OrderID);
            return { ...o, Items: items || [] };
        }));
        res.status(200).json(ordersWithItems);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Заказы не найдены" });
    }
});

app.get("/api/orders/history", async (req, res) => {
    try {
        if (req.session.userType !== 'client') {
            return res.status(403).json({ error: "Доступ запрещен" });
        }
        const clientId = await getSessionClientId(req);
        const user = await db.getClientById(clientId);
        if (!user.Email) {
            return res.status(403).json({ error: "Доступ запрещен для гостей" });
        }
        const ordersResult = await db.pool.query(`
            SELECT o.*, d."Phone"
            FROM "Orders" o
            LEFT JOIN "Deliveries" d ON o."OrderID" = d."OrderID"
            WHERE o."ClientID" = $1 AND o."Status" = $2
            ORDER BY o."OrderDate" DESC
        `, [clientId, 'Завершён']);
        const orders = ordersResult.rows;

        const ordersWithItems = await Promise.all(orders.map(async (o) => {
            const items = await db.getOrderItems(o.OrderID);
            return { ...o, Items: items || [] };
        }));
        res.status(200).json(ordersWithItems);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка загрузки истории" });
    }
});

// Удаление завершённого заказа (ВАЖНО: должен быть ДО /api/admin/orders)
app.delete('/api/orders/:orderId', async (req, res) => {
    try {
        if (req.session.userType !== 'client') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        
        const clientId = await getSessionClientId(req);
        const { orderId } = req.params;
        
        // Проверяем, что заказ принадлежит текущему клиенту
        const orderRes = await db.pool.query(
            `SELECT * FROM "Orders" WHERE "OrderID" = $1 AND "ClientID" = $2`,
            [orderId, clientId]
        );
        
        if (!orderRes.rows.length) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }
        
        // Удаляем заказ
        await db.deleteOrder(orderId, clientId);
        res.json({ message: 'Заказ удалён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления заказа' });
    }
});

// Поиск заказов (ЕДИНСТВЕННЫЙ маршрут для /api/admin/orders)
app.get('/api/admin/orders', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const { phone, status } = req.query;

        if (phone) {
            console.log(`🔍 [DEBUG] Поиск заказов по номеру телефона: ${phone}`);
            const orders = await db.getOrdersByPhonePartial(phone, 'Оплачен, ожидает получения');
            if (!orders || orders.length === 0) {
                console.log(`⚠️ [DEBUG] Заказы не найдены для номера: ${phone}`);
                return res.status(404).json({ error: 'Заказы не найдены' });
            }
            console.log(`✅ [DEBUG] Найдено заказов: ${orders.length}`);
            return res.json(orders);
        }

        if (status) {
            console.log(`🔍 [DEBUG] Поиск заказов по статусу: ${status}`);
            const decodedStatus = decodeURIComponent(status);
            const orders = await db.getOrdersByStatus(decodedStatus);
            if (!orders || orders.length === 0) {
                console.log(`⚠️ [DEBUG] Заказы не найдены для статуса: ${decodedStatus}`);
                return res.status(404).json({ error: 'Заказы не найдены' });
            }
            console.log(`✅ [DEBUG] Найдено заказов: ${orders.length}`);
            return res.json(orders);
        }

        // Если нет параметров, возвращаем заказы с доставкой
        console.log('🔍 [DEBUG] Получен запрос на поиск заказов с доставкой');
        const orders = await db.getDeliveryOrders();
        console.log(`✅ [DEBUG] Найдено заказов с доставкой: ${orders.length}`);

        if (!orders || orders.length === 0) {
            console.log('⚠️ [DEBUG] Заказы с доставкой не найдены');
            return res.status(404).json({ error: 'Заказы с доставкой не найдены' });
        }

        console.log('📤 [DEBUG] Отправка заказов клиенту');
        res.json(orders);
    } catch (err) {
        console.error('❌ [DEBUG] Ошибка получения заказов:', err);
        res.status(500).json({ error: 'Ошибка получения заказов' });
    }
});

// Завершение заказа
app.post('/api/admin/orders/:orderId/complete', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const { orderId } = req.params;
        
        // Обновляем статус
        await db.updateOrderStatus(orderId, 'Завершён');
        
        // Логируем в аналитику
        await db.logOrderToAnalytics(orderId);
        
        console.log(`✅ [DEBUG] Заказ #${orderId} завершён`);
        res.json({ message: 'Заказ завершён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка завершения заказа' });
    }
});

// Добавление новой книги (только для администраторов)
app.post('/api/admin/books/add', async (req, res) => {
    try {
        console.log('📥 [DEBUG] Получен запрос на добавление книги');
        console.log('📥 [DEBUG] userType:', req.session.userType);
        console.log('📥 [DEBUG] userId:', req.session.userId);
        
        if (req.session.userType !== 'employee') {
            console.log('❌ [DEBUG] Доступ запрещен - пользователь не сотрудник');
            return res.status(403).json({ error: 'Доступ запрещен - требуется роль сотрудника' });
        }
        
        const { title, author, publisher, genre, year, pages, rating, description, price } = req.body;
        
        console.log('📥 [DEBUG] Получены данные книги:', { title, author, publisher, genre, year, pages, rating, description, price });
        
        // Валидация
        if (!title || price === null || price === undefined) {
            console.log('❌ [DEBUG] Ошибка валидации - отсутствует название или цена');
            return res.status(400).json({ error: 'Название и цена обязательны' });
        }
        
        // Добавляем автора если его нет
        let authorId = null;
        if (author) {
            const authorRes = await db.pool.query(
                `SELECT "AuthorID" FROM "Authors" WHERE "FullName" = $1`,
                [author]
            );
            
            if (authorRes.rows.length === 0) {
                console.log('➕ [DEBUG] Создаю нового автора:', author);
                const newAuthor = await db.addAuthor({
                    FullName: author,
                    Biography: null,
                    Country: null,
                    BirthDate: null
                });
                authorId = newAuthor.AuthorID;
                console.log('✅ [DEBUG] Автор создан с ID:', authorId);
            } else {
                authorId = authorRes.rows[0].AuthorID;
                console.log('✅ [DEBUG] Автор найден с ID:', authorId);
            }
        }
        
        // Добавляем издательство если его нет
        let publisherId = null;
        if (publisher) {
            const pubRes = await db.pool.query(
                `SELECT "PublisherID" FROM "Publishers" WHERE "Name" = $1`,
                [publisher]
            );
            
            if (pubRes.rows.length === 0) {
                console.log('➕ [DEBUG] Создаю новое издательство:', publisher);
                const newPub = await db.addPublisher({
                    Name: publisher,
                    Country: null,
                    Website: null,
                    ContactEmail: null
                });
                publisherId = newPub.PublisherID;
                console.log('✅ [DEBUG] Издательство создано с ID:', publisherId);
            } else {
                publisherId = pubRes.rows[0].PublisherID;
                console.log('✅ [DEBUG] Издательство найдено с ID:', publisherId);
            }
        }
        
        // Правильно обрабатываем числовые значения
        const yearValue = year && !isNaN(year) ? parseInt(year) : null;
        const pagesValue = pages && !isNaN(pages) ? parseInt(pages) : null;
        const ratingValue = rating && !isNaN(rating) ? parseFloat(rating) : 0;
        const priceValue = parseFloat(price);
        
        // Добавляем книгу
        console.log('📝 [DEBUG] Добавляю книгу с параметрами:', {
            title,
            authorId,
            publisherId,
            genre: genre || null,
            year: yearValue,
            pages: pagesValue,
            rating: ratingValue,
            description: description || null,
            price: priceValue
        });
        
        const book = await db.addBook({
            Title: title,
            AuthorID: authorId || null,
            PublisherID: publisherId || null,
            ISBN: null,
            Genre: genre || null,
            Price: priceValue,
            Stock: 0,
            Description: description || null,
            CoverURL: null,
            Year: yearValue,
            Pages: pagesValue,
            Rating: ratingValue
        });
        
        console.log('✅ [DEBUG] Книга успешно добавлена:', book);
        
        res.status(201).json({ 
            message: 'Книга успешно добавлена',
            bookId: book.BookID,
            book: book
        });
    } catch (err) {
        console.error('❌ [DEBUG] Ошибка добавления книги:', err);
        res.status(500).json({ error: 'Ошибка добавления книги: ' + err.message });
    }
});

// Удаление книги (только для администраторов)
app.delete('/api/admin/books/delete/:bookId', async (req, res) => {
    try {
        console.log('📥 [DEBUG] Получен запрос на удаление книги');
        console.log('📥 [DEBUG] userType:', req.session.userType);
        
        if (req.session.userType !== 'employee') {
            console.log('❌ [DEBUG] Доступ запрещен - пользователь не сотрудник');
            return res.status(403).json({ error: 'Доступ запрещен - требуется роль сотрудника' });
        }
        
        const { bookId } = req.params;
        
        if (!bookId || isNaN(bookId)) {
            console.log('❌ [DEBUG] Некорректный ID книги');
            return res.status(400).json({ error: 'Некорректный ID книги' });
        }
        
        console.log(`📝 [DEBUG] Удаляю книгу с ID: ${bookId}`);
        
        // Проверяем, существует ли книга
        const bookRes = await db.pool.query(
            `SELECT * FROM "Books" WHERE "BookID" = $1`,
            [bookId]
        );
        
        if (!bookRes.rows.length) {
            console.log(`❌ [DEBUG] Книга с ID ${bookId} не найдена`);
            return res.status(404).json({ error: 'Книга не найдена' });
        }
        
        const book = bookRes.rows[0];
        console.log(`📚 [DEBUG] Найдена книга для удаления: ${book.Title}`);
        
        // Удаляем книгу
        const deletedBook = await db.deleteBook(bookId);
        
        console.log(`✅ [DEBUG] Книга успешно удалена: ${deletedBook.Title}`);
        
        res.status(200).json({ 
            message: `Книга "${deletedBook.Title}" успешно удалена из базы данных`,
            bookId: deletedBook.BookID,
            bookTitle: deletedBook.Title
        });
    } catch (err) {
        console.error('❌ [DEBUG] Ошибка удаления книги:', err);
        res.status(500).json({ error: 'Ошибка удаления книги: ' + err.message });
    }
});

// Удаление книги по названию (только для администраторов)
app.delete('/api/admin/books/delete-by-title', async (req, res) => {
    try {
        console.log('📥 [DEBUG] Получен запрос на удаление книги по названию');
        console.log('📥 [DEBUG] userType:', req.session.userType);
        
        if (req.session.userType !== 'employee') {
            console.log('❌ [DEBUG] Доступ запрещен - пользователь не сотрудник');
            return res.status(403).json({ error: 'Доступ запрещен - требуется роль сотрудника' });
        }
        
        const { title } = req.body;
        
        if (!title || typeof title !== 'string' || title.trim() === '') {
            console.log('❌ [DEBUG] Некорректное название книги');
            return res.status(400).json({ error: 'Пожалуйста, введите название книги' });
        }
        
        const trimmedTitle = title.trim();
        console.log(`📝 [DEBUG] Ищу книгу для удаления: "${trimmedTitle}"`);
        
        // Проверяем, существует ли книга с таким названием
        const bookRes = await db.pool.query(
            `SELECT * FROM "Books" WHERE "Title" = $1`,
            [trimmedTitle]
        );
        
        if (!bookRes.rows.length) {
            console.log(`❌ [DEBUG] Книга с названием "${trimmedTitle}" не найдена`);
            return res.status(404).json({ error: `Книга с названием "${trimmedTitle}" не найдена в базе данных` });
        }
        
        const book = bookRes.rows[0];
        console.log(`📚 [DEBUG] Найдена книга для удаления: "${book.Title}" (ID: ${book.BookID})`);
        
        // Удаляем книгу
        const deletedBook = await db.deleteBookByTitle(trimmedTitle);
        
        console.log(`✅ [DEBUG] Книга успешно удалена: "${deletedBook.Title}"`);
        
        res.status(200).json({ 
            message: `Книга "${deletedBook.Title}" успешно удалена из базы данных`,
            bookId: deletedBook.BookID,
            bookTitle: deletedBook.Title
        });
    } catch (err) {
        console.error('❌ [DEBUG] Ошибка удаления книги:', err);
        res.status(500).json({ error: 'Ошибка удаления книги: ' + err.message });
    }
});

// API для аналитики (работает с таблицей Analytics)
app.get('/api/admin/analytics', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const period = req.query.period || 'day';
        let dateFrom, dateTo = new Date();

        // Определяем период
        switch (period) {
            case 'day':
                dateFrom = new Date(dateTo);
                dateFrom.setDate(dateFrom.getDate() - 1);
                break;
            case 'week':
                dateFrom = new Date(dateTo);
                dateFrom.setDate(dateFrom.getDate() - 7);
                break;
            case 'month':
                dateFrom = new Date(dateTo);
                dateFrom.setMonth(dateFrom.getMonth() - 1);
                break;
            case 'year':
                dateFrom = new Date(dateTo);
                dateFrom.setFullYear(dateFrom.getFullYear() - 1);
                break;
            default:
                dateFrom = new Date(dateTo);
                dateFrom.setDate(dateFrom.getDate() - 1);
        }

        console.log(`📊 [DEBUG] Аналитика за ${period}. Период: ${dateFrom.toISOString()} - ${dateTo.toISOString()}`);

        // Продано книг (из таблицы Analytics)
        const booksRes = await db.pool.query(`
            SELECT SUM("BookCount") as total FROM "Analytics"
            WHERE "CompletedDate" >= $1 AND "CompletedDate" <= $2
        `, [dateFrom, dateTo]);
        const booksSold = parseInt(booksRes.rows[0]?.total) || 0;
        console.log(`📚 [DEBUG] Продано книг: ${booksSold}`);

        // Новые клиенты
        const clientsRes = await db.pool.query(`
            SELECT COUNT(DISTINCT "ClientID") as total FROM "Analytics"
            WHERE "CompletedDate" >= $1 AND "CompletedDate" <= $2
        `, [dateFrom, dateTo]);
        const newClients = parseInt(clientsRes.rows[0]?.total) || 0;
        console.log(`👥 [DEBUG] Новых клиентов: ${newClients}`);

        // Прибыль (из таблицы Analytics)
        const revenueRes = await db.pool.query(`
            SELECT SUM("TotalAmount") as total FROM "Analytics"
            WHERE "CompletedDate" >= $1 AND "CompletedDate" <= $2
        `, [dateFrom, dateTo]);
        const revenue = parseFloat(revenueRes.rows[0]?.total) || 0;
        console.log(`💰 [DEBUG] Прибыль: ${revenue}`);

        // Завершённо заказов (из таблицы Analytics)
        const ordersRes = await db.pool.query(`
            SELECT COUNT(*) as total FROM "Analytics"
            WHERE "CompletedDate" >= $1 AND "CompletedDate" <= $2
        `, [dateFrom, dateTo]);
        const completedOrders = parseInt(ordersRes.rows[0]?.total) || 0;
        console.log(`📦 [DEBUG] Завершено заказов: ${completedOrders}`);

        // Популярная книга (из OrderItems + Analytics)
        const popularRes = await db.pool.query(`
            SELECT b."Title", SUM(oi."Quantity") as total 
            FROM "OrderItems" oi
            JOIN "Books" b ON oi."BookID" = b."BookID"
            JOIN "Analytics" a ON oi."OrderID" = a."OrderID"
            WHERE a."CompletedDate" >= $1 AND a."CompletedDate" <= $2
            GROUP BY b."BookID", b."Title"
            ORDER BY total DESC
            LIMIT 1
        `, [dateFrom, dateTo]);
        const popularBook = popularRes.rows[0]?.Title || '-';
        console.log(`⭐ [DEBUG] Популярная книга: ${popularBook}`);

        // Средний чек (из таблицы Analytics)
        const avgCheckRes = await db.pool.query(`
            SELECT AVG("TotalAmount") as avg FROM "Analytics"
            WHERE "CompletedDate" >= $1 AND "CompletedDate" <= $2
        `, [dateFrom, dateTo]);
        const avgCheck = avgCheckRes.rows[0]?.avg ? Math.round(parseFloat(avgCheckRes.rows[0].avg) * 100) / 100 : 0;
        console.log(`🎯 [DEBUG] Средний чек: ${avgCheck}`);

        console.log(`💳 [DEBUG] Завершено заказов в периоде: ${completedOrders}`);

        res.json({
            booksSold,
            newClients,
            revenue: Math.round(revenue * 100) / 100,
            completedOrders,
            popularBook,
            avgCheck,
            period,
            dateFrom: dateFrom.toISOString().split('T')[0],
            dateTo: dateTo.toISOString().split('T')[0]
        });

    } catch (err) {
        console.error('❌ Ошибка получения аналитики:', err);
        res.status(500).json({ error: 'Ошибка получения аналитики: ' + err.message });
    }
});

// Скачивание отчёта - ВАЖНО: должен быть ДО fallback маршрута!
app.post('/api/admin/analytics/download', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const { period, data } = req.body;

        try {
            // Создаём простой но валидный DOCX
            const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>АНАЛИТИЧЕСКИЙ ОТЧЁТ</w:t></w:r></w:p>
    <w:p><w:r><w:t/></w:r></w:p>
    <w:p><w:r><w:t>Период: ${period === 'day' ? 'День' : period === 'week' ? 'Неделя' : period === 'month' ? 'Месяц' : 'Год'}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Дата создания: ${new Date().toLocaleDateString('ru-RU')}</w:t></w:r></w:p>
    <w:p><w:r><w:t/></w:r></w:p>
    <w:p><w:r><w:t>ОСНОВНЫЕ ПОКАЗАТЕЛИ:</w:t></w:r></w:p>
    <w:p><w:r><w:t/></w:r></w:p>
    <w:p><w:r><w:t>Продано книг: ${data.booksSold}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Новых клиентов: ${data.newClients}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Прибыль: ${data.revenue} BYN</w:t></w:r></w:p>
    <w:p><w:r><w:t>Завершённо заказов: ${data.completedOrders}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Популярная книга: ${data.popularBook}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Средний чек: ${data.avgCheck} BYN</w:t></w:r></w:p>
    <w:p><w:r><w:t/></w:r></w:p>
    <w:p><w:r><w:t>Период анализа: с ${data.dateFrom} по ${data.dateTo}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Отчёт создан: ${new Date().toLocaleString('ru-RU')}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

            const relationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

            const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

            const JSZip = require('jszip');
            const zip = new JSZip();
            
            zip.file('[Content_Types].xml', contentTypesXml);
            zip.folder('_rels').file('.rels', relationshipsXml);
            zip.folder('word').file('document.xml', documentXml);
            
            const docContent = await zip.generateAsync({ type: 'nodebuffer' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="analytics_${period}_${new Date().toISOString().split('T')[0]}.docx"`);
            res.send(docContent);

        } catch (err) {
            console.error('❌ Ошибка создания DOCX:', err);
            res.status(500).json({ error: 'Ошибка создания отчёта' });
        }

    } catch (err) {
        console.error('❌ Ошибка скачивания аналитики:', err);
        res.status(500).json({ error: 'Ошибка скачивания аналитики: ' + err.message });
    }
});

// НОВОЕ: Отправка email о готовности к доставке
// НОВОЕ: Отправка email о готовности к доставке — РАБОЧАЯ ВЕРСИЯ
app.post('/api/admin/orders/send-delivery-email', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const { orderId, items } = req.body;
        if (!orderId || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Неверные параметры' });
        }

        // 1. Получаем заказ с данными клиента
        const orderQuery = await db.pool.query(
            `SELECT o."ClientID", o."TotalAmount", c."Email", c."FullName" 
             FROM "Orders" o 
             JOIN "Clients" c ON o."ClientID" = c."ClientID" 
             WHERE o."OrderID" = $1`,
            [orderId]
        );

        if (orderQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        const { Email: clientEmail, FullName: clientName, TotalAmount } = orderQuery.rows[0];

        if (!clientEmail) {
            return res.json({ 
                message: 'Заказ готов к доставке', 
                warning: 'У клиента не указан email — письмо не отправлено' 
            });
        }

        // 2. Формируем красивый HTML текст письма
        const itemsHtml = items.map(item => 
            `<li style="margin: 8px 0;">• ${item.Title} — ${item.Quantity} шт.</li>`
        ).join('');

        const htmlEmail = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #2c3e50;">Здравствуйте, ${clientName || 'дорогой покупатель'}!</h2>
                <p>Ваш заказ <strong>#${orderId}</strong> собран и готов к доставке</p>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Состав заказа:</h3>
                    <ul style="padding-left: 20px;">${itemsHtml}</ul>
                    <p style="font-size: 18px; font-weight: bold; text-align: right;">
                        Итого: ${TotalAmount} BYN
                    </p>
                </div>

                <p>Мы свяжемся с вами в ближайшее время для уточнения времени доставки.</p>
                <p>Спасибо за покупку в <strong>BookStore</strong>!</p>
                
                <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;">
                <p style="color: #7f8c8d; font-size: 12px;">
                    Это автоматическое письмо. Пожалуйста, не отвечайте на него.
                </p>
            </div>
        `;

        const plainText = `Здравствуйте, ${clientName || 'дорогой покупатель'}!\n\nВаш заказ #${orderId} готов к доставке.\nСумма: ${TotalAmount} BYN\n\nСпасибо за покупку!`;

        // 3. Отправляем через Gmail API
        const emailResult = await sendEmailViaGmail(
            clientEmail,
            `Заказ #${orderId} готов к доставке`,
            plainText,
            htmlEmail
        );

        if (emailResult) {
            console.log(`Письмо успешно отправлено клиенту ${clientEmail} по заказу #${orderId}`);
            return res.json({ message: 'Письмо успешно отправлено клиенту' });
        } else {
            console.warn(`Письмо НЕ отправлено по заказу #${orderId} (Gmail API вернул null)`);
            return res.json({ 
                message: 'Заказ готов к доставке', 
                warning: 'Письмо не отправлено — временная проблема с Gmail' 
            });
        }

    } catch (err) {
        console.error('Критическая ошибка в send-delivery-email:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// Функция отправки email через Gmail (с использованием переменных окружения)
// РАБОЧАЯ ВЕРСИЯ — НИКОГДА НЕ УБЬЁТ СЕРВЕР И РАБОТАЕТ НА 465
// === НОВАЯ ФУНКЦИЯ — ОТПРАВКА ЧЕРЕЗ GMAIL API (100% работает всегда) ===
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);

// Устанавливаем refresh token один раз
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

async function sendEmailViaGmail(to, subject, text, html = '') {
    try {
        // Получаем свежий access_token
        const { token } = await oauth2Client.getAccessToken();
        if (!token) {
            console.error('Не удалось получить access_token от Google');
            return null;
        }

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Формируем сырой MIME-сообщение
        const raw = Buffer.from(
            `From: "BookStore" <${process.env.GMAIL_USER}>\n` +
            `To: ${to}\n` +
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\n` +
            `Content-Type: text/html; charset=utf-8\n` +
            `Content-Transfer-Encoding: base64\n\n` +
            `${Buffer.from(html || text).toString('base64')}`
        ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: raw
            }
        });

        console.log(`Email отправлен через Gmail API: ${res.data.id}`);
        return res.data;

        } catch (err) {
        console.error('Ошибка Gmail API:', err.message);
        if (err.response?.data) console.error('Детали ошибки:', err.response.data);
        return null;
    }
}

app.use(express.static(path.join(__dirname)));

// --- Fallback SPA ---
app.use((req,res)=>{
    if(req.path.startsWith("/api")) return res.status(404).json({ error: "API endpoint not found" });
    res.render('index.ejs', { clientId: req.session.clientId || null });
});

// --- Запуск сервера ---
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));