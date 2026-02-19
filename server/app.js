const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
// O db é importado aqui apenas para garantir que a conexão/criação ocorra
const db = require('./database'); 
const path = require('path');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Serve os arquivos estáticos (Frontend)
// Ajustado para assumir que app.js está dentro da pasta 'server' e 'src' está na raiz
const staticPath = path.join(__dirname, '../src');
app.use(express.static(staticPath));

// --- Rotas ---
// Nota: Certifique-se que seus arquivos de rota (receitas.js, etc) importam o db corretamente de '../database'
const receitasRoutes = require('./routes/receitas');
const despesasRoutes = require('./routes/despesas');
const configuracoesRoutes = require('./routes/configuracoes'); 
const relatoriosRoutes = require('./routes/relatorios');
const dashboardRoutes = require('./routes/dashboard');
const systemRoutes = require('./routes/system'); 
const checklistRoutes = require('./routes/checklist'); // NOVO: Rota para a Matriz de Compromissos

app.use('/api/receitas', receitasRoutes);
app.use('/api/despesas', despesasRoutes);
app.use('/api/configuracoes', configuracoesRoutes); 
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/system', systemRoutes); 
app.use('/api/checklist', checklistRoutes); // NOVO: Registro da rota de Checklist

// Fallback para SPA / Arquivos
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: staticPath });
});

let serverInstance = null;

const startServer = (port = 3000) => {
    if (serverInstance) return serverInstance;
    serverInstance = app.listen(port, () => {
        console.log(`Servidor Express rodando na porta ${port}`);
        console.log(`Servindo arquivos de: ${staticPath}`);
    });
    return serverInstance;
};

const stopServer = () => {
    if (serverInstance) {
        serverInstance.close();
        serverInstance = null;
    }
};

module.exports = { startServer, stopServer };