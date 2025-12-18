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
 * Função Auxiliar para limpar subgrupos (Ultra Robusta)
 * Remove colchetes, aspas e formatação JSON para exibir apenas o texto limpo
 */
const limparSubgrupo = (sub) => {
    if (!sub) return '';
    
    let resultado = sub;

    // Se for um array literal
    if (Array.isArray(sub)) {
        resultado = sub.length > 0 ? sub[0] : '';
    } else if (typeof sub === 'string') {
        let trimmed = sub.trim();
        
        // Se parece um JSON ["Valor"]
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    resultado = parsed.length > 0 ? parsed[0] : '';
                } else {
                    resultado = parsed;
                }
            } catch (e) {
                // Se o parse falhar, limpamos manualmente
                resultado = trimmed.replace(/[\[\]\"\' ]/g, '');
            }
        } else {
            resultado = trimmed;
        }
    }

    // Limpeza final de caracteres residuais de JSON
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
        const rows = queryAll(sql, []);
        
        // Limpeza agressiva no envio para o frontend
        const rowsTratadas = rows.map(row => ({
            ...row,
            subgroup: limparSubgrupo(row.subgroup)
        }));
        
        res.json(rowsTratadas);
    } catch (err) {
        console.error("Erro ao listar despesas:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST: Criar Despesa (Inclui Parcelamento)
router.post('/', (req, res) => {
    const { 
        description, amount, date, accountId, categoryId, subgroup, 
        isInstallment, numParcelas, isFixed 
    } = req.body;

    const totalInsertions = isInstallment ? parseInt(numParcelas) : 1;
    const groupId = isInstallment ? uuidv4() : null;
    
    // Limpamos o subgrupo antes de salvar para evitar ["Valor"] no banco
    const subgrupoLimpo = limparSubgrupo(subgroup);

    const valorParcela = parseFloat(amount) / totalInsertions;
    const fixedInt = isFixed ? 1 : 0;
    const isInstallmentInt = isInstallment ? 1 : 0;

    const insertSql = `
        INSERT INTO Transactions 
        (account_id, category_id, description, type, amount, date, is_fixed, is_installment, installment_number, installment_total, installment_group_id, subgroup)
        VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        db.exec('BEGIN');

        for (let i = 0; i < totalInsertions; i++) {
            const [year, month, day] = date.split('-').map(Number);
            const dataObj = new Date(year, month - 1, day);
            dataObj.setMonth(dataObj.getMonth() + i);

            const y = dataObj.getFullYear();
            const m = String(dataObj.getMonth() + 1).padStart(2, '0');
            const d = String(dataObj.getDate()).padStart(2, '0');
            const dataString = `${y}-${m}-${d}`;

            runStatement(insertSql, [
                accountId, categoryId, description, valorParcela, dataString,
                fixedInt, isInstallmentInt, i + 1, totalInsertions, groupId, subgrupoLimpo
            ]);
        }

        db.exec('COMMIT');
        res.status(201).json({ message: "Salvo com sucesso!" });
    } catch (err) {
        db.exec('ROLLBACK');
        console.error("Erro ao salvar despesa:", err);
        res.status(500).json({ error: err.message });
    }
});

// PUT: Editar Despesa
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { description, amount, date, accountId, categoryId, subgroup } = req.body;

    const subgrupoLimpo = limparSubgrupo(subgroup);

    const sql = `
        UPDATE Transactions 
        SET description = ?, amount = ?, date = ?, account_id = ?, category_id = ?, subgroup = ?
        WHERE id = ?
    `;

    try {
        runStatement(sql, [description, amount, date, accountId, categoryId, subgrupoLimpo, id]);
        res.json({ message: "Atualizado com sucesso!" });
    } catch (err) {
        console.error("Erro ao editar despesa:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Excluir Despesa (ou Grupo de Parcelas)
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const { groupId } = req.query;
    
    let sql = (groupId && groupId !== 'null' && groupId !== 'undefined') ? 
        "DELETE FROM Transactions WHERE installment_group_id = ?" : 
        "DELETE FROM Transactions WHERE id = ?";
    
    try {
        runStatement(sql, [(groupId && groupId !== 'null' && groupId !== 'undefined') ? groupId : id]);
        res.json({ message: "Excluído com sucesso!" });
    } catch (err) {
        console.error("Erro ao excluir despesa:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;