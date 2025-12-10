const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuração das bibliotecas para baixar
const libs = [
    {
        name: 'vue.global.js',
        url: 'https://unpkg.com/vue@3/dist/vue.global.js',
        folder: 'libs'
    },
    {
        name: 'chart.js',
        url: 'https://cdn.jsdelivr.net/npm/chart.js',
        folder: 'libs'
    },
    {
        name: 'lucide.js',
        url: 'https://unpkg.com/lucide@latest',
        folder: 'libs'
    },
    {
        name: 'tailwindcss.js',
        url: 'https://cdn.tailwindcss.com',
        folder: 'libs'
    }
];

// Garante que a pasta de destino existe
const srcPath = path.join(__dirname, 'src');
const libsPath = path.join(srcPath, 'libs');

if (!fs.existsSync(srcPath)) {
    console.error("Erro: Pasta 'src' não encontrada. Execute este script na raiz do projeto.");
    process.exit(1);
}

if (!fs.existsSync(libsPath)) {
    fs.mkdirSync(libsPath, { recursive: true });
    console.log(`Pasta criada: ${libsPath}`);
}

// Função de download que segue redirecionamentos de forma inteligente
const downloadFile = (originalUrl, dest) => {
    return new Promise((resolve, reject) => {
        const request = https.get(originalUrl, (response) => {
            // Tratamento de Redirecionamento (301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(response.statusCode)) {
                let redirectUrl = response.headers.location;
                
                // CORREÇÃO CRÍTICA: Resolver URL relativa baseada na URL original
                // Se o servidor devolver "/path/lib.js", isso transforma em "https://site.com/path/lib.js"
                try {
                    redirectUrl = new URL(redirectUrl, originalUrl).toString();
                } catch (e) {
                    reject(new Error(`Falha ao resolver URL de redirecionamento: ${redirectUrl}`));
                    return;
                }

                downloadFile(redirectUrl, dest) // Chama recursivamente
                    .then(resolve)
                    .catch(reject);
                return;
            }

            // Sucesso (200)
            if (response.statusCode === 200) {
                const file = fs.createWriteStream(dest);
                response.pipe(file);
                file.on('finish', () => {
                    file.close(() => resolve());
                });
                return;
            }

            // Erro
            reject(new Error(`Falha ao baixar ${originalUrl}: Status ${response.statusCode}`));
        });

        request.on('error', (err) => {
            fs.unlink(dest, () => {}); // Apaga arquivo corrompido
            reject(err);
        });
    });
};

// Execução
(async () => {
    console.log("Iniciando download das bibliotecas (com suporte a URL relativa)...");
    console.log("-------------------------------------------------------------------");
    
    for (const lib of libs) {
        const dest = path.join(libsPath, lib.name);
        try {
            process.stdout.write(`Baixando ${lib.name}... `);
            await downloadFile(lib.url, dest);
            console.log(`✅ OK`);
        } catch (error) {
            console.log(`❌ ERRO`);
            console.error(`Detalhe: ${error.message}`);
        }
    }
    
    console.log("\n-------------------------------------------------------------------");
    console.log("Download concluído! Verifique a pasta 'src/libs'.");
})();