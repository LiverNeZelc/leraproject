// server.js
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const db = require('./js/db');

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
  cookie: { httpOnly: true, secure: false, maxAge: 1000*60*60*24 }
}));

// --- Инициализация БД ---
(async () => {
    await db.initDB();
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


// Checkout
app.post("/api/checkout", async (req,res)=>{
    try {
        const clientId = await getSessionClientId(req); // ✅ добавили await
        const cart = await db.getCartByClient(clientId);
        if (!cart.length) return res.status(400).json({ error: "Корзина пуста" });

        const total = cart.reduce((s,i)=>s + i.Price*i.Quantity, 0);
        const order = await db.createOrder(clientId, null, total, "Новый");
        await db.clearCart(clientId);

        res.json({ message: "Заказ оформлен", total });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка оформления заказа" });
    }
});

app.use(express.static(path.join(__dirname)));

// --- Fallback SPA ---
app.use((req,res)=>{
    if(req.path.startsWith("/api")) return res.status(404).json({ error: "API endpoint not found" });
    res.sendFile(path.join(__dirname, "index.html"));
});

// --- Запуск сервера ---
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
