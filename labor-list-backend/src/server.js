const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
require('dotenv').config();
const apiRoutes = require('./routes/api');
const DataModel = require('./models/DataModel');

const app = express();
const server = http.createServer(app);

// Configuração do WebSockets (Tempo Real)
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Disponibiliza o io globalmente para uso em outros módulos (ex: cron)
global.io = io;
app.set('io', io);

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

// ============================================================================
// CRON JOB: Reset automático das Saídas Antecipadas
// ============================================================================

// Reset às 04:00 (turno da manhã)
cron.schedule('0 4 * * *', async () => {
    console.log(`[CRON] Executando reset automático das Saídas Antecipadas (04:00) - ${new Date().toLocaleString('pt-BR')}`);
    try {
        await DataModel.resetSaidasAntecipadas();
        if (global.io) {
            global.io.emit('dados_atualizados');
            console.log('[CRON] Clientes notificados via WebSocket.');
        }
    } catch (err) {
        console.error('[CRON] Erro no reset das 04:00:', err.message);
    }
}, { timezone: "America/Sao_Paulo" });

// Reset às 18:00 (turno da noite)
cron.schedule('0 18 * * *', async () => {
    console.log(`[CRON] Executando reset automático das Saídas Antecipadas (18:00) - ${new Date().toLocaleString('pt-BR')}`);
    try {
        await DataModel.resetSaidasAntecipadas();
        if (global.io) {
            global.io.emit('dados_atualizados');
            console.log('[CRON] Clientes notificados via WebSocket.');
        }
    } catch (err) {
        console.error('[CRON] Erro no reset das 18:00:', err.message);
    }
}, { timezone: "America/Sao_Paulo" });

// Evento de conexão WebSocket (apenas para log)
io.on('connection', (socket) => {
    console.log('🟢 Novo painel conectado (Tempo Real Ativo) - ID:', socket.id);
});

const PORT = process.env.PORT || 5008;
server.listen(PORT, () => {
    console.log(`🚀 Backend rodando na porta ${PORT} com WebSockets e Cron Jobs!`);
});