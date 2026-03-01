const express = require('express');
const router = express.Router();
const db = require('../database'); 

const queryAll = (sql, params = []) => db.prepare(sql).all(params);

router.get('/trend', (req, res) => {
    const { months = 6, categoryId, viewType = 'financeiro', inicio, fim } = req.query;
    const numMonths = parseInt(months) || 6;
    
    const dateColumn = viewType === 'consumo' ? 'purchase_date' : 'date';

    try {
        let sql = `
            SELECT 
                strftime('%Y-%m', ${dateColumn}) as period, 
                type, 
                SUM(amount) as total
            FROM Transactions
            WHERE 1=1
        `;
        let params = [];

        if (inicio && fim && inicio !== '' && fim !== '') {
            sql += ` AND ${dateColumn} BETWEEN ? AND ?`;
            params.push(inicio, fim);
        } else {
            const today = new Date();
            const dataCorteDate = new Date(today.getFullYear(), today.getMonth() - numMonths + 1, 1);
            const dataCorte = `${dataCorteDate.getFullYear()}-${String(dataCorteDate.getMonth()+1).padStart(2, '0')}-01`;
            sql += ` AND ${dateColumn} >= ?`;
            params.push(dataCorte);
        }

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

/**
 * GET: Busca Global (Simplificada e Poderosa)
 * Filtra por datas e busca o texto em qualquer campo relevante:
 * Descrição, Subgrupo, Nome da Conta ou Nome da Categoria.
 */
router.get('/search', (req, res) => {
    const { inicio, fim, texto } = req.query;
    
    try {
        // SQL com Busca Global usando OR em múltiplas colunas
        let sql = `
            SELECT t.*, a.name as account_name, c.name as category_name 
            FROM Transactions t
            LEFT JOIN Accounts a ON t.account_id = a.id
            LEFT JOIN Categories c ON t.category_id = c.id
            WHERE t.date BETWEEN ? AND ?
        `;
        let params = [inicio, fim];

        if (texto && texto.trim() !== '') {
            const term = `%${texto}%`;
            sql += ` AND (
                t.description LIKE ? 
                OR t.subgroup LIKE ? 
                OR a.name LIKE ? 
                OR c.name LIKE ?
            )`;
            params.push(term, term, term, term);
        }

        sql += ` ORDER BY t.date DESC`;
        
        res.json(queryAll(sql, params));
    } catch (error) {
        console.error("Erro na busca detalhada:", error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;