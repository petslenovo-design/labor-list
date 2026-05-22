const DataModel = require('../models/DataModel');
const exceljs = require('exceljs'); // Biblioteca para geração do Excel nativo
const pool = require('../config/db');

// Valida se um líder pode acessar/modificar determinado colaborador
const validarAcessoLider = async (colaborador_id, lider_id) => {
    if (!lider_id) return true; // se não é líder, não valida
    const result = await pool.query(
        'SELECT lider_id FROM colaboradores WHERE id = $1',
        [colaborador_id]
    );
    if (result.rows.length === 0) return false;
    return result.rows[0].lider_id === lider_id;
};

/**
 * Busca todas as informações vitais do sistema (Operadores, Linhas, Treinamentos)
 * Essa rota é a "carga inicial" de todos os painéis do Frontend.
 */
exports.carregarTudo = async (req, res) => {
    try {
        const data = await DataModel.carregarTudo();
        res.json({ sucesso: true, ...data });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
};

/**
 * Rota exclusiva para geração e Download do Relatório Executivo em Excel (.xlsx)
 * Puxa os dados atualizados e usa formatações complexas.
 */
exports.exportarExcel = async (req, res) => {
    try {
        const data = await DataModel.carregarTudo();
        const workbook = new exceljs.Workbook();

        // ==========================================
        // ABA 1: Visão Geral de Labor
        // ==========================================
        const wsGeral = workbook.addWorksheet('Visão Geral - Labor');

        wsGeral.columns = [
            { header: 'Operador', key: 'nome', width: 30 },
            { header: 'Líder Responsável', key: 'lider', width: 25 },
            { header: 'Turno', key: 'turno', width: 10 },
            { header: 'Linha(s)', key: 'linha', width: 25 }, // Largura aumentada para comportar polivalência
            { header: 'Status Atual', key: 'status', width: 25 },
            { header: 'Vínculo', key: 'vinculo', width: 15 }
        ];

        // Estilizar cabeçalho para parecer sistema Premium (Azul Escuro)
        wsGeral.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        wsGeral.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };

        // Popula as linhas
        data.operadores.forEach(op => {
            wsGeral.addRow({
                nome: op.nome,
                lider: op.nome_lider || 'Sem Líder',
                turno: op.turno || 'T1',
                // Junta a array de linhas vinculadas para exibir corretamente no Excel
                linha: (op.linhas_vinculadas || []).join(', '),
                status: op.status_especial || 'Disponível',
                vinculo: op.vinculo
            });
        });

        // ==========================================
        // ABA 2: Ocorrências e Faltas (Foco RH)
        // ==========================================
        const wsOcorrencias = workbook.addWorksheet('Ocorrências e Faltas');

        wsOcorrencias.columns = [
            { header: 'Operador', key: 'nome', width: 30 },
            { header: 'Tipo Ocorrência', key: 'tipo', width: 20 },
            { header: 'Motivo / Horário', key: 'motivo', width: 40 }
        ];

        // Estilizar cabeçalho (Vermelho Alerta)
        wsOcorrencias.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        wsOcorrencias.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE74C3C' } };

        // Popula apenas quem faltou ou saiu cedo
        data.operadores.forEach(op => {
            if (op.status_especial === 'Absenteísmo' || op.status_especial === 'Saída Antecipada') {
                const detalhe = op.early_exit_time ? `Saiu às: ${op.early_exit_time}` : 'Falta Atual Registrada';
                wsOcorrencias.addRow({ nome: op.nome, tipo: op.status_especial, motivo: detalhe });
            }
        });

        // Prepara os cabeçalhos de resposta HTTP para forçar o Download no navegador do cliente
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Relatorio_LaborList.xlsx');

        await workbook.xlsx.write(res);
        res.end();

        // Registra anonimamente/silenciosamente no log que o usuário baixou uma base sensível
        DataModel.registrarLog(req.user.login, 'download_excel', { data: new Date().toISOString() });

    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
};

exports.carregarLogs = async (req, res) => {
    try {
        // Bloqueio de segurança a nível de API
        if (req.user.perfil !== 'MASTER') {
            return res.status(403).json({ erro: "Acesso negado. Apenas o perfil MASTER pode visualizar os logs do sistema." });
        }
        const logs = await DataModel.carregarLogs();
        res.json(logs);
    } catch (e) {
        console.error("Erro ao carregar logs:", e);
        res.status(500).json({ erro: "Erro ao carregar logs de auditoria." });
    }
};

/**
 * CENTRAL DE ROTEAMENTO GENÉRICO (Generic Handler)
 * Ao invés de criarmos 50 rotas no server.js, todas as ações de inserção, alteração
 * e deleção passam por aqui. O action diz qual função chamar.
 */
exports.genericHandler = async (req, res) => {
    const action = req.params.action; // O que o frontend quer fazer?
    const dados = req.body; // Qual a "carga" (payload) dessa ação?

    const perfilUsuario = req.user.perfil;
    const loginUsuario = req.user.login; // Pega o login LDAP seguro via Token JWT

    try {
        switch (action) {

            // --- AÇÕES DE ENGENHARIA E MASTER ---
            case 'salvar_produto':
            case 'excluir_produto':
                if (perfilUsuario !== 'MASTER') return res.status(403).json({ erro: 'Ação permitida apenas para Engenharia.' });
                if (action === 'salvar_produto') await DataModel.salvarProduto(dados);
                else await DataModel.excluirProduto(dados);
                break;

            // --- AÇÕES DE GESTÃO DE ACESSOS ---
            case 'salvar_usuario_acesso':
            case 'excluir_usuario_acesso':
                if (perfilUsuario === 'LIDER') return res.status(403).json({ erro: 'Líderes não podem gerenciar acessos.' });
                if (action === 'salvar_usuario_acesso') await DataModel.salvarUsuarioAcesso(dados);
                else await DataModel.excluirUsuarioAcesso(dados);
                break;

            // --- AÇÕES DE GESTÃO DE LABOR BÁSICAS ---
            //case 'salvar_colaborador': await DataModel.salvarColaborador(dados); break;
            case 'salvar_colaborador':
                if (perfilUsuario === 'LIDER') {
                    // Força o lider_id para o ID do líder logado
                    dados.lider_id = req.user.colaborador_id;
                    if (!dados.lider_id) {
                        return res.status(403).json({ erro: 'Líder sem vínculo com colaborador.' });
                    }
                }
                await DataModel.salvarColaborador(dados);
                break;
            //case 'excluir_colaborador': await DataModel.excluirColaborador(dados); break;
            case 'excluir_colaborador':
                if (perfilUsuario === 'LIDER') {
                    const acesso = await validarAcessoLider(dados.id, req.user.colaborador_id);
                    if (!acesso) {
                        return res.status(403).json({ erro: 'Você não pode excluir este colaborador.' });
                    }
                }
                await DataModel.excluirColaborador(dados);
                break;
            //case 'alterar_status': await DataModel.alterarStatus(dados); break;
            case 'alterar_status':
                if (perfilUsuario === 'LIDER') {
                    const acesso = await validarAcessoLider(dados.id, req.user.colaborador_id);
                    if (!acesso) {
                        return res.status(403).json({ erro: 'Você não pode alterar o status deste operador.' });
                    }
                }
                await DataModel.alterarStatus(dados);
                break;

            // --- AÇÕES DE LOGÍSTICA E HORA EXTRA ---
            case 'confirmar_he': await DataModel.confirmarHE(dados); break;
            //case 'remover_he': await DataModel.removerHE(dados); break;
            case 'remover_he':
                if (perfilUsuario === 'LIDER') {
                    const acesso = await validarAcessoLider(dados.id, req.user.colaborador_id);
                    if (!acesso) {
                        return res.status(403).json({ erro: 'Operador não pertence à sua equipe.' });
                    }
                }
                await DataModel[dados.action === 'confirmar_he' ? 'confirmarHE' : 'removerHE'](dados);
                break;

            // --- NOVAS AÇÕES (POLIVALENTE E ZERAR SKILL MATRIX) ---
            //case 'atualizar_linhas_cobertura': await DataModel.atualizarLinhasCobertura(dados); break;
            // Para atualizar linhas de cobertura (polivalência)
            case 'atualizar_linhas_cobertura':
                if (perfilUsuario === 'LIDER') {
                    const acesso = await validarAcessoLider(dados.colaborador_id, req.user.colaborador_id);
                    if (!acesso) {
                        return res.status(403).json({ erro: 'Acesso negado.' });
                    }
                }
                await DataModel.atualizarLinhasCobertura(dados);
                break;
            //case 'zerar_treinamentos': await DataModel.zerarTreinamentos(dados); break;
            case 'zerar_treinamentos':
                if (perfilUsuario === 'LIDER') {
                    const acesso = await validarAcessoLider(dados.colaborador_id, req.user.colaborador_id);
                    if (!acesso) {
                        return res.status(403).json({ erro: 'Acesso negado.' });
                    }
                }
                await DataModel.zerarTreinamentos(dados);
                break;

            // --- AÇÕES DE MATRIZ DE TREINAMENTO (SKILL MATRIX) E YIELD ---
            case 'excluir_alocacao': await DataModel.excluirAlocacao(dados); break;
            case 'transferir_operador': await DataModel.transferirOperador(dados); break;
            case 'salvar_yield_colaborador': await DataModel.salvarYieldColaborador(dados); break;
            case 'sync_planejamento': await DataModel.syncPlanejamento(dados); break;

            // --- RESET AUTOMÁTICO (Saídas Antecipadas) ---
            case 'reset_automatico':
                if (dados.tipo === 'saida_antecipada') {
                    await DataModel.resetSaidasAntecipadas();
                } else {
                    return res.status(400).json({ sucesso: false, erro: 'Tipo de reset desconhecido.' });
                }
                break;


            // --- ALOCAÇÃO RÁPIDA (Treina vários postos de uma vez) ---
            case 'salvar_alocacao_multipla':
                const addCount = await DataModel.salvarAlocacaoMultipla(dados);
                if (addCount === 0) return res.status(400).json({ sucesso: false, erro: 'Treinamentos já cadastrados ou vazios.' });
                break;

            // --- PROTEÇÃO ---
            default: return res.status(400).json({ sucesso: false, erro: 'Ação não mapeada pelo roteador.' });
        }

        // ==========================================
        // TRILHA DE AUDITORIA (LOG)
        // Se a ação passou e deu sucesso, o sistema regista invisivelmente
        // ==========================================
        await DataModel.registrarLog(loginUsuario, action, dados);

        // Dispara o sinal via WebSocket para todos os computadores atualizarem a tela ao mesmo tempo
        if (req.app.get('io')) {
            req.app.get('io').emit('dados_atualizados');
        }

        res.json({ sucesso: true });

    } catch (e) {
        // Trata qualquer erro (banco caído, coluna inexistente, etc)
        res.status(500).json({ sucesso: false, erro: e.message });
    }
};