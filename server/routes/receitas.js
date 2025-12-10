const express = require('express');
const router = express.Router();
const db = require('../database'); 

// Função auxiliar para consulta SQL (SÍNCRONA - better-sqlite3)
const query = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

// GET: Listar receitas
router.get('/', (req, res) => {
    try {
        const sql = `
            SELECT t.*, a.name as account_name, c.name as category_name 
            FROM Transactions t
            LEFT JOIN Accounts a ON t.account_id = a.id
            LEFT JOIN Categories c ON t.category_id = c.id
            WHERE t.type = 'revenue'
            ORDER BY t.date DESC
        `;
        const rows = query(sql, []);
        res.json(rows);
    } catch (err) {
        console.error(">>> [ERRO DB] Falha ao buscar receitas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST: Criar receita
router.post('/', (req, res) => {
    const description = req.body.description || req.body.descricao;
    const amount = req.body.amount || req.body.valor;
    const date = req.body.date || req.body.data;
    const isFixed = req.body.isFixed !== undefined ? req.body.isFixed : false;
    
    let accountId = req.body.accountId || req.body.formaPagamento; 
    const categoryId = req.body.categoryId || req.body.grupo;

    if (accountId === "" || accountId === "null") {
        accountId = null;
    }

    if (!description || !amount || !date || !categoryId) {
        return res.status(400).json({ error: "Descrição, Valor, Data e Grupo são obrigatórios." });
    }

    const sql = `
        INSERT INTO Transactions (account_id, category_id, description, type, amount, date, is_fixed)
        VALUES (?, ?, ?, 'revenue', ?, ?, ?)
    `;

    const fixedInt = isFixed ? 1 : 0;
    
    try {
        const result = db.prepare(sql).run(accountId, categoryId, description, amount, date, fixedInt);
        res.status(201).json({ id: result.lastInsertRowid, message: "Receita salva com sucesso!" });
    } catch (err) {
        console.error("Erro ao salvar receita:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Excluir Receita
router.delete('/:id', (req, res) => {
    const sql = "DELETE FROM Transactions WHERE id = ?";
    
    try {
        const result = db.prepare(sql).run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Receita não encontrada." });
        }
        res.json({ message: "Receita excluída!" });
    } catch (err) {
        console.error("Erro ao excluir receita:", err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;