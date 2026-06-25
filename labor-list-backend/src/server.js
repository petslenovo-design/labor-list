const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const LaborModel = require('./models/LaborModel'); // Substituimos o DataModel pelo especialista

const app = express();
const server = http.createServer(app);

// Configuração do WebSockets (Tempo Real)
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Disponibiliza o io globalmente para uso em outros módulos (ex: cron, controllers)
global.io = io;
app.set('io', io);

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

// ============================================================================
// CRON JOB: Reset automático das Saídas Antecipadas
// ============================================================================

const executarResetAutomatico = async (horario) => {
    console.log(`[CRON] Executando reset automático das Saídas Antecipadas (${horario}) - ${new Date().toLocaleString('pt-BR')}`);
    try {
        await LaborModel.resetSaidasAntecipadas();
        if (global.io) {
            global.io.emit('dados_atualizados');
            console.log('[CRON] Clientes notificados via WebSocket.');
        }
    } catch (err) {
        console.error(`[CRON] Erro no reset das ${horario}:`, err.message);
    }
};

// Reset às 04:00 (turno da manhã)
cron.schedule('0 4 * * *', () => executarResetAutomatico('04:00'), { timezone: "America/Sao_Paulo" });

// Reset às 18:00 (turno da noite)
cron.schedule('0 18 * * *', () => executarResetAutomatico('18:00'), { timezone: "America/Sao_Paulo" });

// Evento de conexão WebSocket (apenas para log)
io.on('connection', (socket) => {
    console.log('🟢 Novo painel conectado (Tempo Real Ativo) - ID:', socket.id);
});

const PORT = process.env.PORT || 5008;
server.listen(PORT, () => {
    console.log(`🚀 Backend rodando na porta ${PORT} com WebSockets e Cron Jobs!`);
});