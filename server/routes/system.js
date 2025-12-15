const express = require('express');
const router = express.Router();
const fs = require('fs');
const multer = require('multer');
const db = require('../database'); // Importamos a instância do banco
const { app } = require('electron'); // Importamos app para reiniciar

// Configuração do Upload
const upload = multer({ dest: 'temp_uploads/' });

// --- FIX CRÍTICO: PEGAR O CAMINHO REAL DO BANCO ---
// Em vez de adivinhar com path.join, pegamos o caminho exato que o better-sqlite3 está usando
const getDbPath = () => db.name; 

// GET: Baixar Backup
router.get('/backup', (req, res) => {
    const dbPath = getDbPath();
    console.log(">>> [BACKUP] Baixando banco de:", dbPath);

    if (fs.existsSync(dbPath)) {
        const date = new Date().toISOString().split('T')[0];
        res.download(dbPath, `mywallet_backup_${date}.db`);
    } else {
        res.status(404).json({ error: "Banco de dados não encontrado." });
    }
});

// POST: Restaurar Backup
router.post('/restore', upload.single('backupFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }

    const tempPath = req.file.path;
    const dbPath = getDbPath(); // Caminho real (AppData/...)

    try {
        console.log(">>> [RESTORE] Iniciando restauração em:", dbPath);

        // 1. Fecha a conexão atual
        if (db && db.open) {
            db.close();
            console.log(">>> [RESTORE] Conexão fechada.");
        }

        // 2. Aguarda delay para o SO liberar o arquivo
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Backup de segurança antes de substituir
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, dbPath + '.bak');
        }
        
        // 4. Substitui o arquivo
        fs.copyFileSync(tempPath, dbPath);
        
        // 5. Limpa temporário
        fs.unlinkSync(tempPath);

        console.log(">>> [RESTORE] Sucesso! Reiniciando app...");

        // Resposta para o frontend
        res.json({ message: "Backup restaurado! O aplicativo será reiniciado.", success: true });

        // --- REINÍCIO AUTOMÁTICO (Electron) ---
        if (app) {
            setTimeout(() => {
                app.relaunch(); // Prepara o reinício
                app.exit(0);    // Fecha a versão atual
            }, 1500); // 1.5s para o frontend mostrar a mensagem
        }

    } catch (err) {
        console.error(">>> [ERRO RESTORE]", err);
        // Tenta voltar o backup .bak se der erro
        if (fs.existsSync(dbPath + '.bak')) {
            try { fs.copyFileSync(dbPath + '.bak', dbPath); } catch(e){}
        }
        res.status(500).json({ error: "Falha ao restaurar backup." });
    }
});

module.exports = router;