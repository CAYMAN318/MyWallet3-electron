const { app, BrowserWindow } = require('electron');
const path = require('path');

// Importa o módulo do servidor (server/app.js).
// Nota: Estamos assumindo que o app.js foi modificado para exportar a função startServer.
const serverModule = require('./server/app.js'); 
let expressServerInstance = null; // Variável para armazenar a instância do servidor HTTP

function createWindow() {
    // Cria a janela principal do Electron
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 768,
        minWidth: 1000,
        minHeight: 700,
        title: "MyWallet3 - Gerenciador Financeiro Pessoal",
        webPreferences: {
            // Configurações de segurança:
            nodeIntegration: false, // O frontend (renderer) NÃO terá acesso direto ao Node.js
            contextIsolation: true, // Garante que o código do frontend não manipule APIs do Electron
            // Seu frontend usa fetch() e localhost, que funciona perfeitamente com essas configurações.
        }
    });

    // Carrega o arquivo principal do frontend (index.html, que contém o menu e o iframe)
    // Assegure-se de que sua pasta de HTMLs se chame 'src' na nova estrutura.
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // Opcional: Abre DevTools automaticamente no ambiente de desenvolvimento
    // mainWindow.webContents.openDevTools(); 
}

// Quando o Electron estiver pronto, inicia o servidor e cria a janela
app.on('ready', () => {
    // 1. Inicia o servidor Express na porta 3000
    expressServerInstance = serverModule.startServer(3000); 

    // 2. Cria a janela do aplicativo
    createWindow();
});

// Encerra o aplicativo quando todas as janelas estiverem fechadas (exceto no macOS)
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