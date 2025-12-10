const express = require('express');
const router = express.Router();
const db = require('../database'); 
const { v4: uuidv4 } = require('uuid');

// Função auxiliar para preparar e executar consultas síncronas (better-sqlite3)
const runStatement = (sql, params = []) => {
    return db.prepare(sql).run(params);
};

// Função auxiliar para buscar todos os resultados (better-sqlite3)
const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

// GET: Listar todas as despesas
router.get('/', (req, res) => {
    const sql = `
        SELECT 
            t.*, 
            a.name as account_name, 
            c.name as category_name 
        FROM Transactions t
        LEFT JOIN Accounts a ON t.account_id = a.id
        LEFT JOIN Categories c ON t.category_id = c.id
        WHERE t.type = 'expense'
        ORDER BY t.date DESC
    `;
    
    try {
        const rows = queryAll(sql, []);
        res.json(rows);
    } catch (err) {
        console.error(">>> [ERRO DB] Falha ao buscar despesas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST: Criar Despesa (Inclui Parcelamento)
router.post('/', (req, res) => {
    const { 
        description, amount, date, accountId, categoryId, subgroup, 
        isInstallment, numParcelas, isFixed, firstInstallmentDate 
    } = req.body;

    const totalInsertions = isInstallment ? parseInt(numParcelas) : 1;
    const isInstallmentInt = isInstallment ? 1 : 0;
    const fixedInt = isFixed ? 1 : 0;
    const valorParcela = isInstallment ? (parseFloat(amount) / totalInsertions).toFixed(2) : amount;
    const groupId = isInstallment ? uuidv4() : null;

    if (!description || !amount || !date || !categoryId) {
        return res.status(400).json({ error: "Descrição, Valor, Data e Categoria são obrigatórios." });
    }

    // Inicia a transação (para garantir atomicidade em caso de parcelas)
    db.exec('BEGIN');

    const sql = `
        INSERT INTO Transactions (
            account_id, category_id, description, type, amount, date, 
            is_installment, installment_number, installment_total, installment_group_id, subgroup, is_fixed
        )
        VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        let baseDate = new Date(firstInstallmentDate || date);
        
        for (let i = 0; i < totalInsertions; i++) {
            // Calcula a data de vencimento da parcela (Mês da primeira parcela + i meses)
            let insertionDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
            let dataString = insertionDate.toISOString().split('T')[0];

            const descFinal = isInstallment ? `[Parc ${i + 1}/${totalInsertions}] ${description}` : description;
                
            runStatement(sql, [
                accountId, categoryId, descFinal, valorParcela, dataString,
                isInstallmentInt, i + 1, totalInsertions, groupId, subgroup, fixedInt
            ]);
        }

        db.exec('COMMIT');
        console.log(">>> [POST] Despesa salva com sucesso!");
        res.status(201).json({ message: "Despesa(s) salva(s) com sucesso!" });

    } catch (err) {
        db.exec('ROLLBACK');
        console.error(">>> [ERRO POST] Erro ao salvar despesa:", err);
        res.status(500).json({ error: "Erro ao processar transação no banco." });
    }
});

// DELETE: Excluir Despesa (ou Grupo de Parcelas)
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const { groupId } = req.query;

    let sql = '';
    let params = [];

    // Se houver groupId, exclui todas as parcelas do grupo
    if (groupId && groupId !== 'null' && groupId !== 'undefined') {
        sql = "DELETE FROM Transactions WHERE installment_group_id = ?";
        params = [groupId];
    } else {
        // Senão, exclui apenas o item único
        sql = "DELETE FROM Transactions WHERE id = ?";
        params = [id];
    }

    try {
        const result = runStatement(sql, params);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Despesa não encontrada." });
        }
        res.json({ message: "Despesa(s) excluída(s)!" });
    } catch (err) {
        console.error("Erro ao excluir despesa:", err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;