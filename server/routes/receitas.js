const express = require('express');
const router = express.Router();
const db = require('../database'); 

/**
 * GET: Listar receitas filtradas por mês e ano
 */
router.get('/', (req, res) => {
    const { mes, ano } = req.query;
    try {
        let sql = `
            SELECT t.*, a.name as account_name, c.name as category_name 
            FROM Transactions t
            LEFT JOIN Accounts a ON t.account_id = a.id
            LEFT JOIN Categories c ON t.category_id = c.id
            WHERE t.type = 'revenue'
        `;
        let params = [];
        
        if (mes && ano) {
            sql += ` AND strftime('%m', t.date) = ? AND strftime('%Y', t.date) = ?`;
            params.push(String(mes).padStart(2, '0'), String(ano));
        }
        
        sql += ` ORDER BY t.date DESC, t.id DESC`;
        res.json(db.prepare(sql).all(params));
    } catch (err) {
        console.error(">>> [ERRO DB] Falha ao buscar receitas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST: Criar receita
 */
router.post('/', (req, res) => {
    const { description, amount, date, account_id, category_id, is_fixed } = req.body;
    
    if (!description || !amount || !date || !category_id) {
        return res.status(400).json({ error: "Descrição, Valor, Data e Grupo são obrigatórios." });
    }

    try {
        const sql = `
            INSERT INTO Transactions (description, amount, date, account_id, category_id, type, is_fixed)
            VALUES (?, ?, ?, ?, ?, 'revenue', ?)
        `;
        const result = db.prepare(sql).run(
            description, 
            amount, 
            date, 
            account_id || null, 
            category_id, 
            is_fixed ? 1 : 0
        );
        res.status(201).json({ id: result.lastInsertRowid, success: true });
    } catch (err) {
        console.error("Erro ao salvar receita:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT: Editar Receita
 */
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { description, amount, date, account_id, category_id } = req.body;

    try {
        const stmt = db.prepare(`
            UPDATE Transactions 
            SET description = ?, amount = ?, date = ?, account_id = ?, category_id = ?
            WHERE id = ? AND type = 'revenue'
        `);
        stmt.run(description, amount, date, account_id || null, category_id || null, id);
        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao atualizar receita:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE: Excluir Receita
 */
router.delete('/:id', (req, res) => {
    try {
        const result = db.prepare("DELETE FROM Transactions WHERE id = ?").run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Receita não encontrada." });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;