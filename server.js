const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const db = require('./js/db');
const cardsDb = require('./js/cardsdb'); // Новый модуль для карт
const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(helmet());
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
        // Доступ только для зарегистрированных клиентов
        if (req.session.userType !== 'client') {
            return res.status(403).json({ error: "Доступ запрещен" });
        }

        const clientId = await getSessionClientId(req);
        const user = await db.getClientById(clientId);

        // Гость не может оформить заказ
        if (!user || !user.Email) {
            return res.status(403).json({ error: "Гостям запрещено оформлять заказ" });
        }

        const { phone, address, delivery, cardId, total } = req.body;

        // Проверка карты
        const card = await cardsDb.getCardById(cardId);
        if (!card) return res.status(400).json({ error: "Карта не найдена" });
        if (card.Balance < total) return res.status(400).json({ error: "Недостаточно средств на карте" });

        // Создание заказа
        const order = await db.createOrder(clientId, null, total, "Новый");
        const cartBeforeClear = await db.getCartByClient(clientId);
        await db.addOrderItems(order.OrderID, cartBeforeClear);

        // Доставка
        let deliveryMethod = 'Самовывоз';
        let status = 'Оплачен, ожидает получения';
        switch (delivery) {
            case '3km': deliveryMethod = 'Доставка 3км'; status = 'Оплачен, ожидается доставка'; break;
            case '5km': deliveryMethod = 'Доставка 5км'; status = 'Оплачен, ожидается доставка'; break;
            case 'over5km': deliveryMethod = 'Доставка >5км'; status = 'Оплачен, ожидается доставка'; break;
        }
        await db.addDelivery(order.OrderID, deliveryMethod, address, 'Ожидает', null, null, phone);

        // Списываем с карты
        await cardsDb.updateCardBalance(cardId, card.Balance - total);

        // Обновляем статус
        await db.updateOrderStatus(order.OrderID, status);

        // Очищаем корзину
        await db.clearCart(clientId);

        res.json({
            message: "Заказ оформлен",
            orderId: order.OrderID,
            items: cartBeforeClear.map(item => ({ Title: item.Title, Quantity: item.Quantity, Price: item.Price }))
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка создания заказа" });
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
        res.status(500).json({ error: "Ошибка загрузки заказов" });
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

// Поиск заказов по номеру телефона
app.get('/api/admin/orders', async (req, res) => {
    try {
        if (req.session.userType !== 'employee') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const { phone } = req.query;
        if (!phone) {
            return res.status(400).json({ error: 'Номер телефона обязателен' });
        }

        console.log(`Поиск заказов по номеру телефона: ${phone}`); // Логируем номер телефона для отладки

        // Используем функцию getOrdersByPhone из db.js
        const orders = await db.getOrdersByPhonePartial(phone, 'Оплачен, ожидает получения');
        if (!orders || orders.length === 0) {
            console.log(`Заказы не найдены для номера: ${phone}`); // Логируем отсутствие заказов
            return res.status(404).json({ error: 'Заказы не найдены' });
        }

        console.log(`Найдено заказов: ${orders.length}`); // Логируем количество найденных заказов
        res.json(orders);
    } catch (err) {
        console.error('Ошибка получения заказов:', err);
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
        await db.updateOrderStatus(orderId, 'Завершён');
        res.json({ message: 'Заказ завершён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка завершения заказа' });
    }
});

app.use(express.static(path.join(__dirname)));

// --- Fallback SPA ---
app.use((req,res)=>{
    if(req.path.startsWith("/api")) return res.status(404).json({ error: "API endpoint not found" });
    // Передаем clientId (если есть) в шаблон
    res.render('index.ejs', { clientId: req.session.clientId || null });
});



// --- Запуск сервера ---
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));