// cardsdb.js (новый файл)
const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'BookShopDatabase',
    password: 'password',
    port: 5432,
});
// Инициализация БД карт
async function initDB() {
    const client = await pool.connect();
    try {
        console.log('⏳ Initializing cards database...');
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Cards" (
                "CardID" SERIAL PRIMARY KEY,
                "ClientID" INT REFERENCES "Clients"("ClientID") ON DELETE CASCADE,
                "CardNumber" VARCHAR(20) NOT NULL, -- Полный номер (в проде хешировать)
                "Expiry" VARCHAR(10), -- MM/YY
                "CVV" VARCHAR(4), -- Хешировать в проде
                "Last4Digits" VARCHAR(4) NOT NULL,
                "Balance" DECIMAL(10,2) DEFAULT 0 CHECK ("Balance" >= 0),
                "AddedDate" DATE DEFAULT CURRENT_DATE,
                UNIQUE("ClientID", "CardNumber")
            );
        `);
        await client.query('COMMIT');
        console.log('✅ Cards database initialized');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing cards DB:', err);
    } finally {
        client.release();
    }
}
// Функции работы с картами
async function getCardsByClient(clientId) {
    const res = await pool.query(
        'SELECT "CardID", "CardNumber", "Expiry", "Last4Digits", "Balance" FROM "Cards" WHERE "ClientID"=$1 ORDER BY "AddedDate" DESC',
        [clientId]
    );
    return res.rows;
}
async function getCardById(cardId) {
    const res = await pool.query('SELECT * FROM "Cards" WHERE "CardID"=$1', [cardId]);
    return res.rows[0];
}
async function addCard(clientId, cardNumber, expiry, cvv, last4, balance = 0) {
    const res = await pool.query(
        `INSERT INTO "Cards" ("ClientID", "CardNumber", "Expiry", "CVV", "Last4Digits", "Balance")
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [clientId, cardNumber, expiry, cvv, last4, balance]
    );
    return res.rows[0];
}
async function updateCardBalance(cardId, newBalance) {
    const res = await pool.query(
        'UPDATE "Cards" SET "Balance"=$1 WHERE "CardID"=$2 RETURNING *',
        [newBalance, cardId]
    );
    return res.rows[0];
}
async function deleteCard(cardId) {
    await pool.query('DELETE FROM "Cards" WHERE "CardID"=$1', [cardId]);
}
module.exports = {
    pool,
    initDB,
    getCardsByClient,
    getCardById,
    addCard,
    updateCardBalance,
    deleteCard,
};