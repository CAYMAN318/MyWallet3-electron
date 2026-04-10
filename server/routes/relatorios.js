const express = require('express');
const router = express.Router();
const db = require('../database'); 

const queryAll = (sql, params = []) => db.prepare(sql).all(params);

/**
 * GET: Trend (Evolução Mensal com Lógica de Fallback para Receitas)
 */
router.get('/trend', (req, res) => {
    const { months = 6, categoryId, viewType = 'financeiro', inicio, fim } = req.query;
    const numMonths = parseInt(months) || 6;
    
    // CORREÇÃO TÁTICA: No regime de Consumo, usamos purchase_date para despesas,
    // mas para receitas (que não têm purchase_date), usamos a data padrão.
    // O NULLIF garante que strings vazias sejam tratadas como NULL para o COALESCE funcionar.
    const effectiveDate = viewType === 'consumo' 
        ? "COALESCE(NULLIF(purchase_date, ''), date)" 
        : "date";

    try {
        let dataInicio, dataFim;
        const today = new Date();

        if (inicio && fim && inicio !== '' && fim !== '') {
            dataInicio = inicio;
            dataFim = fim;
        } else {
            const startObj = new Date(today.getFullYear(), today.getMonth() - numMonths + 1, 1);
            dataInicio = `${startObj.getFullYear()}-${String(startObj.getMonth() + 1).padStart(2, '0')}-01`;
            const endObj = new Date(today.getFullYear(), today.getMonth() + 1, 0); 
            dataFim = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
        }

        // QUERY 1: Dados do Gráfico (Usa a data efetiva corrigida)
        let sqlChart = `
            SELECT 
                strftime('%Y-%m', ${effectiveDate}) as period, 
                type, 
                SUM(amount) as total
            FROM Transactions
            WHERE ${effectiveDate} BETWEEN ? AND ?
        `;
        let paramsChart = [dataInicio, dataFim];

        if (categoryId && categoryId !== 'all') {
            sqlChart += ` AND (type = 'revenue' OR (type = 'expense' AND category_id = ?))`;
            paramsChart.push(categoryId);
        }
        sqlChart += ` GROUP BY period, type ORDER BY period ASC`;
        const chartDataRaw = queryAll(sqlChart, paramsChart);

        // QUERY 2: Dados Globais (Usa a data efetiva corrigida para não sumir com as receitas)
        const sqlGlobal = `
            SELECT type, SUM(amount) as total
            FROM Transactions
            WHERE ${effectiveDate} BETWEEN ? AND ?
            GROUP BY type
        `;
        const globalDataRaw = queryAll(sqlGlobal, [dataInicio, dataFim]);

        const periods = {};
        chartDataRaw.forEach(row => {
            const p = row.period;
            if (!periods[p]) periods[p] = { period: p, revenue: 0, expense: 0 };
            const type = row.type === 'revenue' ? 'revenue' : 'expense';
            periods[p][type] = parseFloat(row.total) || 0;
        });

        let globalTotalRevenue = 0;
        let globalTotalExpense = 0;
        globalDataRaw.forEach(row => {
            if (row.type === 'revenue') globalTotalRevenue = parseFloat(row.total) || 0;
            if (row.type === 'expense') globalTotalExpense = parseFloat(row.total) || 0;
        });

        const dStart = new Date(dataInicio + 'T12:00:00');
        const dEnd = new Date(dataFim + 'T12:00:00');
        let exactMonths = (dEnd.getFullYear() - dStart.getFullYear()) * 12 + (dEnd.getMonth() - dStart.getMonth()) + 1;
        if (exactMonths <= 0) exactMonths = 1;

        res.json({
            chartData: Object.values(periods),
            globalData: {
                revenue: globalTotalRevenue,
                expense: globalTotalExpense,
                divisorMeses: exactMonths
            }
        });
        
    } catch (error) {
        console.error("Erro no relatorio Trend:", error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET: Busca Global (Mantida Intacta)
 */
router.get('/search', (req, res) => {
    const { inicio, fim, texto } = req.query;
    try {
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
            sql += ` AND (t.description LIKE ? OR t.subgroup LIKE ? OR a.name LIKE ? OR c.name LIKE ?)`;
            params.push(term, term, term, term);
        }

        sql += ` ORDER BY t.date DESC`;
        res.json(queryAll(sql, params));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;