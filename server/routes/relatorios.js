const express = require('express');
const router = express.Router();
const db = require('../database'); 

const queryAll = (sql, params = []) => db.prepare(sql).all(params);

router.get('/trend', (req, res) => {
    const { months = 6, categoryId, viewType = 'financeiro' } = req.query;
    const numMonths = parseInt(months) || 6;
    
    // 'date' = Fluxo Financeiro (Pagamento)
    // 'purchase_date' = Fluxo de Consumo (Hábito de Gasto)
    const dateColumn = viewType === 'consumo' ? 'purchase_date' : 'date';

    const today = new Date();
    const dataCorteDate = new Date(today.getFullYear(), today.getMonth() - numMonths + 1, 1);
    const dataCorte = `${dataCorteDate.getFullYear()}-${String(dataCorteDate.getMonth()+1).padStart(2, '0')}-01`;

    try {
        let sql = `
            SELECT 
                strftime('%Y-%m', ${dateColumn}) as period, 
                type, 
                SUM(amount) as total
            FROM Transactions
            WHERE ${dateColumn} >= ?
        `;
        let params = [dataCorte];

        if (categoryId && categoryId !== 'all') {
            sql += ` AND (type = 'revenue' OR (type = 'expense' AND category_id = ?))`;
            params.push(categoryId);
        }

        sql += ` GROUP BY period, type ORDER BY period ASC;`;
        
        const rawData = queryAll(sql, params);
        const periods = {};
        rawData.forEach(row => {
            const p = row.period || "Indefinido";
            if (!periods[p]) periods[p] = { period: p, revenue: 0, expense: 0 };
            const type = row.type.toLowerCase() === 'revenue' ? 'revenue' : 'expense';
            periods[p][type] = parseFloat(row.total) || 0;
        });
        
        res.json(Object.values(periods));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/search', (req, res) => {
    const { inicio, fim } = req.query;
    try {
        const sql = `
            SELECT t.*, a.name as account_name, c.name as category_name 
            FROM Transactions t
            LEFT JOIN Accounts a ON t.account_id = a.id
            LEFT JOIN Categories c ON t.category_id = c.id
            WHERE t.date BETWEEN ? AND ?
            ORDER BY t.date DESC
        `;
        res.json(queryAll(sql, [inicio, fim]));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;