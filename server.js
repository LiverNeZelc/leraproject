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
app.get('/account_main', (req, res) => {
    res.render('index.ejs'); // просто рендерим EJS страницу
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
    // Если уже есть ClientID в сессии
    if (req.session.clientId) return req.session.clientId;
    // Создаём гостевого клиента
    const guest = await db.addClient({
        FullName: 'Гость',
        Email: null,
        Phone: null,
        Address: null
    });
    req.session.clientId = guest.ClientID;
    return req.session.clientId;
}

app.get("/api/cart", async (req, res) => {
    try {
        const clientId = await getSessionClientId(req);
        const cart = await db.getCartByClient(clientId);
        res.json(cart);
    } catch(err) {
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
        console.error(err);
        res.status(500).json({ error: "Ошибка удаления из корзины" });
    }
});

// --- API для карт (GET и POST — без дубликатов) ---
app.get("/api/cards", async (req, res) => {
    try {
        const clientId = await getSessionClientId(req);
        const user = await db.getClientById(clientId);
        if (!user || !user.Email) return res.status(401).json({ error: "Авторизуйтесь" });
        const cards = await cardsDb.getCardsByClient(clientId);
        res.status(200).json(cards || []);  // Явно 200 + пустой массив если нет
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка получения карт" });
    }
});

app.post("/api/cards", async (req, res) => {
    try {
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
        const { phone, address, delivery, cardId, total } = req.body;
        const clientId = await getSessionClientId(req);
        const user = await db.getClientById(clientId);
        if (!user || !user.Email) return res.status(401).json({ error: "Авторизуйтесь для заказа" });  // Исправлено

        // Проверка карты
        const card = await cardsDb.getCardById(cardId);
        if (!card) return res.status(400).json({ error: "Карта не найдена" });
        if (card.Balance < total) return res.status(400).json({ error: "Недостаточно средств на карте" });

        // Создание заказа (без phone/address)
        const order = await db.createOrder(clientId, null, total, "Новый");

        // Добавление items из корзины (исправить: перед clear)
        const cartBeforeClear = await db.getCartByClient(clientId);
        await db.addOrderItems(order.OrderID, cartBeforeClear); // Новое

        // Добавление доставки (с phone)
        let deliveryMethod = 'Самовывоз';
        let status = 'Оплачен, ожидает получения';
        switch (delivery) {
            case '3km': deliveryMethod = 'Доставка 3км'; status = 'Оплачен, ожидается доставка'; break;
            case '5km': deliveryMethod = 'Доставка 5км'; status = 'Оплачен, ожидается доставка'; break;
            case 'over5km': deliveryMethod = 'Доставка >5км'; status = 'Оплачен, ожидается доставка'; break;
        }
        await db.addDelivery(order.OrderID, deliveryMethod, address, 'Ожидает', null, null, phone); // + phone

        // Списание с карты (исправить: после проверки)
        await cardsDb.updateCardBalance(cardId, card.Balance - total);

        // Обновление статуса
        await db.updateOrderStatus(order.OrderID, status);

        // Очистка корзины
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
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Все поля обязательны" });
        const client = await db.authenticateClient(email, password);
        if (!client) return res.status(401).json({ error: "Неверный email или пароль" });
        // Сохранение старой корзины гостя
        const oldClientId = req.session.clientId;
        req.session.clientId = client.ClientID;
        // Слияние корзины гостя
        if (oldClientId && oldClientId !== client.ClientID) {
            await db.mergeCarts(oldClientId, client.ClientID);
            await db.clearCart(oldClientId); // Опционально
        }
        res.json({ message: "Вход успешен", clientId: client.ClientID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка входа" });
    }
});

// --- Получить текущего клиента ---
// api/me
app.get("/api/me", async (req,res)=>{
    try {
        if (!req.session.clientId) return res.status(401).json({ error: "Not authorized" });
        const client = await db.getClientById(req.session.clientId);
        // Гость = Email null → значит не авторизован настоящий
        const isGuest = !client.Email;
        res.json({ ...client, isGuest });
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
        const clientId = await getSessionClientId(req);
        console.log('Fetching current orders for clientId:', clientId);  // Logging для дебага
        
        // Raw query с LIKE
        const ordersResult = await db.pool.query(
            `SELECT * FROM "Orders" WHERE "ClientID"=$1 AND "Status" LIKE $2`,
            [clientId, 'Оплачен%']
        );
        const orders = ordersResult.rows;
        console.log('Found orders:', orders.length);  // Logging
        
        // Добавляем items с try-catch на каждый order (fallback на [] если ошибка)
        const ordersWithItems = await Promise.all(orders.map(async (o) => {
            try {
                const items = await db.getOrderItems(o.OrderID);
                return { ...o, Items: items || [] };
            } catch (itemErr) {
                console.error('Error loading items for order', o.OrderID, itemErr);
                return { ...o, Items: [] };  // Fallback
            }
        }));
        
        res.status(200).json(ordersWithItems);  // Всегда 200, даже если пусто
    } catch (err) {
        console.error('Full error in /api/orders/current:', err);  // Полный лог
        res.status(500).json({ error: "Ошибка загрузки заказов" });
    }
});

app.get("/api/orders/history", async (req, res) => {
    try {
        const clientId = await getSessionClientId(req);
        console.log('Fetching history orders for clientId:', clientId);  // Logging
        
        const ordersResult = await db.pool.query(
            `SELECT * FROM "Orders" WHERE "ClientID"=$1 AND "Status" = $2 ORDER BY "OrderDate" DESC`,
            [clientId, 'Завершён']
        );
        const orders = ordersResult.rows;
        console.log('Found history orders:', orders.length);  // Logging
        
        // Добавляем Items для каждого заказа (fallback на [])
        const ordersWithItems = await Promise.all(orders.map(async (o) => {
            try {
                const items = await db.getOrderItems(o.OrderID);
                return { ...o, Items: items || [] };
            } catch (itemErr) {
                console.error('Error loading items for history order', o.OrderID, itemErr);
                return { ...o, Items: [] };
            }
        }));
        
        res.status(200).json(ordersWithItems);
    } catch (err) {
        console.error('Full error in /api/orders/history:', err);
        res.status(500).json({ error: "Ошибка загрузки истории" });
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