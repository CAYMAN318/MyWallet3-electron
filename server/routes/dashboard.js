const express = require('express');
const router = express.Router();
const db = require('../database');

// Função auxiliar para buscar todos os resultados (better-sqlite3)
const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

router.get('/', (req, res) => {
    try {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth(); // 0-11

        // Datas limites para consultas SQL (Mês Atual)
        const inicioMes = new Date(anoAtual, mesAtual, 1).toISOString().split('T')[0];
        const fimMes = new Date(anoAtual, mesAtual + 1, 0).toISOString().split('T')[0];
        
        // Data de corte para histórico (6 meses atrás)
        const mesesHistorico = 6;
        const dataCorteHistorico = new Date(anoAtual, mesAtual - mesesHistorico + 1, 1).toISOString().split('T')[0];

        // --- 1. CONSULTAS AO BANCO ---
        
        // A. Saldo Acumulado
        const sqlSaldo = `
            SELECT 
                SUM(CASE WHEN type = 'revenue' THEN amount ELSE -amount END) as total 
            FROM Transactions;
        `;
        const saldoRes = queryAll(sqlSaldo);

        // B. Resumo do Mês Atual (Receitas vs Despesas)
        const sqlMes = `
            SELECT type, SUM(amount) as total 
            FROM Transactions 
            WHERE date >= ? AND date <= ?
            GROUP BY type;
        `;
        const mesRes = queryAll(sqlMes, [inicioMes, fimMes]);

        // C. Despesas por Categoria (Gráfico Rosca)
        const sqlCat = `
            SELECT c.name, SUM(t.amount) as total 
            FROM Transactions t
            JOIN Categories c ON t.category_id = c.id
            WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
            GROUP BY c.name
            ORDER BY total DESC;
        `;
        const catRes = queryAll(sqlCat, [inicioMes, fimMes]);

        // D. Histórico de Transações para Gráfico (Últimos 6 meses)
        const sqlHist = `
            SELECT 
                strftime('%Y-%m', date) as mes,
                type,
                SUM(amount) as total
            FROM Transactions
            WHERE date >= ? 
            GROUP BY mes, type
            ORDER BY mes ASC;
        `;
        const histRes = queryAll(sqlHist, [dataCorteHistorico]);

        // E. Alertas de Teto de Gastos (Gestão por Exceção >= 85%)
        const sqlBudget = `
            SELECT 
                c.name as category_name,
                c.budget_limit,
                SUM(t.amount) as total_spent
            FROM Transactions t
            JOIN Categories c ON t.category_id = c.id
            WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ? 
              AND c.budget_limit IS NOT NULL AND c.budget_limit > 0
            GROUP BY c.id
        `;
        const budgetRes = queryAll(sqlBudget, [inicioMes, fimMes]);
        
        const alertasOrcamento = [];
        budgetRes.forEach(item => {
            const spent = item.total_spent || 0;
            const limit = item.budget_limit;
            const percentage = (spent / limit) * 100;
            
            // Regra de Exceção: Só envia se passou de 85% do teto
            if (percentage >= 85) {
                alertasOrcamento.push({
                    categoria: item.category_name,
                    gasto: spent,
                    limite: limit,
                    percentual: percentage.toFixed(1),
                    critico: percentage >= 100
                });
            }
        });

        // --- 2. RESPOSTA ---
        const saldoTotal = saldoRes[0]?.total || 0;
        const receitaMes = mesRes.find(r => r.type === 'revenue')?.total || 0;
        const despesaMes = mesRes.find(r => r.type === 'expense')?.total || 0;

        res.json({
            saldoTotal,
            resumoMes: {
                receitas: receitaMes,
                despesas: despesaMes,
                saldo: receitaMes - despesaMes
            },
            graficoCategorias: catRes,
            graficoHistorico: histRes,
            alertasOrcamento: alertasOrcamento // <- Novo Array de Alertas
        });

    } catch (err) {
        console.error("Erro Dashboard:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;