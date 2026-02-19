const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * GET: Retorna o status da Matriz para o mês atual
 * Versão inteligente: lida com subgrupos em formato de string simples ou objeto JSON
 */
router.get('/status', (req, res) => {
    const { mes, ano } = req.query;
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;

    try {
        // 1. Busca os itens da Matriz
        const matriz = db.prepare(`
            SELECT ch.id, ch.category_id, ch.subgroup_name, c.name as category_name
            FROM Checklist ch
            JOIN Categories c ON ch.category_id = c.id
        `).all();

        // 2. Busca lançamentos do mês
        const lancamentos = db.prepare(`
            SELECT category_id, subgroup, amount, date, purchase_date
            FROM Transactions
            WHERE strftime('%Y-%m', date) = ? OR strftime('%Y-%m', purchase_date) = ?
        `).all([periodo, periodo]);

        // 3. Função auxiliar para normalizar o nome do subgrupo (Limpa JSON se houver)
        const normalizar = (val) => {
            if (!val) return '';
            if (val.startsWith('{')) {
                try {
                    const obj = JSON.parse(val);
                    return obj.name || val;
                } catch (e) { return val; }
            }
            return val;
        };

        // 4. Cruzamento de dados
        const resultado = matriz.map(item => {
            // Procura um lançamento que coincida com a categoria e o nome do subgrupo (normalizado)
            const pago = lancamentos.find(l => {
                const subNormalizado = normalizar(l.subgroup);
                return l.category_id === item.category_id && 
                       subNormalizado.toLowerCase() === item.subgroup_name.toLowerCase();
            });

            return {
                ...item,
                status: pago ? 'pago' : 'pendente',
                valor: pago ? pago.amount : 0,
                data: pago ? (pago.purchase_date || pago.date) : null
            };
        });

        res.json(resultado);
    } catch (error) {
        console.error("Erro no checklist status:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Alternar item na Matriz
router.post('/toggle', (req, res) => {
    const { categoryId, subgroupName, active } = req.body;
    try {
        if (active) {
            db.prepare(`INSERT OR IGNORE INTO Checklist (category_id, subgroup_name) VALUES (?, ?)`).run(categoryId, subgroupName);
        } else {
            db.prepare(`DELETE FROM Checklist WHERE category_id = ? AND subgroup_name = ?`).run(categoryId, subgroupName);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET: Configuração da Matriz
router.get('/config', (req, res) => {
    try {
        const itens = db.prepare(`SELECT category_id, subgroup_name FROM Checklist`).all();
        res.json(itens);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;