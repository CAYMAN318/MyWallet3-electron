const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../bd_gestor_financeiro.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * MOTOR DE MIGRAÇÃO (AUTO-REPARO)
 * Compara a estrutura do banco recuperado com o que o sistema atual exige.
 * Adiciona colunas faltantes sem apagar nenhum dado existente.
 */
const garantirIntegridadeDoEsquema = () => {
    const tabelas = {
        Transactions: [
            { name: 'purchase_date', type: 'TEXT' },
            { name: 'subgroup', type: 'TEXT' },
            { name: 'is_paid', type: 'INTEGER DEFAULT 0' },
            { name: 'installment_group_id', type: 'TEXT' }
        ],
        Categories: [
            { name: 'subgroups', type: 'TEXT DEFAULT ""' },
            { name: 'color', type: 'TEXT DEFAULT "#6366f1"' }
        ],
        Accounts: [
            { name: 'is_credit_card', type: 'INTEGER DEFAULT 0' }
        ]
    };

    Object.keys(tabelas).forEach(tabela => {
        try {
            const info = db.prepare(`PRAGMA table_info(${tabela})`).all();
            const colunasExistentes = info.map(c => c.name);

            tabelas[tabela].forEach(col => {
                if (!colunasExistentes.includes(col.name)) {
                    console.log(`>>> [MIGRAÇÃO] Reparando tabela ${tabela}: Adicionando coluna ${col.name}`);
                    db.prepare(`ALTER TABLE ${tabela} ADD COLUMN ${col.name} ${col.type}`).run();
                }
            });
        } catch (e) {
            console.error(`Erro ao verificar tabela ${tabela}:`, e.message);
        }
    });
};

// Inicialização das tabelas base (caso o banco seja deletado)
const initDb = () => {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS Accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            initial_balance REAL DEFAULT 0
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS Categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('revenue', 'expense')),
            is_fixed INTEGER DEFAULT 0
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS Transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            type TEXT CHECK(type IN ('revenue', 'expense')),
            category_id INTEGER,
            account_id INTEGER,
            FOREIGN KEY(category_id) REFERENCES Categories(id),
            FOREIGN KEY(account_id) REFERENCES Accounts(id)
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS Checklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            subgroup_name TEXT,
            FOREIGN KEY(category_id) REFERENCES Categories(id),
            UNIQUE(category_id, subgroup_name)
        )
    `).run();

    // Executa o auto-reparo logo após a inicialização
    garantirIntegridadeDoEsquema();
};

initDb();

module.exports = db;