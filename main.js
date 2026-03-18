const { app, BrowserWindow } = require('electron');
const path = require('path');
const serverModule = require('./server/app.js'); 

let expressServerInstance = null;

function createWindow() {
    // Cria a janela principal do Electron
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
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

    // Remove o menu padrão (Arquivo, Editar, etc) para um visual de App nativo
    mainWindow.setMenuBarVisibility(false);

    // COMANDO COMENTADO PARA PRODUÇÃO:
    //mainWindow.webContents.openDevTools();

    // Carrega o frontend principal
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

// Encerra a instância do servidor Express ao fechar o aplicativo para liberar a porta 3000
app.on('quit', () => {
    if (expressServerInstance && expressServerInstance.close) {
        expressServerInstance.close();
    }
});