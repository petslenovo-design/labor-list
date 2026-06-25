const exceljs = require('exceljs');
const CoreModel = require('../models/CoreModel');
const AdminModel = require('../models/AdminModel');
const LaborModel = require('../models/LaborModel');
const ProductionModel = require('../models/ProductionModel');

// ============================================================================
// FUNÇÃO UTILITÁRIA PARA RESPOSTAS DE SUCESSO E AUDITORIA
// ============================================================================
const handleSuccess = async (req, res, action, dados) => {
    // Registra silenciosamente no log
    await AdminModel.registrarLog(req.user.login, action, dados);

    // Dispara WebSocket para atualizar telas
    if (req.app.get('io')) {
        req.app.get('io').emit('dados_atualizados');
    }
    res.json({ sucesso: true });
};

// ============================================================================
// GETS (CARGAS DE DADOS)
// ============================================================================
exports.carregarTudo = async (req, res) => {
    try {
        const data = await CoreModel.carregarTudo();
        res.json({ sucesso: true, ...data });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
};

exports.carregarLogs = async (req, res) => {
    try {
        if (req.user.perfil !== 'MASTER') {
            return res.status(403).json({ erro: "Acesso negado. Apenas MASTER." });
        }
        const logs = await AdminModel.carregarLogs();
        res.json(logs);
    } catch (e) {
        res.status(500).json({ erro: "Erro ao carregar logs de auditoria." });
    }
};

exports.exportarExcel = async (req, res) => {
    try {
        const data = await CoreModel.carregarTudo();
        const workbook = new exceljs.Workbook();

        // ABA 1: Visão Geral de Labor
        const wsGeral = workbook.addWorksheet('Visão Geral - Labor');
        wsGeral.columns = [
            { header: 'Operador', key: 'nome', width: 30 },
            { header: 'Líder Responsável', key: 'lider', width: 25 },
            { header: 'Turno', key: 'turno', width: 10 },
            { header: 'Linha(s)', key: 'linha', width: 25 },
            { header: 'Status Atual', key: 'status', width: 25 },
            { header: 'Vínculo', key: 'vinculo', width: 15 }
        ];

        wsGeral.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        wsGeral.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };

        data.operadores.forEach(op => {
            wsGeral.addRow({
                nome: op.nome,
                lider: op.nome_lider || 'Sem Líder',
                turno: op.turno || 'T1',
                linha: (op.linhas_vinculadas || []).join(', '),
                status: op.status_especial || 'Disponível',
                vinculo: op.vinculo
            });
        });

        // ABA 2: Ocorrências e Faltas
        const wsOcorrencias = workbook.addWorksheet('Ocorrências e Faltas');
        wsOcorrencias.columns = [
            { header: 'Operador', key: 'nome', width: 30 },
            { header: 'Tipo Ocorrência', key: 'tipo', width: 20 },
            { header: 'Motivo / Horário', key: 'motivo', width: 40 }
        ];

        wsOcorrencias.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        wsOcorrencias.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE74C3C' } };

        data.operadores.forEach(op => {
            if (op.status_especial === 'Absenteísmo' || op.status_especial === 'Saída Antecipada') {
                const detalhe = op.early_exit_time ? `Saiu às: ${op.early_exit_time}` : 'Falta Atual Registrada';
                wsOcorrencias.addRow({ nome: op.nome, tipo: op.status_especial, motivo: detalhe });
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Relatorio_LaborList.xlsx');

        await workbook.xlsx.write(res);
        res.end();

        await AdminModel.registrarLog(req.user.login, 'download_excel', { data: new Date().toISOString() });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
};

// ============================================================================
// ENGENHARIA / PRODUTOS
// ============================================================================
exports.salvarProduto = async (req, res) => {
    try {
        if (req.user.perfil !== 'MASTER') return res.status(403).json({ erro: 'Apenas Engenharia.' });
        await ProductionModel.salvarProduto(req.body);
        await handleSuccess(req, res, 'salvar_produto', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.excluirProduto = async (req, res) => {
    try {
        if (req.user.perfil !== 'MASTER') return res.status(403).json({ erro: 'Apenas Engenharia.' });
        await ProductionModel.excluirProduto(req.body);
        await handleSuccess(req, res, 'excluir_produto', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

// ============================================================================
// GESTÃO DE ACESSOS
// ============================================================================
exports.salvarUsuarioAcesso = async (req, res) => {
    try {
        if (req.user.perfil === 'LIDER') return res.status(403).json({ erro: 'Líderes não gerenciam acessos.' });
        await AdminModel.salvarUsuarioAcesso(req.body);
        await handleSuccess(req, res, 'salvar_usuario_acesso', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.excluirUsuarioAcesso = async (req, res) => {
    try {
        if (req.user.perfil === 'LIDER') return res.status(403).json({ erro: 'Líderes não gerenciam acessos.' });
        await AdminModel.excluirUsuarioAcesso(req.body);
        await handleSuccess(req, res, 'excluir_usuario_acesso', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

// ============================================================================
// LABOR BÁSICO
// ============================================================================
exports.salvarColaborador = async (req, res) => {
    try {
        const dados = req.body;
        if (req.user.perfil === 'LIDER') {
            dados.lider_id = req.user.colaborador_id;
            if (!dados.lider_id) return res.status(403).json({ erro: 'Líder sem vínculo.' });
        }
        await LaborModel.salvarColaborador(dados);
        await handleSuccess(req, res, 'salvar_colaborador', dados);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.excluirColaborador = async (req, res) => {
    try {
        if (req.user.perfil === 'LIDER') {
            const acesso = await LaborModel.validarAcessoLider(req.body.id, req.user.colaborador_id);
            if (!acesso) return res.status(403).json({ erro: 'Acesso negado.' });
        }
        await LaborModel.excluirColaborador(req.body);
        await handleSuccess(req, res, 'excluir_colaborador', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.alterarStatus = async (req, res) => {
    try {
        if (req.user.perfil === 'LIDER') {
            const acesso = await LaborModel.validarAcessoLider(req.body.id, req.user.colaborador_id);
            if (!acesso) return res.status(403).json({ erro: 'Acesso negado.' });
        }
        await LaborModel.alterarStatus(req.body);
        await handleSuccess(req, res, 'alterar_status', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.atualizarLinhasCobertura = async (req, res) => {
    try {
        if (req.user.perfil === 'LIDER') {
            const acesso = await LaborModel.validarAcessoLider(req.body.colaborador_id, req.user.colaborador_id);
            if (!acesso) return res.status(403).json({ erro: 'Acesso negado.' });
        }
        await LaborModel.atualizarLinhasCobertura(req.body);
        await handleSuccess(req, res, 'atualizar_linhas_cobertura', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

// ============================================================================
// HORAS EXTRAS
// ============================================================================
exports.confirmarHE = async (req, res) => {
    try {
        await LaborModel.confirmarHE(req.body);
        await handleSuccess(req, res, 'confirmar_he', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.removerHE = async (req, res) => {
    try {
        if (req.user.perfil === 'LIDER') {
            const acesso = await LaborModel.validarAcessoLider(req.body.id, req.user.colaborador_id);
            if (!acesso) return res.status(403).json({ erro: 'Acesso negado.' });
        }
        await LaborModel.removerHE(req.body);
        await handleSuccess(req, res, 'remover_he', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

// ============================================================================
// SKILL MATRIX E PLANEJAMENTO
// ============================================================================
exports.zerarTreinamentos = async (req, res) => {
    try {
        if (req.user.perfil === 'LIDER') {
            const acesso = await LaborModel.validarAcessoLider(req.body.colaborador_id, req.user.colaborador_id);
            if (!acesso) return res.status(403).json({ erro: 'Acesso negado.' });
        }
        await ProductionModel.zerarTreinamentos(req.body);
        await handleSuccess(req, res, 'zerar_treinamentos', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.salvarAlocacaoMultipla = async (req, res) => {
    try {
        const addCount = await ProductionModel.salvarAlocacaoMultipla(req.body);
        if (addCount === 0) return res.status(400).json({ sucesso: false, erro: 'Treinamentos já cadastrados.' });
        await handleSuccess(req, res, 'salvar_alocacao_multipla', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.excluirAlocacao = async (req, res) => {
    try {
        await ProductionModel.excluirAlocacao(req.body);
        await handleSuccess(req, res, 'excluir_alocacao', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.transferirOperador = async (req, res) => {
    try {
        await ProductionModel.transferirOperador(req.body);
        await handleSuccess(req, res, 'transferir_operador', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.salvarYieldColaborador = async (req, res) => {
    try {
        await ProductionModel.salvarYieldColaborador(req.body);
        await handleSuccess(req, res, 'salvar_yield_colaborador', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.syncPlanejamento = async (req, res) => {
    try {
        await ProductionModel.syncPlanejamento(req.body);
        await handleSuccess(req, res, 'sync_planejamento', req.body);
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.resetAutomatico = async (req, res) => {
    try {
        if (req.body.tipo === 'saida_antecipada') {
            await LaborModel.resetSaidasAntecipadas();
            await handleSuccess(req, res, 'reset_automatico', req.body);
        } else {
            res.status(400).json({ sucesso: false, erro: 'Tipo de reset desconhecido.' });
        }
    } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
};

exports.lancamentoRetroativo = async (req, res) => {
    try {
        await LaborModel.lancamentoRetroativoAbsenteismo(req.body);
        res.json({ sucesso: true, mensagem: "Lançamento retroativo salvo com sucesso no histórico!" });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
};

exports.removerAbsenteismo = async (req, res) => {
    try {
        await LaborModel.removerAbsenteismo(req.body);
        res.json({ sucesso: true, mensagem: "Falta removida com sucesso do histórico." });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
};

// ============================================================================
// INTEGRAÇÃO M2M E PAINEL RH (NOVAS FUNÇÕES)
// ============================================================================

exports.consultarAbsenteismoExterno = async (req, res) => {
    try {
        const chaveRecebida = req.headers['x-api-key'];
        const chaveValida = process.env.API_KEY_INTEGRACAO;

        if (!chaveValida) {
            return res.status(500).json({ erro: "API_KEY_INTEGRACAO não configurada no servidor." });
        }
        
        if (chaveRecebida !== chaveValida) {
            return res.status(401).json({ erro: "Acesso Negado. API Key inválida ou ausente." });
        }

        const dataInicio = req.query.data_inicio || req.query.data;
        const dataFim = req.query.data_fim;

        const resultado = await LaborModel.getAbsenteismoIntegracao(dataInicio, dataFim);
        res.status(200).json({ sucesso: true, ...resultado });
        
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
};

exports.carregarDadosAbsenteismoRH = async (req, res) => {
    try {
        const dataInicio = req.query.data_inicio;
        const dataFim = req.query.data_fim;
        const diasUteis = req.query.dias_uteis; // Captura os dias úteis
        
        const analiseRH = await LaborModel.getPainelAbsenteismoRH(dataInicio, dataFim, diasUteis);
        res.json({ sucesso: true, ...analiseRH });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
};
