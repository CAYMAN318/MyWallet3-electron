const express = require('express');
const router = express.Router();
const db = require('../database'); 

// Função auxiliar para buscar todos os resultados (better-sqlite3)
const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

// Rota 1: Relatório de Tendência Mensal (Receitas vs Despesas ao longo do tempo)
// GET /api/relatorios/trend?months=6
router.get('/trend', (req, res) => {
    const { months = 6 } = req.query;
    const numMonths = parseInt(months) || 6;

    const today = new Date();
    const anoAtual = today.getFullYear();
    const mesAtual = today.getMonth();

    // Calcula a data de corte (N meses atrás)
    const dataCorte = new Date(anoAtual, mesAtual - numMonths + 1, 1).toISOString().split('T')[0];

    try {
        const sql = `
            SELECT 
                strftime('%Y-%m', date) as period, 
                type, 
                SUM(amount) as total
            FROM Transactions
            WHERE date >= ?
            GROUP BY period, type
            ORDER BY period ASC;
        `;
        
        const data = queryAll(sql, [dataCorte]);

        // Estrutura o resultado para o frontend: { period: '2025-11', revenue: 1000, expense: 500 }
        const periods = {};
        data.forEach(row => {
            if (!periods[row.period]) {
                periods[row.period] = { period: row.period, revenue: 0, expense: 0 };
            }
            periods[row.period][row.type] = parseFloat(row.total);
        });
        
        const formattedData = Object.values(periods);

        res.json(formattedData);
    } catch (error) {
        console.error("Erro ao buscar relatório de tendência:", error);
        res.status(500).json({ error: "Erro interno ao processar relatório." });
    }
});

module.exports = router;