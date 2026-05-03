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
 * POST: Criar despesa (Gera Lote ID para Doutrina Flexível)
 */
router.post('/', (req, res) => {
    const { 
        description, amount, due_date, purchase_date, 
        account_id, category_id, subgroup, is_credit, installments, is_paid 
    } = req.body;

    try {
        const numParcelas = is_credit ? (parseInt(installments) || 1) : 1;
        
        // Geração do Lote ID (Gera apenas se for parcela de cartão)
        const installment_group_id = numParcelas > 1 ? `LOTE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` : null;

        const stmt = db.prepare(`
            INSERT INTO Transactions 
            (description, amount, date, purchase_date, type, category_id, account_id, subgroup, is_paid, installment_group_id) 
            VALUES (?, ?, ?, ?, 'expense', ?, ?, ?, ?, ?)
        `);

        // Transação atômica (salva tudo ou cancela tudo)
        const transaction = db.transaction(() => {
            let currentDate = new Date(due_date + 'T12:00:00');
            
            for (let i = 0; i < numParcelas; i++) {
                let finalDescription = description;
                if (numParcelas > 1) {
                    finalDescription = `${description} (${i + 1}/${numParcelas})`;
                }

                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const day = String(currentDate.getDate()).padStart(2, '0');
                const formattedDate = `${year}-${month}-${day}`;

                stmt.run(
                    finalDescription, 
                    amount / numParcelas, 
                    formattedDate, 
                    purchase_date,
                    category_id || null, 
                    account_id, 
                    subgroup || '', 
                    is_paid ? 1 : 0,
                    installment_group_id // Salva a "Amarração" do Lote
                );

                currentDate.setMonth(currentDate.getMonth() + 1);
            }
        });

        transaction();
        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Erro ao criar despesa:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT: Alternar Status Pago/Pendente
 */
router.put('/:id/status', (req, res) => {
    try {
        db.prepare(`
            UPDATE Transactions 
            SET is_paid = CASE WHEN is_paid = 1 THEN 0 ELSE 1 END 
            WHERE id = ? AND type = 'expense'
        `).run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT: Atualizar despesa existente
 */
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { description, amount, date, purchase_date, account_id, category_id, subgroup, is_paid } = req.body;

    try {
        const stmt = db.prepare(`
            UPDATE Transactions 
            SET description = ?, amount = ?, date = ?, purchase_date = ?,
                account_id = ?, category_id = ?, subgroup = ?, is_paid = ?
            WHERE id = ? AND type = 'expense'
        `);
        
        stmt.run(
            description, amount, date, purchase_date, account_id, 
            category_id || null, subgroup || '', is_paid ? 1 : 0, id
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE: Remover despesa (O Núcleo da Doutrina Flexível)
 */
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const { deleteAll } = req.query; // Recebe o comando do Frontend

    try {
        if (deleteAll === 'true') {
            // Busca o Lote ID da transação
            const row = db.prepare(`SELECT installment_group_id FROM Transactions WHERE id = ?`).get(id);
            
            if (row && row.installment_group_id) {
                // Exclui TODAS as parcelas amarradas a este lote
                db.prepare(`DELETE FROM Transactions WHERE installment_group_id = ?`).run(row.installment_group_id);
            } else {
                // Fallback de segurança: se não achar lote, exclui a unidade
                db.prepare(`DELETE FROM Transactions WHERE id = ? AND type = 'expense'`).run(id);
            }
        } else {
            // Exclui APENAS a unidade (exclusão normal)
            db.prepare(`DELETE FROM Transactions WHERE id = ? AND type = 'expense'`).run(id);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao excluir despesa:", err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;