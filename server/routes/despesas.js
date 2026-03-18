const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * GET: Listar despesas filtradas por mês e ano
 */
router.get('/', (req, res) => {
    const { mes, ano } = req.query;
    try {
        let sql = `
            SELECT t.*, a.name as account_name, c.name as category_name
            FROM Transactions t
            LEFT JOIN Accounts a ON t.account_id = a.id
            LEFT JOIN Categories c ON t.category_id = c.id
            WHERE t.type = 'expense'
        `;
        let params = [];
        if (mes && ano) {
            sql += ` AND strftime('%m', t.date) = ? AND strftime('%Y', t.date) = ?`;
            params.push(String(mes).padStart(2, '0'), String(ano));
        }
        sql += ` ORDER BY t.date DESC, t.id DESC`;
        res.json(db.prepare(sql).all(params));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST: Criar despesa (Lógica de Negócio Pura e Parcelamento)
 */
router.post('/', (req, res) => {
    const { 
        description, amount, due_date, purchase_date, 
        account_id, category_id, subgroup, is_credit, installments 
    } = req.body;

    try {
        const numParcelas = is_credit ? (parseInt(installments) || 1) : 1;
        const valorParcela = amount / numParcelas;
        const groupId = is_credit && numParcelas > 1 ? `GRP_${Date.now()}` : null;
        
        // Se não for crédito, o vencimento é o dia da compra
        const dataReferencia = is_credit ? due_date : purchase_date;

        const stmt = db.prepare(`
            INSERT INTO Transactions (
                description, amount, date, purchase_date, 
                account_id, category_id, subgroup, type, is_paid, installment_group_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', 0, ?)
        `);

        const insertMany = db.transaction(() => {
            for (let i = 0; i < numParcelas; i++) {
                let dateObj = new Date(dataReferencia + 'T12:00:00');
                dateObj.setMonth(dateObj.getMonth() + i);
                const dataFormatada = dateObj.toISOString().split('T')[0];

                const descFinal = numParcelas > 1 
                    ? `${description} (${i + 1}/${numParcelas})` 
                    : description;

                stmt.run(
                    descFinal, 
                    valorParcela, 
                    dataFormatada, 
                    purchase_date, 
                    account_id, 
                    category_id || null, 
                    subgroup || '',
                    groupId
                );
            }
        });

        insertMany();
        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Erro ao salvar despesa:", err.message);
        res.status(500).json({ error: "Erro interno no servidor ao gravar os dados." });
    }
});

/**
 * PUT: Atualizar despesa existente (Editar Lançamento)
 */
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { description, amount, date, account_id, category_id, subgroup } = req.body;

    try {
        const stmt = db.prepare(`
            UPDATE Transactions 
            SET description = ?, amount = ?, date = ?, 
                account_id = ?, category_id = ?, subgroup = ?
            WHERE id = ? AND type = 'expense'
        `);
        
        stmt.run(
            description, 
            amount, 
            date, 
            account_id, 
            category_id || null, 
            subgroup || '', 
            id
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao atualizar despesa:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE: Remover despesa
 */
router.delete('/:id', (req, res) => {
    try {
        db.prepare("DELETE FROM Transactions WHERE id = ?").run(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;