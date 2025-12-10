const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Define o caminho do banco de dados na raiz do projeto
const dbPath = path.join(process.cwd(), 'bd_gestor_financeiro.db');

let db;

try {
    // Abre o banco de dados. Se não existir, ele será criado.
    // verbose: Ativa logs de erro. fileMustExist: false (permite criação)
    db = new Database(dbPath, { verbose: console.log }); 
    console.log('Conectado ao banco de dados SQLite (better-sqlite3).');

    // Configurações iniciais
    db.pragma('journal_mode = WAL'); // Modo de log para melhor performance
    
    // Criação e Migração das Tabelas (SÍNCRONA)
    createTables(db);

} catch (err) {
    console.error("ERRO CRÍTICO ao abrir/criar o banco de dados:", err.message);
    // Em um app Electron, você deve lidar com isso exibindo um erro ao usuário
    // Aqui, apenas re-lançamos o erro.
    throw err; 
}


// Função para garantir que todas as tabelas necessárias existam e estejam atualizadas
function createTables(dbInstance) {
    // 1. Tabela Accounts (Contas, Cartões)
    dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS Accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            initial_balance REAL NOT NULL DEFAULT 0,
            is_credit_card BOOLEAN NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
    `);

    // 2. Tabela Categories (Grupos, Subgrupos)
    dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS Categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('expense', 'revenue')),
            subgroups TEXT, -- JSON string para array de subgrupos. Ex: '["Padaria", "Restaurante"]'
            is_fixed BOOLEAN NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (name, type)
        );
    `);
    
    // --- MIGRATION: Adicionar coluna 'color' se não existir (CRÍTICO) ---
    try {
        // Tenta selecionar a coluna 'color'. Se falhar, o CATCH é executado.
        dbInstance.prepare("SELECT color FROM Categories LIMIT 1").get();
    } catch (e) {
        if (e.message.includes("no such column: color")) {
            console.log(">>> [MIGRATION] Adicionando coluna 'color' na tabela Categories.");
            try {
                dbInstance.exec(`
                    ALTER TABLE Categories ADD COLUMN color TEXT DEFAULT '#ef4444'
                `);
                console.log(">>> [MIGRATION] Coluna 'color' adicionada com sucesso.");
            } catch (alterErr) {
                console.error("ERRO CRÍTICO na migração da coluna 'color':", alterErr.message);
            }
        }
    }


    // 3. Tabela Transactions (Lançamentos)
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