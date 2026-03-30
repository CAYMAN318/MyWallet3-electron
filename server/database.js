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
    // Tenta carregar o Electron para pegar o caminho de produção
    const { app } = require('electron');
    // Se app estiver definido (estamos no processo principal do Electron)
    if (app) {
        const userDataPath = app.getPath('userData');
        dbPath = path.join(userDataPath, 'bd_gestor_financeiro.db');
    } else {
        // Fallback para desenvolvimento (fora do Electron)
        dbPath = path.join(__dirname, '../bd_gestor_financeiro.db');
    }
} catch (e) {
    // Se falhar (ex: rodando testes ou script puro node), usa o local
    dbPath = path.join(__dirname, '../bd_gestor_financeiro.db');
}

// Garante que o diretório existe (importante no primeiro acesso em produção)
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
 * Checa dinamicamente se as colunas criadas em versões mais novas
 * existem no banco do usuário. Se não existirem, ele injeta (ALTER TABLE).
 */
const garantirIntegridadeDoEsquema = () => {
    const tabelas = {
        'Transactions': [
            { name: 'purchase_date', type: 'TEXT' },
            { name: 'installment_group_id', type: 'TEXT' },
            { name: 'subgroup', type: 'TEXT' },
            { name: 'is_paid', type: 'INTEGER DEFAULT 0' }
        ],
        'Categories': [
            { name: 'subgroups', type: 'TEXT DEFAULT ""' },
            { name: 'color', type: 'TEXT DEFAULT "#ef4444"' },
            { name: 'budget_limit', type: 'REAL DEFAULT NULL' } // <-- NOVO: Teto de Gastos
        ]
    };

    Object.keys(tabelas).forEach(tabela => {
        try {
            const info = db.prepare(`PRAGMA table_info(${tabela})`).all();
            const colunasExistentes = info.map(c => c.name);

            tabelas[tabela].forEach(col => {
                if (!colunasExistentes.includes(col.name)) {
                    db.prepare(`ALTER TABLE ${tabela} ADD COLUMN ${col.name} ${col.type}`).run();
                }
            });
        } catch (e) {}
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