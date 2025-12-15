const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db;
let dbPath;

// --- LÓGICA INTELIGENTE DE CAMINHOS ---

// app.isPackaged retorna 'true' se for um executável (.exe, .AppImage)
// retorna 'false' se for 'npm start'
const isProduction = app && app.isPackaged;

if (isProduction) {
    // --- MODO PRODUÇÃO (Instalado) ---
    // Usa a pasta segura do usuário (AppData ou .config)
    const userDataPath = app.getPath('userData');
    dbPath = path.join(userDataPath, 'bd_gestor_financeiro.db');

    // Verifica se o banco já existe na pasta do usuário
    if (!fs.existsSync(dbPath)) {
        console.log(">>> [PROD] Banco não encontrado. Copiando modelo...");
        
        // Pega o modelo que foi empacotado via extraResources
        const sourcePath = path.join(process.resourcesPath, 'bd_gestor_financeiro.db');
        
        try {
            fs.copyFileSync(sourcePath, dbPath);
        } catch (err) {
            console.error(">>> [ERRO] Falha ao copiar banco modelo:", err);
            // Se falhar, cria um novo vazio no destino
            dbPath = path.join(userDataPath, 'bd_gestor_financeiro.db');
        }
    }
} else {
    // --- MODO DESENVOLVIMENTO (npm start) ---
    // Usa o arquivo na raiz do projeto. Fácil de ver, fácil de apagar.
    console.log(">>> [DEV] Rodando em modo Desenvolvimento.");
    dbPath = path.join(process.cwd(), 'bd_gestor_financeiro.db');
}

// --- CONEXÃO ---

try {
    console.log(`>>> Conectando ao banco em: ${dbPath}`);
    db = new Database(dbPath, { verbose: console.log });
    db.pragma('journal_mode = WAL');
    createTables(db);
} catch (err) {
    console.error("ERRO CRÍTICO ao abrir banco:", err.message);
    throw err;
}

// --- TABELAS (Mantido igual) ---
function createTables(dbInstance) {
    dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS Accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            initial_balance REAL NOT NULL DEFAULT 0,
            is_credit_card BOOLEAN NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
    `);

    dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS Categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('expense', 'revenue')),
            is_fixed BOOLEAN NOT NULL DEFAULT 0,
            subgroups TEXT, 
            color TEXT DEFAULT '#ef4444', 
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE(name, type)
        );
    `);
    
    // Migração da coluna color
    try {
        const test = dbInstance.prepare("SELECT color FROM Categories LIMIT 1").get();
    } catch (e) {
        if (e.message.includes("no such column: color")) {
            dbInstance.exec("ALTER TABLE Categories ADD COLUMN color TEXT DEFAULT '#ef4444'");
        }
    }

    dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS Transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER, 
            category_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('expense', 'revenue')),
            amount REAL NOT NULL, 
            date TEXT NOT NULL, 
            is_fixed BOOLEAN NOT NULL DEFAULT 0,
            is_installment BOOLEAN NOT NULL DEFAULT 0,
            installment_number INTEGER, 
            installment_total INTEGER, 
            installment_group_id TEXT,  
            subgroup TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY (account_id) REFERENCES Accounts (id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES Categories (id) ON DELETE CASCADE
        );
    `);
}

module.exports = db;