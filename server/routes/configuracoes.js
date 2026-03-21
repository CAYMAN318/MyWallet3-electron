const express = require('express');
const router = express.Router();
const db = require('../database');

// Funções auxiliares para o better-sqlite3 (Síncrono)
const queryAll = (sql, params = []) => db.prepare(sql).all(params);
const runStatement = (sql, params = []) => db.prepare(sql).run(params);

/**
 * FUNÇÃO DE AUTO-REPARO (MIGRAÇÃO DINÂMICA)
 * Garante que o banco antigo (backup) ganhe as novas colunas sem travar o app.
 */
const garantirEsquemaAtualizado = () => {
    try {
        const info = db.prepare("PRAGMA table_info(Categories)").all();
        const colunas = info.map(c => c.name);

        if (!colunas.includes('subgroups')) {
            console.log(">>> [MIGRAÇÃO] Adicionando coluna 'subgroups' em Categories...");
            db.prepare("ALTER TABLE Categories ADD COLUMN subgroups TEXT DEFAULT ''").run();
        }
        if (!colunas.includes('color')) {
            console.log(">>> [MIGRAÇÃO] Adicionando coluna 'color' em Categories...");
            db.prepare("ALTER TABLE Categories ADD COLUMN color TEXT DEFAULT '#ef4444'").run();
        }
    } catch (e) {
        console.error("Erro na migração dinâmica:", e.message);
    }
};

/**
 * GET: EXPORTAR DADOS PARA EXCEL (CSV)
 * Rota dedicada para gerar relatório analítico completo.
 */
router.get('/export/csv', (req, res) => {
    try {
        const sql = `
            SELECT 
                t.date as DataLancamento,
                t.purchase_date as DataCompra,
                t.description as Descricao,
                t.amount as Valor,
                CASE WHEN t.type = 'expense' THEN 'Despesa' ELSE 'Receita' END as Tipo,
                c.name as Categoria,
                t.subgroup as Subgrupo,
                a.name as Conta
            FROM Transactions t
            LEFT JOIN Categories c ON t.category_id = c.id
            LEFT JOIN Accounts a ON t.account_id = a.id
            ORDER BY t.date DESC
        `;
        const rows = queryAll(sql);

        if (rows.length === 0) {
            return res.status(404).send("Nenhum dado encontrado para exportar.");
        }

        // Prepara o cabeçalho CSV usando ponto-e-vírgula (padrão do Excel no Brasil)
        const colunas = Object.keys(rows[0]);
        let csvBr = colunas.join(';') + '\n';

        // Preenche as linhas processando formatações
        rows.forEach(row => {
            const valores = colunas.map(col => {
                let val = row[col] === null ? '' : row[col].toString();
                
                // Escapar aspas duplas
                val = val.replace(/"/g, '""');
                
                // Tratar o valor monetário para o Excel BR (substitui . por ,)
                if (col === 'Valor') {
                    val = val.replace('.', ',');
                }

                // Envolver campos em aspas se contiverem caracteres que quebram o CSV
                if (val.search(/("|;|\n)/g) >= 0) {
                    val = `"${val}"`;
                }
                return val;
            });
            csvBr += valores.join(';') + '\n';
        });

        // Configuração dos headers HTTP para download de arquivo e codificação UTF-8
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="mywallet3_extrato_completo.csv"');
        
        // Escreve o BOM (Byte Order Mark) para forçar o Excel a ler acentuações corretamente
        res.write(Buffer.from('\uFEFF', 'utf-8'));
        res.write(csvBr);
        res.end();
        
    } catch (err) {
        console.error("Erro ao exportar CSV:", err.message);
        res.status(500).send("Erro interno ao gerar o arquivo de exportação.");
    }
});

/**
 * GET: BUSCAR LISTAS (Contas, GruposDespesa, GruposReceita)
 */
router.get('/', (req, res) => {
    const { type } = req.query;

    garantirEsquemaAtualizado();

    try {
        let rows = [];
        if (type === 'Conta' || type === 'FormaPagamento') {
            rows = queryAll("SELECT * FROM Accounts ORDER BY name");
        } else if (type === 'GrupoDespesa') {
            rows = queryAll("SELECT * FROM Categories WHERE type = 'expense' ORDER BY name");
        } else if (type === 'GrupoReceita') {
            rows = queryAll("SELECT * FROM Categories WHERE type = 'revenue' ORDER BY name");
        }
        
        const normalizedRows = rows.map(row => ({
            ...row,
            subgroups: row.subgroups || '',
            color: row.color || (row.type === 'revenue' ? '#6366f1' : '#ef4444'),
            is_fixed: row.is_fixed || 0
        }));

        res.json(normalizedRows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao carregar dados. O banco pode estar em um formato incompatível." });
    }
});

/**
 * POST: CRIAR NOVA CATEGORIA / CONTA
 */
router.post('/:type', (req, res) => {
    const { type } = req.params; 
    const data = req.body;

    try {
        if (type === 'conta') {
            const sql = "INSERT INTO Accounts (name, initial_balance, is_credit_card) VALUES (?, ?, ?)";
            const result = runStatement(sql, [
                data.name, 
                data.initial_balance || 0, 
                data.is_credit_card ? 1 : 0
            ]);
            return res.status(201).json({ id: result.lastInsertRowid });
        } 
        
        if (type === 'categoria') {
            const sql = "INSERT INTO Categories (name, type, is_fixed, subgroups, color) VALUES (?, ?, ?, ?, ?)";
            const result = runStatement(sql, [
                data.name, 
                data.type, 
                data.is_fixed ? 1 : 0, 
                data.subgroups || '', 
                data.color || '#ef4444'
            ]);
            return res.status(201).json({ id: result.lastInsertRowid });
        }

        res.status(400).json({ error: "Tipo de cadastro inválido." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT: ATUALIZAR CATEGORIA / CONTA
 */
router.put('/:type', (req, res) => {
    const { type } = req.params;
    const data = req.body;

    try {
        if (type === 'conta') {
            const sql = "UPDATE Accounts SET name = ?, initial_balance = ?, is_credit_card = ? WHERE id = ?";
            runStatement(sql, [data.name, data.initial_balance, data.is_credit_card ? 1 : 0, data.id]);
            return res.json({ message: "Conta atualizada!" });
        }

        if (type === 'categoria') {
            const sql = "UPDATE Categories SET name = ?, type = ?, is_fixed = ?, subgroups = ?, color = ? WHERE id = ?";
            runStatement(sql, [
                data.name, 
                data.type, 
                data.is_fixed ? 1 : 0, 
                data.subgroups || '', 
                data.color, 
                data.id
            ]);
            return res.json({ message: "Categoria atualizada!" });
        }

        res.status(400).json({ error: "Tipo de atualização inválido." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE: EXCLUIR ITEM
 */
router.delete('/:type/:id', (req, res) => {
    const { type, id } = req.params;

    try {
        const checkTable = type === 'conta' ? 'account_id' : 'category_id';
        const count = db.prepare(`SELECT COUNT(*) as total FROM Transactions WHERE ${checkTable} = ?`).get(id).total;
        
        if (count > 0) {
            return res.status(400).json({ 
                error: `Existem ${count} lançamentos vinculados a este item. Exclua os lançamentos primeiro.` 
            });
        }

        const sql = type === 'conta' ? "DELETE FROM Accounts WHERE id = ?" : "DELETE FROM Categories WHERE id = ?";
        runStatement(sql, [id]);
        res.json({ message: "Item removido com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;