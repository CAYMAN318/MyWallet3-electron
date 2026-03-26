const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * GET: Retorna o status da Matriz para o mês atual
 * Versão Blindada: Consegue interpretar subgrupos em formato JSON ou String simples.
 */
router.get('/status', (req, res) => {
    const { mes, ano } = req.query;
    const hoje = new Date();
    const m = mes || (hoje.getMonth() + 1);
    const a = ano || hoje.getFullYear();
    const periodo = `${a}-${String(m).padStart(2, '0')}`;

    try {
        // 1. Busca os itens da Matriz configurados
        const matriz = db.prepare(`
            SELECT ch.id, ch.category_id, ch.subgroup_name, c.name as category_name
            FROM Checklist ch
            JOIN Categories c ON ch.category_id = c.id
        `).all();

        // 2. Busca lançamentos do mês (Agora verificando a coluna is_paid)
        const lancamentos = db.prepare(`
            SELECT category_id, subgroup, amount, date, purchase_date, is_paid
            FROM Transactions
            WHERE strftime('%Y-%m', date) = ? OR strftime('%Y-%m', purchase_date) = ?
        `).all([periodo, periodo]);

        /**
         * Função de Normalização:
         * Tenta extrair o nome real do subgrupo, mesmo que esteja num formato antigo/JSON.
         */
        const extrairNomeSubgrupo = (val) => {
            if (!val) return "";
            const str = val.toString().trim();
            // Se parecer JSON, tenta extrair a propriedade 'name'
            if (str.startsWith('{') || str.startsWith('[')) {
                try {
                    const parsed = JSON.parse(str);
                    return (parsed.name || parsed.subgroup_name || str).trim().toLowerCase();
                } catch (e) { }
            }
            return str.toLowerCase();
        };

        // 3. Cruzamento de dados com tolerância a formatos
        const resultado = matriz.map(item => {
            const nomeConfigurado = extrairNomeSubgrupo(item.subgroup_name);
            
            const transacao = lancamentos.find(l => {
                const nomeLancado = extrairNomeSubgrupo(l.subgroup);
                return l.category_id === item.category_id && nomeLancado === nomeConfigurado;
            });

            // Verifica as novas regras de pendência
            const isEfetivamentePago = transacao && transacao.is_paid === 1;
            const isLancadoMasPendente = transacao && transacao.is_paid === 0;

            return {
                ...item,
                status: isEfetivamentePago ? 'pago' : (isLancadoMasPendente ? 'pendente_lancado' : 'pendente_ausente'),
                valor: transacao ? transacao.amount : 0,
                data: transacao ? (transacao.purchase_date || transacao.date) : null
            };
        });

        res.json(resultado);
    } catch (error) {
        console.error(">>> [ERRO CHECKLIST STATUS]", error.message);
        res.status(500).json({ error: error.message });
    }
});

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

router.get('/config', (req, res) => {
    try {
        res.json(db.prepare(`SELECT category_id, subgroup_name FROM Checklist`).all());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;