const express = require('express');
const router = express.Router();
const db = require('../database'); 

const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

// Rota 1: Tendência Mensal (Gráfico)
router.get('/trend', (req, res) => {
    const { months = 6 } = req.query;
    const numMonths = parseInt(months) || 6;

    const today = new Date();
    // Cálculo de data sem usar toISOString para evitar erro de Timezone (importante no Brasil)
    const dataCorteDate = new Date(today.getFullYear(), today.getMonth() - numMonths + 1, 1);
    const ano = dataCorteDate.getFullYear();
    const mes = String(dataCorteDate.getMonth() + 1).padStart(2, '0');
    const dataCorte = `${ano}-${mes}-01`;

    try {
        // Buscamos os dados agrupados por mês
        // O strftime só funciona se a data for YYYY-MM-DD. 
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
        
        const rawData = queryAll(sql, [dataCorte]);

        // Se o strftime falhar (datas em formato errado), tentamos capturar o erro
        if (rawData.length > 0 && rawData[0].period === null) {
            console.error("AVISO: Datas no banco de dados não estão no formato YYYY-MM-DD");
        }

        // Organiza os dados para o formato que o Chart.js espera
        const periods = {};
        rawData.forEach(row => {
            const p = row.period || "Indefinido";
            if (!periods[p]) {
                periods[p] = { period: p, revenue: 0, expense: 0 };
            }
            // Garante que o tipo seja comparado corretamente (minúsculo)
            const type = row.type.toLowerCase() === 'revenue' ? 'revenue' : 'expense';
            periods[p][type] = parseFloat(row.total) || 0;
        });
        
        const formattedData = Object.values(periods);
        res.json(formattedData);

    } catch (error) {
        console.error("Erro Trend API:", error);
        res.status(500).json({ error: "Erro ao processar gráfico" });
    }
});

// Rota 2: Busca Detalhada
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