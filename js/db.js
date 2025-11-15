// db.js
// Работа с PostgreSQL для книжного магазина

const { Pool } = require('pg');

// --- Настройка подключения ---
const pool = new Pool({
    user: 'postgres',        // ваш пользователь
    host: 'localhost',
    database: 'BookShopDatabase', 
    password: 'password',    // пароль вашей БД
    port: 5432,
});

// --- Инициализация базы данных ---
async function initDB() {
    const client = await pool.connect();
    try {
        console.log('⏳ Initializing database...');
        await client.query('BEGIN');

        // Авторы
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Authors" (
            "AuthorID" SERIAL PRIMARY KEY,
            "FullName" VARCHAR(255) NOT NULL,
            "Biography" TEXT,
            "Country" VARCHAR(100),
            "BirthDate" DATE
        );`);

        // Издательства
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Publishers" (
            "PublisherID" SERIAL PRIMARY KEY,
            "Name" VARCHAR(255) NOT NULL,
            "Country" VARCHAR(100),
            "Website" VARCHAR(255),
            "ContactEmail" VARCHAR(255)
        );`);

        // Клиенты
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Clients" (
            "ClientID" SERIAL PRIMARY KEY,
            "FullName" VARCHAR(255) NOT NULL,
            "Email" VARCHAR(255),
            "Phone" VARCHAR(50),
            "Address" TEXT,
            "RegistrationDate" DATE DEFAULT CURRENT_DATE,
            "IsActive" BOOLEAN DEFAULT TRUE
        );`);

        // Сотрудники
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Employees" (
            "EmployeeID" SERIAL PRIMARY KEY,
            "FullName" VARCHAR(255) NOT NULL,
            "Email" VARCHAR(255),
            "Role" VARCHAR(100),
            "HireDate" DATE,
            "IsActive" BOOLEAN DEFAULT TRUE
        );`);

        // Заказы
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Orders" (
            "OrderID" SERIAL PRIMARY KEY,
            "ClientID" INT REFERENCES "Clients"("ClientID"),
            "EmployeeID" INT REFERENCES "Employees"("EmployeeID"),
            "OrderDate" DATE DEFAULT CURRENT_DATE,
            "TotalAmount" DECIMAL(10,2) CHECK ("TotalAmount" >= 0),
            "Status" VARCHAR(50)
        );`);

        // Книги
        // Книги
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Books" (
            "BookID" SERIAL PRIMARY KEY,
            "Title" VARCHAR(255) NOT NULL,
            "AuthorID" INT REFERENCES "Authors"("AuthorID"),
            "PublisherID" INT REFERENCES "Publishers"("PublisherID"),
            "ISBN" VARCHAR(20) UNIQUE,
            "Genre" VARCHAR(100),
            "Price" DECIMAL(10,2) CHECK ("Price" >= 0),
            "Stock" INT DEFAULT 0 CHECK ("Stock" >= 0),
            "Description" TEXT,
            "CoverURL" VARCHAR(255),
            "Year" INT,
            "Pages" INT,
            "Rating" NUMERIC(2,1) DEFAULT 0
        );
        `);


        // Корзина
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Carts" (
            "CartID" SERIAL PRIMARY KEY,
            "ClientID" INT REFERENCES "Clients"("ClientID"),
            "BookID" INT REFERENCES "Books"("BookID"),
            "Quantity" INT CHECK ("Quantity" > 0),
            "AddedDate" DATE DEFAULT CURRENT_DATE
        );`);

        // Доставка
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Deliveries" (
            "DeliveryID" SERIAL PRIMARY KEY,
            "OrderID" INT REFERENCES "Orders"("OrderID"),
            "DeliveryMethod" VARCHAR(100),
            "DeliveryAddress" TEXT,
            "DeliveryStatus" VARCHAR(50),
            "EstimatedDate" DATE,
            "ActualDate" DATE
        );`);

        await client.query('COMMIT');
        console.log('✅ Database initialized successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing database:', err);
    } finally {
        client.release();
    }
}


// --- Функции работы с БД ---

// Авторы
async function getAllAuthors() {
    const res = await pool.query('SELECT * FROM "Authors" ORDER BY "FullName"');
    return res.rows;
}
async function getAuthorById(id) {
    const res = await pool.query('SELECT * FROM "Authors" WHERE "AuthorID"=$1', [id]);
    return res.rows[0];
}
async function addAuthor(author) {
    const { FullName, Biography, Country, BirthDate } = author;
    const res = await pool.query(
        `INSERT INTO "Authors" ("FullName","Biography","Country","BirthDate") VALUES ($1,$2,$3,$4) RETURNING *`,
        [FullName, Biography, Country, BirthDate]
    );
    return res.rows[0];
}

// Издательства
async function getAllPublishers() {
    const res = await pool.query('SELECT * FROM "Publishers" ORDER BY "Name"');
    return res.rows;
}
async function addPublisher(pub) {
    const { Name, Country, Website, ContactEmail } = pub;
    const res = await pool.query(
        `INSERT INTO "Publishers" ("Name","Country","Website","ContactEmail") VALUES ($1,$2,$3,$4) RETURNING *`,
        [Name, Country, Website, ContactEmail]
    );
    return res.rows[0];
}

// Книги
// Получить все книги с данными автора и издателя
async function getAllBooks() {
    const res = await pool.query(`
        SELECT 
            b."BookID",
            b."Title",
            b."AuthorID",
            b."PublisherID",
            b."ISBN",
            b."Genre",
            b."Price",
            b."Stock",
            b."Description",
            b."CoverURL",
            b."Year",
            b."Pages",
            b."Rating",
            a."FullName" AS "AuthorName",
            p."Name" AS "PublisherName"
        FROM "Books" b
        LEFT JOIN "Authors" a ON b."AuthorID" = a."AuthorID"
        LEFT JOIN "Publishers" p ON b."PublisherID" = p."PublisherID"
        ORDER BY b."Title"
    `);
    return res.rows;
}


async function getBookById(id) {
    const res = await pool.query(`
        SELECT b.*, a."FullName" AS "AuthorName", p."Name" AS "PublisherName"
        FROM "Books" b
        LEFT JOIN "Authors" a ON b."AuthorID" = a."AuthorID"
        LEFT JOIN "Publishers" p ON b."PublisherID" = p."PublisherID"
        WHERE b."BookID" = $1
    `, [id]);
    return res.rows[0];
}

async function addBook(book) {
    const { Title, AuthorID, PublisherID, ISBN, Genre, Price, Stock, Description, CoverURL } = book;
    const res = await pool.query(
        `INSERT INTO "Books" ("Title","AuthorID","PublisherID","ISBN","Genre","Price","Stock","Description","CoverURL")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [Title, AuthorID, PublisherID, ISBN, Genre, Price, Stock, Description, CoverURL]
    );
    return res.rows[0];
}

// Клиенты
async function getClientById(id) {
    const res = await pool.query('SELECT * FROM "Clients" WHERE "ClientID"=$1', [id]);
    return res.rows[0];
}
async function addClient(client) {
    const { FullName, Email, Phone, Address } = client;
    const res = await pool.query(
        `INSERT INTO "Clients" ("FullName","Email","Phone","Address") VALUES ($1,$2,$3,$4) RETURNING *`,
        [FullName, Email, Phone, Address]
    );
    return res.rows[0];
}

// Корзина
async function getCartByClient(clientId) {
    const res = await pool.query(
        `SELECT c."CartID", c."BookID", c."Quantity", b."Title", b."Price", a."FullName" AS "AuthorName"
         FROM "Carts" c
         JOIN "Books" b ON c."BookID" = b."BookID"
         LEFT JOIN "Authors" a ON b."AuthorID" = a."AuthorID"
         WHERE c."ClientID" = $1`,
        [clientId]
    );

    return res.rows.map(r => ({
        CartID: r.CartID,
        BookID: r.BookID,
        Quantity: r.Quantity ? parseInt(r.Quantity, 10) : 1,
        Title: r.Title || "Без названия",
        AuthorName: r.AuthorName || "Неизвестно",
        Price: r.Price !== null && r.Price !== undefined ? parseFloat(r.Price) : 0
    }));
}





async function addToCart(clientId, bookId, quantity = 1) {
    const existing = await pool.query(
        `SELECT * FROM "Carts" WHERE "ClientID"=$1 AND "BookID"=$2`,
        [clientId, bookId]
    );
    if (existing.rows.length) {
        const newQty = existing.rows[0].Quantity + quantity;
        await pool.query(`UPDATE "Carts" SET "Quantity"=$1 WHERE "CartID"=$2`, [newQty, existing.rows[0].CartID]);
    } else {
        await pool.query(`INSERT INTO "Carts" ("ClientID","BookID","Quantity") VALUES ($1,$2,$3)`, [clientId, bookId, quantity]);
    }
}
async function removeFromCart(clientId, bookId) {
    await pool.query(`DELETE FROM "Carts" WHERE "ClientID"=$1 AND "BookID"=$2`, [clientId, bookId]);
}
async function clearCart(clientId) {
    await pool.query(`DELETE FROM "Carts" WHERE "ClientID"=$1`, [clientId]);
}

// Заказы
async function createOrder(clientId, employeeId, totalAmount, status='Новый') {
    const res = await pool.query(
        `INSERT INTO "Orders" ("ClientID","EmployeeID","TotalAmount","Status")
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [clientId, employeeId, totalAmount, status]
    );
    return res.rows[0];
}
async function getOrdersByClient(clientId) {
    const res = await pool.query(`SELECT * FROM "Orders" WHERE "ClientID"=$1`, [clientId]);
    return res.rows;
}

// Доставка
async function addDelivery(orderId, method, address, status='Ожидает', estimatedDate=null, actualDate=null) {
    const res = await pool.query(
        `INSERT INTO "Deliveries" ("OrderID","DeliveryMethod","DeliveryAddress","DeliveryStatus","EstimatedDate","ActualDate")
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [orderId, method, address, status, estimatedDate, actualDate]
    );
    return res.rows[0];
}

// --- Экспортируем ---
module.exports = {
    pool,
    initDB,
    getAllAuthors, getAuthorById, addAuthor,
    getAllPublishers, addPublisher,
    getAllBooks, getBookById, addBook,
    getClientById, addClient,
    getCartByClient, addToCart, removeFromCart, clearCart,
    createOrder, getOrdersByClient,
    addDelivery
};
