const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database'); 
const path = require('path');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// --- CORREÇÃO IMPORTANTE PARA BUILD ---
// Usamos path.join(__dirname, '../src') em vez de process.cwd()
// Isso garante que, se o app.js estiver em 'server/', ele suba um nível e entre em 'src'
// Funcionando tanto em Dev quanto dentro do app.asar
const staticPath = path.join(__dirname, '../src');
app.use(express.static(staticPath));

// --- Rotas ---
// Nota: Certifique-se de que seus arquivos de rota também estão dentro da pasta 'server/routes' 
// ou ajuste os requires abaixo conforme sua estrutura real.
const receitasRoutes = require('./routes/receitas');
const despesasRoutes = require('./routes/despesas');
const configuracoesRoutes = require('./routes/configuracoes'); 
const relatoriosRoutes = require('./routes/relatorios');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/receitas', receitasRoutes);
app.use('/api/despesas', despesasRoutes);
app.use('/api/configuracoes', configuracoesRoutes); 
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Fallback para SPA / Arquivos
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: staticPath });
});

let serverInstance = null;

const startServer = (port = 3000) => {
    if (serverInstance) return serverInstance;
    serverInstance = app.listen(port, () => {
        console.log(`Servidor Express rodando (Porta ${port})`);
        console.log(`Servindo arquivos estáticos de: ${staticPath}`);
    });
    return serverInstance;
};

module.exports = { startServer };