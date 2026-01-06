const express = require('express');
const router = express.Router();
const db = require('../database'); 
const { v4: uuidv4 } = require('uuid');

const runStatement = (sql, params = []) => db.prepare(sql).run(params);
const queryAll = (sql, params = []) => db.prepare(sql).all(params);

router.get('/', (req, res) => {
    const sql = `
        SELECT t.*, a.name as account_name, c.name as category_name 
        FROM Transactions t
        LEFT JOIN Accounts a ON t.account_id = a.id
        LEFT JOIN Categories c ON t.category_id = c.id
        WHERE t.type = 'expense'
        ORDER BY t.date DESC
    `;
    try { res.json(queryAll(sql, [])); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
    const { 
        description, amount, date, purchaseDate, accountId, categoryId, subgroup, 
        isInstallment, numParcelas, isFixed 
    } = req.body;

    const totalInsertions = isInstallment ? parseInt(numParcelas) : 1;
    const groupId = isInstallment ? uuidv4() : null;
    const valorParcela = parseFloat(amount) / totalInsertions;
    
    // purchase_date é o dia que o usuário passou o cartão
    // date é o dia que a fatura vence
    const insertSql = `
        INSERT INTO Transactions 
        (account_id, category_id, description, type, amount, date, purchase_date, is_fixed, is_installment, installment_number, installment_total, installment_group_id, subgroup)
        VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        db.exec('BEGIN');
        for (let i = 0; i < totalInsertions; i++) {
            const [y, m, d] = date.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            dateObj.setMonth(dateObj.getMonth() + i);
            const vencimentoStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

            // A data de compra é a mesma para todas as parcelas (momento do consumo)
            const compraStr = purchaseDate || date;

            runStatement(insertSql, [
                accountId, categoryId, description, valorParcela, vencimentoStr, compraStr,
                isFixed ? 1 : 0, isInstallment ? 1 : 0, i + 1, totalInsertions, groupId, subgroup
            ]);
        }
        db.exec('COMMIT');
        res.status(201).json({ message: "Sucesso" });
    } catch (err) {
        db.exec('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;