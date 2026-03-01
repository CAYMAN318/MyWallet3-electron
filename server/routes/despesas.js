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

        // Filtra por mês e ano se fornecidos
        if (mes && ano) {
            sql += ` AND strftime('%m', t.date) = ? AND strftime('%Y', t.date) = ?`;
            params.push(String(mes).padStart(2, '0'), String(ano));
        }

        sql += ` ORDER BY t.date DESC, t.id DESC`;
        
        const rows = db.prepare(sql).all(params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST: Criar despesa (com suporte a parcelamento)
 */
router.post('/', (req, res) => {
    const { 
        description, amount, due_date, purchase_date, 
        account_id, category_id, subgroup, is_credit, installments 
    } = req.body;

    try {
        const numParcelas = is_credit ? parseInt(installments) || 1 : 1;
        const valorParcela = amount / numParcelas;

        // Prepara o statement de inserção
        const stmt = db.prepare(`
            INSERT INTO Transactions (
                description, amount, date, purchase_date, 
                account_id, category_id, subgroup, type, is_paid
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', 0)
        `);

        // Transação do banco de dados para garantir que todas as parcelas sejam salvas
        const insertMany = db.transaction(() => {
            for (let i = 0; i < numParcelas; i++) {
                // Calcula a data de vencimento de cada parcela
                let dateObj = new Date(due_date + 'T12:00:00');
                dateObj.setMonth(dateObj.getMonth() + i);
                const dataFormatada = dateObj.toISOString().split('T')[0];

                // Adiciona o sufixo (1/12) se for parcelado
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
                    subgroup || ''
                );
            }
        });

        insertMany();
        res.status(201).json({ success: true, message: `${numParcelas} lançamento(s) criado(s).` });

    } catch (err) {
        console.error("Erro ao inserir despesa:", err.message);
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;