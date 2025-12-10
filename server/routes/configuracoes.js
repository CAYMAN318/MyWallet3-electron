const express = require('express');
const router = express.Router();
const db = require('../database');

// Função auxiliar para buscar todos os resultados (better-sqlite3)
const queryAll = (sql, params = []) => {
    return db.prepare(sql).all(params);
};

// Função auxiliar para executar comandos (INSERT, UPDATE, DELETE) (better-sqlite3)
const runStatement = (sql, params = []) => {
    return db.prepare(sql).run(params);
};

/**
 * GET: BUSCAR LISTAS (Contas, GruposDespesa, GruposReceita)
 */
router.get('/', (req, res) => {
    const { type } = req.query;

    try {
        let sql = '';
        let rows = [];

        if (type === 'Conta' || type === 'FormaPagamento') {
            sql = "SELECT id, name, initial_balance, is_credit_card FROM Accounts ORDER BY name";
            rows = queryAll(sql);

        } else if (type === 'GrupoDespesa') {
            // Incluindo a coluna 'color' que garantimos existir no database.js
            sql = "SELECT id, name, subgroups, is_fixed, color FROM Categories WHERE type = 'expense' ORDER BY name";
            rows = queryAll(sql);

        } else if (type === 'GrupoReceita') {
            sql = "SELECT id, name, is_fixed, color FROM Categories WHERE type = 'revenue' ORDER BY name";
            rows = queryAll(sql); // Incluí 'color' também aqui por consistência

        } else {
            return res.status(400).json({ error: "Parâmetro 'type' inválido." });
        }

        // Converte is_credit_card / is_fixed de INTEGER (0, 1) para Boolean
        const finalRows = rows.map(row => {
            return {
                ...row,
                is_credit_card: Boolean(row.is_credit_card),
                is_fixed: Boolean(row.is_fixed),
            };
        });

        res.json(finalRows);

    } catch (err) {
        console.error("Erro ao buscar configurações:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST: CRIAR CONTA OU CATEGORIA
 */
router.post('/', (req, res) => {
    const { type, name, initialBalance, isCreditCard, isFixed, subgroups, color } = req.body;

    if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

    try {
        let sql = '';
        let params = [];
        let result;

        if (type === 'Conta') {
            const isCredit = isCreditCard ? 1 : 0;
            sql = "INSERT INTO Accounts (name, initial_balance, is_credit_card) VALUES (?, ?, ?)";
            params = [name, initialBalance, isCredit];
            result = runStatement(sql, params);
            res.status(201).json({ id: result.lastInsertRowid, message: "Conta criada!" });

        } else if (type === 'GrupoDespesa' || type === 'GrupoReceita') {
            const isExpense = type === 'GrupoDespesa';
            const catType = isExpense ? 'expense' : 'revenue';
            const subs = subgroups && subgroups.length > 0 ? JSON.stringify(subgroups) : null;
            const fixedInt = isFixed ? 1 : 0;
            
            // Inclui color no SQL e nos parâmetros (Usa default se não fornecido)
            const colorValue = isExpense ? color || '#ef4444' : null;

            sql = `INSERT INTO Categories (name, type, subgroups, is_fixed, color) VALUES (?, ?, ?, ?, ?)`;
            params = [name, catType, subs, fixedInt, colorValue];
            
            result = runStatement(sql, params);
            res.status(201).json({ id: result.lastInsertRowid, message: "Categoria criada!" });

        } else {
            return res.status(400).json({ error: "Tipo de configuração inválido." });
        }

    } catch (err) {
        console.error("Erro ao criar item:", err.message);
        // O better-sqlite3 retorna um erro SQLITE_CONSTRAINT com a mensagem
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: "Nome de item já existe." });
        }
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT: ATUALIZAR CONTA OU CATEGORIA
 */
router.put('/:type/:id', (req, res) => {
    const { id, type } = req.params;
    const { 
        name, initialBalance, isCreditCard, 
        isFixed, subgroups, color 
    } = req.body;

    try {
        let sql = '';
        let params = [];
        
        if (type === 'conta') {
            const isCredit = isCreditCard ? 1 : 0;
            sql = "UPDATE Accounts SET name = ?, initial_balance = ?, is_credit_card = ? WHERE id = ?";
            params = [name, initialBalance, isCredit, id];

        } else if (type === 'categoria') {
            const fixedInt = isFixed ? 1 : 0;
            const subs = subgroups && subgroups.length > 0 ? JSON.stringify(subgroups) : null;
            
            // Verifica a cor e usa o valor fornecido
            const colorValue = color || '#ef4444'; 

            sql = "UPDATE Categories SET name = ?, subgroups = ?, is_fixed = ?, color = ? WHERE id = ?";
            params = [name, subs, fixedInt, colorValue, id];

        } else {
            return res.status(400).json({ error: "Tipo de atualização inválido." });
        }

        const result = runStatement(sql, params);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: "Item não encontrado ou nenhum dado alterado." });
        }
        res.json({ message: `${type} atualizada com sucesso!` });

    } catch (err) {
        console.error(`Erro ao atualizar ${type}:`, err.message);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: "Nome de item já existe." });
        }
        res.status(500).json({ error: err.message });
    }
});


/**
 * DELETE: EXCLUIR CONTA OU CATEGORIA
 */
router.delete('/:type/:id', (req, res) => {
    const { id, type } = req.params;

    try {
        // Checagem de integridade: Verifica se há transações vinculadas
        if (type === 'categoria') {
            const checkSql = "SELECT COUNT(*) as count FROM Transactions WHERE category_id = ?";
            const checkResult = queryAll(checkSql, [id]);
            if (checkResult[0].count > 0) {
                return res.status(400).json({ error: `Não é possível excluir: ${checkResult[0].count} lançamentos vinculados.` });
            }
        } else if (type === 'conta') {
            const checkSql = "SELECT COUNT(*) as count FROM Transactions WHERE account_id = ?";
            const checkResult = queryAll(checkSql, [id]);
            if (checkResult[0].count > 0) {
                return res.status(400).json({ error: `Não é possível excluir: ${checkResult[0].count} lançamentos vinculados.` });
            }
        } else {
            return res.status(400).json({ error: "Tipo de exclusão inválido." });
        }

        // Exclusão
        let deleteSql = '';
        if (type === 'categoria') {
            deleteSql = "DELETE FROM Categories WHERE id = ?";
        } else if (type === 'conta') {
            deleteSql = "DELETE FROM Accounts WHERE id = ?";
        }

        const result = runStatement(deleteSql, [id]);

        if (result.changes === 0) {
            return res.status(404).json({ error: `${type} não encontrada.` });
        }
        res.json({ message: `${type} excluída!` });

    } catch (err) {
        console.error(`Erro ao excluir ${type}:`, err.message);
        res.status(500).json({ error: `Erro interno ao excluir ${type}.` });
    }
});


module.exports = router;