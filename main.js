const { app, BrowserWindow } = require('electron');
const path = require('path');
const serverModule = require('./server/app.js'); 

let expressServerInstance = null;

function createWindow() {
    // Cria a janela principal do Electron
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 768,
        minWidth: 1000,
        minHeight: 700,
        title: "MyWallet3 - Gerenciador Financeiro Pessoal",
        // Ícone da Janela (importante para Linux/Windows taskbar)
        icon: path.join(__dirname, 'assets', 'icon.png'), 
        webPreferences: {
            nodeIntegration: false, 
            contextIsolation: true, 
        }
    });

    // Remove o menu padrão (Arquivo, Editar, etc) para ficar mais profissional
    mainWindow.setMenuBarVisibility(false);

    // Carrega o frontend
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// Quando o Electron estiver pronto, inicia o servidor e cria a janela
app.on('ready', () => {
    // 1. Inicia o servidor Express na porta 3000
    expressServerInstance = serverModule.startServer(3000); 

    // 2. Cria a janela do aplicativo
    createWindow();
});

// Encerra o aplicativo quando todas as janelas estiverem fechadas
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Encerra a instância do servidor Express ao fechar o aplicativo
app.on('quit', () => {
    if (expressServerInstance) {
        expressServerInstance.close(() => {
            console.log("Servidor Express encerrado corretamente.");
        });
    }
});