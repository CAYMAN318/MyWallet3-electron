const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// No Electron, o banco de dados deve ficar na pasta de dados do usuário para persistência
// Mas para desenvolvimento/backup, verificamos o caminho local primeiro
const isProd = process.env.NODE_ENV === 'production';
const dbPath = path.join(__dirname, '../bd_gestor_financeiro.db');

const db = new Database(dbPath, { verbose: null });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Esquema Inicial e Migrações ---
const initDb = () => {
    // Tabela de Contas
    db.prepare(`
        CREATE TABLE IF NOT EXISTS Accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            initial_balance REAL DEFAULT 0,
            is_credit_card INTEGER DEFAULT 0
        )
    `).run();

    // Tabela de Categorias
    db.prepare(`
        CREATE TABLE IF NOT EXISTS Categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('revenue', 'expense')),
            is_fixed INTEGER DEFAULT 0,
            subgroups TEXT DEFAULT '',
            color TEXT DEFAULT '#ef4444'
        )
    `).run();

    // Tabela de Transações
    db.prepare(`
        CREATE TABLE IF NOT EXISTS Transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            purchase_date TEXT,
            type TEXT CHECK(type IN ('revenue', 'expense')),
            category_id INTEGER,
            account_id INTEGER,
            subgroup TEXT,
            is_paid INTEGER DEFAULT 0,
            installment_group_id TEXT,
            FOREIGN KEY(category_id) REFERENCES Categories(id),
            FOREIGN KEY(account_id) REFERENCES Accounts(id)
        )
    `).run();

    // Tabela da Matriz (Checklist)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS Checklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            subgroup_name TEXT,
            FOREIGN KEY(category_id) REFERENCES Categories(id),
            UNIQUE(category_id, subgroup_name)
        )
    `).run();
};

initDb();

module.exports = db;