const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * DEFINIÇÃO DO CAMINHO DO BANCO DE DADOS
 * Em produção: Pasta de dados do usuário (AppData/Config)
 * Em desenvolvimento: Raiz do projeto
 */
let dbPath;

try {
    const { app } = require('electron');
    if (app) {
        const userDataPath = app.getPath('userData');
        dbPath = path.join(userDataPath, 'bd_gestor_financeiro.db');
    } else {
        dbPath = path.join(__dirname, '../bd_gestor_financeiro.db');
    }
} catch (e) {
    dbPath = path.join(__dirname, '../bd_gestor_financeiro.db');
}

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

console.log(">>> Banco de dados carregado em:", dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * MOTOR DE MIGRAÇÃO (AUTO-REPARO)
 * Adicionado a coluna 'installment_group_id' para a Doutrina Flexível de Parcelamentos
 */
const garantirIntegridadeDoEsquema = () => {
    const tabelas = {
        Transactions: [
            { name: 'purchase_date', type: 'TEXT' },
            { name: 'subgroup', type: 'TEXT' },
            { name: 'is_paid', type: 'INTEGER DEFAULT 1' },
            { name: 'installment_group_id', type: 'TEXT' } // NOVA COLUNA DE BLINDAGEM
        ],
        Categories: [
            { name: 'budget_limit', type: 'REAL' },
            { name: 'subgroups', type: 'TEXT' }
        ]
    };

    Object.keys(tabelas).forEach(tabela => {
        try {
            const info = db.prepare(`PRAGMA table_info(${tabela})`).all();
            const colunasExistentes = info.map(c => c.name);

            tabelas[tabela].forEach(col => {
                if (!colunasExistentes.includes(col.name)) {
                    console.log(`[DB] Adicionando coluna ${col.name} na tabela ${tabela}...`);
                    db.prepare(`ALTER TABLE ${tabela} ADD COLUMN ${col.name} ${col.type}`).run();
                }
            });
        } catch (e) {
            console.error(`[DB] Erro ao verificar esquema da tabela ${tabela}:`, e);
        }
    });
};

const initDb = () => {
    db.prepare(`CREATE TABLE IF NOT EXISTS Accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, initial_balance REAL DEFAULT 0)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS Categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT CHECK(type IN ('revenue', 'expense')), is_fixed INTEGER DEFAULT 0)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS Transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, type TEXT CHECK(type IN ('revenue', 'expense')), category_id INTEGER, account_id INTEGER, FOREIGN KEY(category_id) REFERENCES Categories(id), FOREIGN KEY(account_id) REFERENCES Accounts(id))`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS Checklist (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, subgroup_name TEXT, FOREIGN KEY(category_id) REFERENCES Categories(id), UNIQUE(category_id, subgroup_name))`).run();
    
    garantirIntegridadeDoEsquema();
};

initDb();

module.exports = db;