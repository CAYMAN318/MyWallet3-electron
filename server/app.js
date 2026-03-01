const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database'); 
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const staticPath = path.join(__dirname, '../src');
app.use(express.static(staticPath));

// --- Rotas ---
const receitasRoutes = require('./routes/receitas');
const despesasRoutes = require('./routes/despesas');
const configuracoesRoutes = require('./routes/configuracoes'); 
const relatoriosRoutes = require('./routes/relatorios');
const dashboardRoutes = require('./routes/dashboard');
const systemRoutes = require('./routes/system'); 
const checklistRoutes = require('./routes/checklist'); // Certifique-se de que este arquivo existe

app.use('/api/receitas', receitasRoutes);
app.use('/api/despesas', despesasRoutes);
app.use('/api/configuracoes', configuracoesRoutes); 
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/system', systemRoutes); 
app.use('/api/checklist', checklistRoutes); // Registro crucial

app.get('/', (req, res) => { res.sendFile('index.html', { root: staticPath }); });

let serverInstance = null;
const startServer = (port = 3000) => {
    if (serverInstance) return serverInstance;
    serverInstance = app.listen(port, () => {
        console.log(`Servidor MyWallet3 rodando na porta ${port}`);
    });
    return serverInstance;
};

module.exports = { startServer };