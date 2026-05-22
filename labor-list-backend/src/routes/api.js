const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const apiController = require('../controllers/apiController');
const authMiddleware = require('../middlewares/authMiddleware'); // Importando a segurança

// Rota Pública (Qualquer um pode tentar fazer login)
router.post('/login', authController.login);

// MURALHA DE SEGURANÇA: Tudo abaixo desta linha exige o Token JWT
router.use(authMiddleware);

// Rotas Protegidas (Só acessa quem está logado)
router.get('/carregar_tudo', apiController.carregarTudo);
router.get('/exportar_excel', apiController.exportarExcel);
router.post('/:action', apiController.genericHandler);
router.get('/carregar_logs', authMiddleware, apiController.carregarLogs);

module.exports = router;