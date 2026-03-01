const express = require('express');
const router = express.Router();
const db = require('../database');

// Funções auxiliares para o better-sqlite3 (Síncrono)
const queryAll = (sql, params = []) => db.prepare(sql).all(params);
const runStatement = (sql, params = []) => db.prepare(sql).run(params);

/**
 * FUNÇÃO DE AUTO-REPARO (MIGRAÇÃO DINÂMICA)
 * Garante que o banco antigo (backup) ganhe as novas colunas sem travar o app.
 */
const garantirEsquemaAtualizado = () => {
    try {
        const info = db.prepare("PRAGMA table_info(Categories)").all();
        const colunas = info.map(c => c.name);

        if (!colunas.includes('subgroups')) {
            console.log(">>> [MIGRAÇÃO] Adicionando coluna 'subgroups' em Categories...");
            db.prepare("ALTER TABLE Categories ADD COLUMN subgroups TEXT DEFAULT ''").run();
        }
        if (!colunas.includes('color')) {
            console.log(">>> [MIGRAÇÃO] Adicionando coluna 'color' em Categories...");
            db.prepare("ALTER TABLE Categories ADD COLUMN color TEXT DEFAULT '#ef4444'").run();
        }
    } catch (e) {
        console.error("Erro na migração dinâmica:", e.message);
    }
};

/**
 * GET: BUSCAR LISTAS (Contas, GruposDespesa, GruposReceita)
 * Versão robusta: Garante que colunas ausentes em bancos antigos não quebrem a rota.
 */
router.get('/', (req, res) => {
    const { type } = req.query;

    // Executa o auto-reparo antes de qualquer consulta
    garantirEsquemaAtualizado();

    try {
        let rows = [];
        if (type === 'Conta' || type === 'FormaPagamento') {
            rows = queryAll("SELECT * FROM Accounts ORDER BY name");
        } else if (type === 'GrupoDespesa') {
            rows = queryAll("SELECT * FROM Categories WHERE type = 'expense' ORDER BY name");
        } else if (type === 'GrupoReceita') {
            rows = queryAll("SELECT * FROM Categories WHERE type = 'revenue' ORDER BY name");
        }
        
        // Normalização para garantir que o frontend não receba campos undefined
        const normalizedRows = rows.map(row => ({
            ...row,
            subgroups: row.subgroups || '',
            color: row.color || (row.type === 'revenue' ? '#6366f1' : '#ef4444'),
            is_fixed: row.is_fixed || 0
        }));

        res.json(normalizedRows);
    } catch (err) {
        console.error(">>> [ERRO GET CONFIG]", err.message);
        res.status(500).json({ error: "Erro ao carregar dados. O banco pode estar em um formato incompatível." });
    }
});

/**
 * POST: CRIAR NOVA CATEGORIA / CONTA
 */
router.post('/:type', (req, res) => {
    const { type } = req.params; 
    const data = req.body;

    try {
        if (type === 'conta') {
            const sql = "INSERT INTO Accounts (name, initial_balance, is_credit_card) VALUES (?, ?, ?)";
            const result = runStatement(sql, [
                data.name, 
                data.initial_balance || 0, 
                data.is_credit_card ? 1 : 0
            ]);
            return res.status(201).json({ id: result.lastInsertRowid });
        } 
        
        if (type === 'categoria') {
            const sql = "INSERT INTO Categories (name, type, is_fixed, subgroups, color) VALUES (?, ?, ?, ?, ?)";
            const result = runStatement(sql, [
                data.name, 
                data.type, 
                data.is_fixed ? 1 : 0, 
                data.subgroups || '', 
                data.color || '#ef4444'
            ]);
            return res.status(201).json({ id: result.lastInsertRowid });
        }

        res.status(400).json({ error: "Tipo de cadastro inválido." });
    } catch (err) {
        console.error("Erro no POST configuracoes:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT: ATUALIZAR CATEGORIA / CONTA
 */
router.put('/:type', (req, res) => {
    const { type } = req.params;
    const data = req.body;

    try {
        if (type === 'conta') {
            const sql = "UPDATE Accounts SET name = ?, initial_balance = ?, is_credit_card = ? WHERE id = ?";
            runStatement(sql, [data.name, data.initial_balance, data.is_credit_card ? 1 : 0, data.id]);
            return res.json({ message: "Conta atualizada!" });
        }

        if (type === 'categoria') {
            const sql = "UPDATE Categories SET name = ?, type = ?, is_fixed = ?, subgroups = ?, color = ? WHERE id = ?";
            runStatement(sql, [
                data.name, 
                data.type, 
                data.is_fixed ? 1 : 0, 
                data.subgroups || '', 
                data.color, 
                data.id
            ]);
            return res.json({ message: "Categoria atualizada!" });
        }

        res.status(400).json({ error: "Tipo de atualização inválido." });
    } catch (err) {
        console.error("Erro no PUT configuracoes:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE: EXCLUIR ITEM
 */
router.delete('/:type/:id', (req, res) => {
    const { type, id } = req.params;

    try {
        const checkTable = type === 'conta' ? 'account_id' : 'category_id';
        const count = db.prepare(`SELECT COUNT(*) as total FROM Transactions WHERE ${checkTable} = ?`).get(id).total;
        
        if (count > 0) {
            return res.status(400).json({ 
                error: `Existem ${count} lançamentos vinculados a este item. Exclua os lançamentos primeiro.` 
            });
        }

        const sql = type === 'conta' ? "DELETE FROM Accounts WHERE id = ?" : "DELETE FROM Categories WHERE id = ?";
        runStatement(sql, [id]);
        res.json({ message: "Item removido com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;