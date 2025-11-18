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
        "Email" VARCHAR(255) UNIQUE,
        "PasswordHash" VARCHAR(255),    -- для хранения хеша пароля
        "Phone" VARCHAR(50),
        "Address" TEXT,
        "RegistrationDate" DATE DEFAULT CURRENT_DATE,
        "IsActive" BOOLEAN DEFAULT TRUE
    );
`);

        // Сотрудники
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Employees" (
            "EmployeeID" SERIAL PRIMARY KEY,
            "FullName" VARCHAR(255) NOT NULL,
            "Email" VARCHAR(255),
            "PasswordHash" VARCHAR(255), 
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
            "ActualDate" DATE,
            "Phone" VARCHAR(50)
        );`);

        await client.query(`
    CREATE TABLE IF NOT EXISTS "OrderItems" (
        "ItemID" SERIAL PRIMARY KEY,
        "OrderID" INT REFERENCES "Orders"("OrderID"),
        "BookID" INT REFERENCES "Books"("BookID"),
        "Quantity" INT,
        "Price" DECIMAL(10,2)
    );
`);

        // НОВАЯ ТАБЛИЦА ДЛЯ АНАЛИТИКИ
        await client.query(`
        CREATE TABLE IF NOT EXISTS "Analytics" (
            "AnalyticsID" SERIAL PRIMARY KEY,
            "OrderID" INT NOT NULL,
            "ClientID" INT REFERENCES "Clients"("ClientID"),
            "TotalAmount" DECIMAL(10,2),
            "DeliveryMethod" VARCHAR(100),
            "CompletedDate" DATE DEFAULT CURRENT_DATE,
            "BookCount" INT,
            "Status" VARCHAR(50)
        );
        CREATE INDEX IF NOT EXISTS "idx_analytics_completed_date" ON "Analytics"("CompletedDate");
        `);

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
    const { Title, AuthorID, PublisherID, ISBN, Genre, Price, Stock, Description, CoverURL, Year, Pages, Rating } = book;
    const res = await pool.query(
        `INSERT INTO "Books" ("Title","AuthorID","PublisherID","ISBN","Genre","Price","Stock","Description","CoverURL","Year","Pages","Rating")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [Title, AuthorID, PublisherID, ISBN, Genre, Price, Stock, Description, CoverURL, Year, Pages, Rating]
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

// Доставка

async function addDelivery(orderId, method, address, status='Ожидает', estimatedDate=null, actualDate=null, phone=null) {
    const res = await pool.query(
        `INSERT INTO "Deliveries" ("OrderID","DeliveryMethod","DeliveryAddress","DeliveryStatus","EstimatedDate","ActualDate","Phone")
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [orderId, method, address, status, estimatedDate, actualDate, phone]
    );
    return res.rows[0];
}

const bcrypt = require('bcrypt');

// Регистрация клиента
async function registerClient({ FullName, Email, Password, Phone=null, Address=null }) {
    const hash = await bcrypt.hash(Password, 10);
    const res = await pool.query(
        `INSERT INTO "Clients" ("FullName","Email","PasswordHash","Phone","Address") 
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [FullName, Email, hash, Phone, Address]
    );
    return res.rows[0];
}

// Авторизация клиента
async function authenticateClient(Email, Password) {
    const res = await pool.query(`SELECT * FROM "Clients" WHERE "Email"=$1`, [Email]);
    const client = res.rows[0];
    if (!client) return null;

    const match = await bcrypt.compare(Password, client.PasswordHash);
    return match ? client : null;
}

// Получить клиента по Email
async function getClientByEmail(Email) {
    const res = await pool.query(`SELECT * FROM "Clients" WHERE "Email"=$1`, [Email]);
    return res.rows[0];
}


async function getOrdersByClient(clientId, status=null) {
    let query = `SELECT * FROM "Orders" WHERE "ClientID"=$1`;
    let params = [clientId];
    if (status) {
        query += ` AND "Status"=$2`;
        params.push(status);
    }
    const res = await pool.query(query, params);
    return res.rows;
}

async function getOrdersByPhone(phone, status) {
    console.log(`Вызов getOrdersByPhone с номером: ${phone}`); // Логируем входной номер телефона

    const query = `
        SELECT o."OrderID", c."FullName" AS "ClientName", d."Phone", o."Status", o."OrderDate",
               (SELECT json_agg(json_build_object('Title', b."Title", 'Quantity', oi."Quantity"))
                FROM "OrderItems" oi
                JOIN "Books" b ON oi."BookID" = b."BookID"
                WHERE oi."OrderID" = o."OrderID") AS "Items"
        FROM "Orders" o
        JOIN "Deliveries" d ON o."OrderID" = d."OrderID"
        JOIN "Clients" c ON o."ClientID" = c."ClientID"
        WHERE REGEXP_REPLACE(d."Phone", '[^0-9]', '', 'g') = $1 AND o."Status" = $2
        ORDER BY o."OrderDate" DESC
    `;

    

    const res = await pool.query(query, [phone.replace(/\D/g, ''), status]);

    console.log(`Найдено заказов: ${res.rows.length}`); // Логируем количество найденных заказов
    return res.rows;
}

async function getOrdersByPhonePartial(phone, status) {
    console.log(`Вызов getOrdersByPhonePartial с номером: ${phone}`); // Логируем входной номер телефона

    const query = `
        SELECT o."OrderID", c."FullName" AS "ClientName", d."Phone", o."Status", o."OrderDate",
               (SELECT json_agg(json_build_object('Title', b."Title", 'Quantity', oi."Quantity"))
                FROM "OrderItems" oi
                JOIN "Books" b ON oi."BookID" = b."BookID"
                WHERE oi."OrderID" = o."OrderID") AS "Items"
        FROM "Orders" o
        JOIN "Deliveries" d ON o."OrderID" = d."OrderID"
        JOIN "Clients" c ON o."ClientID" = c."ClientID"
        WHERE REGEXP_REPLACE(d."Phone", '[^0-9]', '', 'g') LIKE $1 AND o."Status" = $2
        ORDER BY o."OrderDate" DESC
    `;

  

    const res = await pool.query(query, [`%${phone.replace(/\D/g, '')}%`, status]);

    console.log(`Найдено заказов: ${res.rows.length}`); // Логируем количество найденных заказов
    return res.rows;
}

// Новая функция слияния корзин
async function mergeCarts(oldClientId, newClientId) {
    const oldCart = await getCartByClient(oldClientId);
    for (const item of oldCart) {
        await addToCart(newClientId, item.BookID, item.Quantity);
    }
}

async function getOrderItems(orderId) {
    try {
        console.log('Loading items for orderId:', orderId);  // Logging
        const res = await pool.query(`
            SELECT oi."ItemID", oi."Quantity", oi."Price",
                   COALESCE(b."Title", 'Неизвестная книга') AS "Title"
            FROM "OrderItems" oi
            LEFT JOIN "Books" b ON oi."BookID" = b."BookID"  -- LEFT JOIN для fallback
            WHERE oi."OrderID" = $1
        `, [orderId]);
        return res.rows.map(row => ({
            Title: row.Title,
            Quantity: parseInt(row.Quantity),
            Price: parseFloat(row.Price)
        }));
    } catch (err) {
        console.error('Error in getOrderItems for orderId', orderId, ':', err);
        return [];
    }
}

async function updateOrderStatus(orderId, status) {
    await pool.query('UPDATE "Orders" SET "Status"=$1 WHERE "OrderID"=$2', [status, orderId]);
}

// Новая функция: добавить items из корзины в заказ
async function addOrderItems(orderId, cartItems) {
    for (const item of cartItems) {
        try {
            console.log(`📝 [DEBUG] Добавляю товар в заказ: BookID=${item.BookID}, Quantity=${item.Quantity}`);
            
            // Просто добавляем в OrderItems без проверок
            await pool.query(
                `INSERT INTO "OrderItems" ("OrderID", "BookID", "Quantity", "Price")
                 VALUES ($1, $2, $3, $4)`,
                [orderId, item.BookID, item.Quantity, item.Price]
            );
            
            console.log(`✅ [DEBUG] Товар успешно добавлен в заказ`);
            
        } catch (err) {
            console.error(`❌ [DEBUG] Ошибка при добавлении товара в заказ:`, err);
            throw err;
        }
    }
}

async function authenticateEmployee(Email, Password) {
    const res = await pool.query(`SELECT * FROM "Employees" WHERE "Email"=$1`, [Email]);
    const employee = res.rows[0];
    if (!employee) return null;

    const match = await bcrypt.compare(Password, employee.PasswordHash);
    return match ? employee : null;
}

async function getEmployeeById(id) {
    const res = await pool.query('SELECT * FROM "Employees" WHERE "EmployeeID"=$1', [id]);
    return res.rows[0];
}

async function getOrdersByEmployee(employeeId, statusLike) {
    const res = await pool.query(`
        SELECT o."OrderID", c."FullName" AS "ClientName", c."Phone", o."Status", o."OrderDate",
               (SELECT json_agg(json_build_object('Title', b."Title", 'Quantity', oi."Quantity"))
                FROM "OrderItems" oi
                JOIN "Books" b ON oi."BookID" = b."BookID"
                WHERE oi."OrderID" = o."OrderID") AS "Items"
        FROM "Orders" o
        JOIN "Clients" c ON o."ClientID" = c."ClientID"
        WHERE o."EmployeeID" = $1 AND o."Status" LIKE $2
        ORDER BY o."OrderDate" DESC
    `, [employeeId, statusLike]);
    return res.rows;
}

async function getOrdersByStatus(status) {
    console.log(`Вызов getOrdersByStatus с параметром: "${status}"`);

    const query = `
        SELECT o."OrderID", c."FullName" AS "ClientName", d."Phone", d."DeliveryAddress", d."DeliveryMethod", o."Status", o."OrderDate",
               (SELECT json_agg(json_build_object('Title', b."Title", 'Quantity', oi."Quantity"))
                FROM "OrderItems" oi
                JOIN "Books" b ON oi."BookID" = b."BookID"
                WHERE oi."OrderID" = o."OrderID") AS "Items"
        FROM "Orders" o
        JOIN "Deliveries" d ON o."OrderID" = d."OrderID"
        JOIN "Clients" c ON o."ClientID" = c."ClientID"
        WHERE o."Status" = $1 AND d."DeliveryMethod" != 'Самовывоз'
        ORDER BY o."OrderDate" DESC
    `;

    try {
        const res = await pool.query(query, [status]);
        console.log(`Найдено заказов: ${res.rows.length}`);
        return res.rows;
    } catch (err) {
        console.error(`Ошибка выполнения getOrdersByStatus с параметром "${status}":`, err);
        throw err;
    }
}

async function getDeliveryOrders() {

    const query = `
        SELECT o."OrderID", c."FullName" AS "ClientName", d."Phone", d."DeliveryAddress", d."DeliveryMethod", o."Status", o."OrderDate",
               (SELECT json_agg(json_build_object('Title', b."Title", 'Quantity', oi."Quantity"))
                FROM "OrderItems" oi
                JOIN "Books" b ON oi."BookID" = b."BookID"
                WHERE oi."OrderID" = o."OrderID") AS "Items"
        FROM "Orders" o
        JOIN "Deliveries" d ON o."OrderID" = d."OrderID"
        JOIN "Clients" c ON o."ClientID" = c."ClientID"
        WHERE d."DeliveryMethod" != 'Самовывоз'
        ORDER BY o."OrderDate" DESC
    `;

    try {
        const res = await pool.query(query);
        return res.rows;
    } catch (err) {
        throw err;
    }
}

async function deleteOrder(orderId, clientId) {
    // Удаляем OrderItems, связанные с этим заказом
    await pool.query(`DELETE FROM "OrderItems" WHERE "OrderID" = $1`, [orderId]);
    
    // Удаляем Deliveries, связанные с этим заказом
    await pool.query(`DELETE FROM "Deliveries" WHERE "OrderID" = $1`, [orderId]);
    
    // Удаляем сам заказ
    await pool.query(`DELETE FROM "Orders" WHERE "OrderID" = $1 AND "ClientID" = $2`, [orderId, clientId]);
}

async function deleteBook(bookId) {
    // Удаляем записи из Carts, которые ссылаются на эту книгу
    await pool.query(`DELETE FROM "Carts" WHERE "BookID" = $1`, [bookId]);
    
    // Удаляем записи из OrderItems, которые ссылаются на эту книгу
    await pool.query(`DELETE FROM "OrderItems" WHERE "BookID" = $1`, [bookId]);
    
    // Теперь удаляем саму книгу
    const res = await pool.query(
        `DELETE FROM "Books" WHERE "BookID" = $1 RETURNING *`,
        [bookId]
    );
    return res.rows[0];
}

async function deleteBookByTitle(title) {
    // Сначала найдём ID книги
    const bookRes = await pool.query(
        `SELECT "BookID" FROM "Books" WHERE "Title" = $1`,
        [title]
    );
    
    if (!bookRes.rows.length) {
        throw new Error(`Книга с названием "${title}" не найдена`);
    }
    
    const bookId = bookRes.rows[0].BookID;
    
    // Удаляем записи из Carts, которые ссылаются на эту книгу
    await pool.query(`DELETE FROM "Carts" WHERE "BookID" = $1`, [bookId]);
    
    // Удаляем записи из OrderItems, которые ссылаются на эту книгу
    await pool.query(`DELETE FROM "OrderItems" WHERE "BookID" = $1`, [bookId]);
    
    // Теперь удаляем саму книгу
    const res = await pool.query(
        `DELETE FROM "Books" WHERE "BookID" = $1 RETURNING *`,
        [bookId]
    );
    return res.rows[0];
}

// Функция для логирования завершённого заказа в аналитику
async function logOrderToAnalytics(orderId) {
    try {
        console.log(`📊 [DEBUG] Логирую заказ #${orderId} в аналитику...`);
        
        // Получаем данные заказа
        const orderRes = await pool.query(
            `SELECT o."OrderID", o."ClientID", o."TotalAmount", d."DeliveryMethod",
                    (SELECT COUNT(*) FROM "OrderItems" WHERE "OrderID" = $1) as book_count
             FROM "Orders" o
             LEFT JOIN "Deliveries" d ON o."OrderID" = d."OrderID"
             WHERE o."OrderID" = $1`,
            [orderId]
        );
        
        if (!orderRes.rows.length) {
            console.log(`⚠️ [DEBUG] Заказ #${orderId} не найден`);
            return;
        }
        
        const order = orderRes.rows[0];
        
        // Логируем в аналитику
        await pool.query(
            `INSERT INTO "Analytics" ("OrderID", "ClientID", "TotalAmount", "DeliveryMethod", "BookCount", "Status")
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [order.OrderID, order.ClientID, order.TotalAmount, order.DeliveryMethod, order.book_count, 'Завершён']
        );
        
        console.log(`✅ [DEBUG] Заказ #${orderId} залогирован в аналитику`);
        
    } catch (err) {
        console.error(`❌ [DEBUG] Ошибка логирования в аналитику:`, err);
    }
}

// --- Экспортируем ---
module.exports = {
    pool,
    initDB,
    getAllAuthors, getAuthorById, addAuthor,
    getAllPublishers, addPublisher,
    getAllBooks, getBookById, addBook, deleteBook, deleteBookByTitle,
    getClientById, addClient,
    getCartByClient, addToCart, removeFromCart, clearCart,
    createOrder, getOrdersByClient,
    addDelivery,
    registerClient,
    authenticateClient,
    getClientByEmail,
    mergeCarts,
    getOrderItems,
    updateOrderStatus,
    addOrderItems,
    authenticateEmployee,
    getEmployeeById,
    getOrdersByPhone,
    getOrdersByPhonePartial,
    getOrdersByEmployee,
    getOrdersByStatus,
    getDeliveryOrders,
    deleteOrder,
    logOrderToAnalytics,
};
