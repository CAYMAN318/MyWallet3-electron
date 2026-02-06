const express = require('express');
const router = express.Router();
const db = require('../database'); 
const { v4: uuidv4 } = require('uuid');

const runStatement = (sql, params = []) => {
    return db.prepare(sql).run(params);
};

const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

/**
 * Função Auxiliar para limpar subgrupos
 */
const limparSubgrupo = (sub) => {
    if (!sub) return '';
    let resultado = sub;
    if (Array.isArray(sub)) {
        resultado = sub.length > 0 ? sub[0] : '';
    } else if (typeof sub === 'string') {
        let trimmed = sub.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                resultado = Array.isArray(parsed) ? (parsed[0] || '') : parsed;
            } catch (e) {
                resultado = trimmed.replace(/[\[\]\"\' ]/g, '');
            }
        } else {
            resultado = trimmed;
        }
    }
    return String(resultado).replace(/[\[\]\"\' ]/g, '').trim();
};

// GET: Listar todas as despesas
router.get('/', (req, res) => {
    const sql = `
        SELECT t.*, a.name as account_name, c.name as category_name 
        FROM Transactions t
        LEFT JOIN Accounts a ON t.account_id = a.id
        LEFT JOIN Categories c ON t.category_id = c.id
        WHERE t.type = 'expense'
        ORDER BY t.date DESC
    `;
    try {
        res.json(queryAll(sql, []));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Criar Despesa
router.post('/', (req, res) => {
    const { 
        description, amount, date, purchaseDate, accountId, categoryId, subgroup, 
        isInstallment, numParcelas, isFixed 
    } = req.body;

    const totalInsertions = isInstallment ? parseInt(numParcelas) : 1;
    const groupId = isInstallment ? uuidv4() : null;
    const valorParcela = parseFloat(amount) / totalInsertions;
    
    const insertSql = `
        INSERT INTO Transactions 
        (account_id, category_id, description, type, amount, date, purchase_date, is_fixed, is_installment, installment_number, installment_total, installment_group_id, subgroup)
        VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        db.exec('BEGIN');
        for (let i = 0; i < totalInsertions; i++) {
            const [y, m, d] = date.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            dateObj.setMonth(dateObj.getMonth() + i);
            const vencimentoStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            const compraStr = purchaseDate || date;

            runStatement(insertSql, [
                accountId, categoryId, description, valorParcela, vencimentoStr, compraStr,
                isFixed ? 1 : 0, isInstallment ? 1 : 0, i + 1, totalInsertions, groupId, limparSubgrupo(subgroup)
            ]);
        }
        db.exec('COMMIT');
        res.status(201).json({ message: "Salvo com sucesso!" });
    } catch (err) {
        db.exec('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// PUT: Editar Despesa (CORRIGIDO: Inclui purchase_date e mapeamento de campos)
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { description, amount, date, purchaseDate, accountId, categoryId, subgroup } = req.body;

    const subgrupoLimpo = limparSubgrupo(subgroup);
    const dataCompra = purchaseDate || date; // Garante que a data de consumo seja atualizada também

    const sql = `
        UPDATE Transactions 
        SET description = ?, amount = ?, date = ?, purchase_date = ?, account_id = ?, category_id = ?, subgroup = ?
        WHERE id = ?
    `;

    try {
        const result = runStatement(sql, [description, amount, date, dataCompra, accountId, categoryId, subgrupoLimpo, id]);
        if (result.changes === 0) return res.status(404).json({ error: "Lançamento não encontrado." });
        res.json({ message: "Atualizado com sucesso!" });
    } catch (err) {
        console.error("Erro ao editar despesa:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Excluir Despesa (CORRIGIDO: Tratamento de erro e retorno)
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const { groupId } = req.query;
    
    let sql = (groupId && groupId !== 'null' && groupId !== 'undefined') ? 
        "DELETE FROM Transactions WHERE installment_group_id = ?" : 
        "DELETE FROM Transactions WHERE id = ?";
    
    try {
        const result = runStatement(sql, [(groupId && groupId !== 'null' && groupId !== 'undefined') ? groupId : id]);
        if (result.changes === 0) return res.status(404).json({ error: "Nada foi excluído." });
        res.json({ message: "Excluído com sucesso!" });
    } catch (err) {
        console.error("Erro ao excluir despesa:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;