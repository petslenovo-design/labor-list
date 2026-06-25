const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const apiController = require('../controllers/apiController');
const authMiddleware = require('../middlewares/authMiddleware');

// Rota Pública
router.post('/login', authController.login);

// ============================================================================
// ROTAS DE INTEGRAÇÃO DE SISTEMAS (M2M - Validadas por API Key)
// Colocamos ANTES do authMiddleware para não pedir Token JWT de Login
// ============================================================================
router.get('/integracao/absenteismo', apiController.consultarAbsenteismoExterno);

// MURALHA DE SEGURANÇA: Tudo abaixo exige Token JWT
router.use(authMiddleware);

// ============================================================================
// ROTAS DE LEITURA (GET)
// ============================================================================
router.get('/carregar_tudo', apiController.carregarTudo);
router.get('/exportar_excel', apiController.exportarExcel);
router.get('/carregar_logs', apiController.carregarLogs);
router.get('/rh/absenteismo', apiController.carregarDadosAbsenteismoRH);

// ============================================================================
// ROTAS DE AÇÃO (POST) - Substituem o antigo /:action dinâmico
// ============================================================================

// Engenharia / Produtos
router.post('/salvar_produto', apiController.salvarProduto);
router.post('/excluir_produto', apiController.excluirProduto);

// Gestão de Acessos
router.post('/salvar_usuario_acesso', apiController.salvarUsuarioAcesso);
router.post('/excluir_usuario_acesso', apiController.excluirUsuarioAcesso);

// Gestão de Labor / Colaboradores
router.post('/salvar_colaborador', apiController.salvarColaborador);
router.post('/excluir_colaborador', apiController.excluirColaborador);
router.post('/alterar_status', apiController.alterarStatus);
router.post('/atualizar_linhas_cobertura', apiController.atualizarLinhasCobertura);
router.post('/rh/lancamento_retroativo', authMiddleware, apiController.lancamentoRetroativo);
router.post('/rh/remover_absenteismo', authMiddleware, apiController.removerAbsenteismo);

// Logística / Horas Extras
router.post('/confirmar_he', apiController.confirmarHE);
router.post('/remover_he', apiController.removerHE);
router.post('/sync_planejamento', apiController.syncPlanejamento);

// Matriz de Treinamentos (Skill Matrix)
router.post('/zerar_treinamentos', apiController.zerarTreinamentos);
router.post('/salvar_alocacao_multipla', apiController.salvarAlocacaoMultipla);
router.post('/excluir_alocacao', apiController.excluirAlocacao);
router.post('/transferir_operador', apiController.transferirOperador);
router.post('/salvar_yield_colaborador', apiController.salvarYieldColaborador);

// Sistema
router.post('/reset_automatico', apiController.resetAutomatico);

module.exports = router;