const express = require('express');
const router = express.Router();
const db = require('../database'); 

const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

/**
 * Rota Trend: Evolução e Detalhamento
 * Suporta: viewType (financeiro/consumo), categoryId, startDate e endDate
 */
router.get('/trend', (req, res) => {
    const { months, categoryId, viewType = 'financeiro', startDate, endDate } = req.query;
    
    // Define qual coluna de data usar no SQL
    const dateColumn = viewType === 'consumo' ? 'purchase_date' : 'date';
    
    let dataInicio;
    let dataFim = endDate || '9999-12-31';

    // Se o usuário não enviou data manual, calcula pelos meses (ex: últimos 6)
    if (startDate) {
        dataInicio = startDate;
    } else {
        const numMonths = parseInt(months) || 6;
        const today = new Date();
        const corte = new Date(today.getFullYear(), today.getMonth() - numMonths + 1, 1);
        dataInicio = `${corte.getFullYear()}-${String(corte.getMonth()+1).padStart(2, '0')}-01`;
    }

    try {
        // 1. Dados para o Gráfico de Linhas (Evolução Mensal/Temporal)
        let sqlTrend = `
            SELECT 
                strftime('%Y-%m', ${dateColumn}) as period, 
                type, 
                SUM(amount) as total
            FROM Transactions
            WHERE ${dateColumn} >= ? AND ${dateColumn} <= ?
        `;
        let paramsTrend = [dataInicio, dataFim];

        if (categoryId && categoryId !== 'all') {
            // Se filtrar por categoria, mostramos a despesa dela e a receita total para base
            sqlTrend += ` AND (type = 'revenue' OR (type = 'expense' AND category_id = ?))`;
            paramsTrend.push(categoryId);
        }
        sqlTrend += ` GROUP BY period, type ORDER BY period ASC`;
        const trendData = queryAll(sqlTrend, paramsTrend);

        // 2. Dados para o Gráfico de Pizza (Breakdown)
        let breakdown = [];
        if (categoryId && categoryId !== 'all') {
            // Se tem categoria, detalha por SUBGRUPOS
            const sqlBreakdown = `
                SELECT IFNULL(subgroup, 'Sem Subgrupo') as name, SUM(amount) as value
                FROM Transactions
                WHERE ${dateColumn} BETWEEN ? AND ?
                AND category_id = ? AND type = 'expense'
                GROUP BY subgroup ORDER BY value DESC
            `;
            breakdown = queryAll(sqlBreakdown, [dataInicio, dataFim, categoryId]);
        } else {
            // Se for "Todas", detalha por CATEGORIAS PAI
            const sqlBreakdownAll = `
                SELECT c.name as name, SUM(t.amount) as value
                FROM Transactions t
                JOIN Categories c ON t.category_id = c.id
                WHERE t.${dateColumn} BETWEEN ? AND ? AND t.type = 'expense'
                GROUP BY c.name ORDER BY value DESC
            `;
            breakdown = queryAll(sqlBreakdownAll, [dataInicio, dataFim]);
        }

        // 3. Resumo Financeiro (Totais Absolutos)
        const sqlSummary = `
            SELECT 
                SUM(CASE WHEN type = 'revenue' THEN amount ELSE 0 END) as totalRev,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as totalExp
            FROM Transactions
            WHERE ${dateColumn} BETWEEN ? AND ?
            ${categoryId && categoryId !== 'all' ? 'AND category_id = ?' : ''}
        `;
        const summaryParams = [dataInicio, dataFim];
        if (categoryId && categoryId !== 'all') summaryParams.push(categoryId);
        const summary = db.prepare(sqlSummary).get(summaryParams);

        res.json({
            trend: trendData,
            breakdown: breakdown,
            summary: {
                totalExpense: summary.totalExp || 0,
                totalRevenue: summary.totalRev || 0,
                balance: (summary.totalRev || 0) - (summary.totalExp || 0)
            }
        });

    } catch (error) {
        console.error("Erro Relatório Trend:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Rota 2: Busca Detalhada (Lista)
 * Suporta agora filtragem por tipo e categoria diretamente no SQL para melhor performance
 */
router.get('/search', (req, res) => {
    const { inicio, fim, type, categoryId } = req.query;
    try {
        let sql = `
            SELECT t.*, a.name as account_name, c.name as category_name 
            FROM Transactions t
            LEFT JOIN Accounts a ON t.account_id = a.id
            LEFT JOIN Categories c ON t.category_id = c.id
            WHERE t.date BETWEEN ? AND ?
        `;
        let params = [inicio, fim];

        if (type && type !== 'all') {
            sql += ` AND t.type = ?`;
            params.push(type);
        }

        if (categoryId && categoryId !== 'all') {
            sql += ` AND t.category_id = ?`;
            params.push(categoryId);
        }

        sql += ` ORDER BY t.date DESC`;
        res.json(queryAll(sql, params));
    } catch (error) {
        console.error("Erro na busca detalhada:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;