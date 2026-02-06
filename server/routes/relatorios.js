const express = require('express');
const router = express.Router();
const db = require('../database'); 

const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

/**
 * Rota 1: Tendência e Resumo (Versão Corrigida)
 */
router.get('/trend', (req, res) => {
    const { months, categoryId, viewType = 'financeiro', startDate, endDate } = req.query;
    
    const dateColumn = viewType === 'consumo' ? 'purchase_date' : 'date';
    let dataCorte;
    let dataFim = endDate || '9999-12-31';

    if (startDate) {
        dataCorte = startDate;
    } else {
        const numMonths = parseInt(months) || 6;
        const today = new Date();
        const corte = new Date(today.getFullYear(), today.getMonth() - numMonths + 1, 1);
        dataCorte = `${corte.getFullYear()}-${String(corte.getMonth()+1).padStart(2, '0')}-01`;
    }

    try {
        // 1. Consulta para o Gráfico de Linhas (Evolução Mensal)
        // Adicionamos a lógica para garantir que receitas e despesas venham corretamente no "All"
        let sqlTrend = `
            SELECT 
                strftime('%Y-%m', ${dateColumn}) as period, 
                type, 
                SUM(amount) as total
            FROM Transactions
            WHERE ${dateColumn} >= ? AND ${dateColumn} <= ?
        `;
        let paramsTrend = [dataCorte, dataFim];

        if (categoryId && categoryId !== 'all') {
            // Filtra despesas da categoria mas mantém as receitas para comparação
            sqlTrend += ` AND (type = 'revenue' OR (type = 'expense' AND category_id = ?))`;
            paramsTrend.push(categoryId);
        }

        sqlTrend += ` GROUP BY period, type ORDER BY period ASC;`;
        const trendData = queryAll(sqlTrend, paramsTrend);

        // 2. Detalhamento (Breakdown) e Totais
        let breakdown = [];
        let totalExpense = 0;
        let totalRevenue = 0;

        if (categoryId && categoryId !== 'all') {
            // Visão por Subgrupos dentro da categoria
            const sqlBreakdown = `
                SELECT IFNULL(subgroup, 'Sem Subgrupo') as name, SUM(amount) as value
                FROM Transactions
                WHERE ${dateColumn} BETWEEN ? AND ?
                AND category_id = ?
                AND type = 'expense'
                GROUP BY subgroup
                ORDER BY value DESC
            `;
            breakdown = queryAll(sqlBreakdown, [dataCorte, dataFim, categoryId]);
        } else {
            // Visão por Categorias Pai (Quando selecionado "Todas")
            const sqlBreakdownAll = `
                SELECT c.name as name, SUM(t.amount) as value
                FROM Transactions t
                JOIN Categories c ON t.category_id = c.id
                WHERE t.${dateColumn} BETWEEN ? AND ?
                AND t.type = 'expense'
                GROUP BY c.name
                ORDER BY value DESC
            `;
            breakdown = queryAll(sqlBreakdownAll, [dataCorte, dataFim]);
        }

        // 3. Totais Absolutos do Período
        const sqlTotals = `
            SELECT 
                SUM(CASE WHEN type = 'revenue' THEN amount ELSE 0 END) as totalRev,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as totalExp
            FROM Transactions
            WHERE ${dateColumn} BETWEEN ? AND ?
            ${categoryId && categoryId !== 'all' ? 'AND category_id = ?' : ''}
        `;
        const totalParams = [dataCorte, dataFim];
        if (categoryId && categoryId !== 'all') totalParams.push(categoryId);
        
        const totals = db.prepare(sqlTotals).get(totalParams);
        totalRevenue = totals.totalRev || 0;
        totalExpense = totals.totalExp || 0;

        res.json({
            trend: trendData,
            breakdown: breakdown,
            summary: {
                totalExpense,
                totalRevenue,
                balance: totalRevenue - totalExpense
            }
        });
    } catch (error) {
        console.error("Erro na rota /trend:", error);
        res.status(500).json({ error: error.message });
    }
});

// Rota 2: Busca Detalhada (Mantida)
router.get('/search', (req, res) => {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: "Datas obrigatórias." });
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