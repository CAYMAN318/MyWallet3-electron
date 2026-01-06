const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let dbPath;

// app.isPackaged retorna 'true' se for um executável (.exe)
const isProduction = app && app.isPackaged;

if (isProduction) {
    const userDataPath = app.getPath('userData');
    dbPath = path.join(userDataPath, 'bd_gestor_financeiro.db');

    if (!fs.existsSync(dbPath)) {
        const sourcePath = path.join(process.resourcesPath, 'bd_gestor_financeiro.db');
        try {
            fs.copyFileSync(sourcePath, dbPath);
        } catch (err) {
            dbPath = path.join(userDataPath, 'bd_gestor_financeiro.db');
        }
    }
} else {
    // No desenvolvimento (npm start), usa a raiz do projeto
    dbPath = path.join(__dirname, '..', 'bd_gestor_financeiro.db');
}

console.log(">>> [DATABASE] Usando banco em:", dbPath);

const dbInstance = new Database(dbPath);
dbInstance.pragma('foreign_keys = ON');

// --- MIGRAÇÃO E CORREÇÃO DE DATAS ---
try {
    // 1. Criar coluna purchase_date se não existir
    const columns = dbInstance.prepare("PRAGMA table_info(Transactions)").all();
    if (!columns.some(c => c.name === 'purchase_date')) {
        dbInstance.exec("ALTER TABLE Transactions ADD COLUMN purchase_date TEXT;");
        console.log(">>> [DB] Coluna purchase_date criada.");
    }

    // 2. Corrigir formatos de data (DD/MM/YYYY para YYYY-MM-DD)
    const rows = dbInstance.prepare("SELECT id, date, purchase_date FROM Transactions").all();
    
    dbInstance.transaction(() => {
        const updateStmt = dbInstance.prepare("UPDATE Transactions SET date = ?, purchase_date = ? WHERE id = ?");
        
        rows.forEach(row => {
            let d = row.date;
            let pd = row.purchase_date || row.date;

            // Função interna para padronizar
            const fixDate = (dateStr) => {
                if (!dateStr) return dateStr;
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                }
                return dateStr;
            };

            updateStmt.run(fixDate(d), fixDate(pd), row.id);
        });
    })();
    console.log(">>> [DB] Datas sincronizadas e corrigidas.");
} catch (e) {
    console.error("Erro na migração:", e);
}

// Inicialização das Tabelas
dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        initial_balance REAL NOT NULL DEFAULT 0,
        is_credit_card BOOLEAN NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

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

    CREATE TABLE IF NOT EXISTS Transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER, 
        category_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense', 'revenue')),
        amount REAL NOT NULL, 
        date TEXT NOT NULL, 
        purchase_date TEXT,
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

module.exports = dbInstance;