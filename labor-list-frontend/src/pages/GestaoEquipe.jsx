import React, { useEffect, useState, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';

// ============================================================================
// CONFIGURAÇÃO DO WEBSOCKET
// ============================================================================
const currentHost = window.location.hostname;
const socket = io(`http://${currentHost}:5008`);

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================
const calcularDiasFerias = (dataFinal) => {
    if (!dataFinal) return '';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fim = new Date(dataFinal);
    fim.setMinutes(fim.getMinutes() + fim.getTimezoneOffset());
    fim.setHours(0, 0, 0, 0);
    const diff = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Volta hoje';
    if (diff === 1) return 'Volta amanhã';
    if (diff < 0) return 'Em atraso';
    return `Faltam ${diff} dias`;
};

// Mapeamento de Setores
const mapeamentoSetores = {
    'KITTING': ["ABASTECIMENTO", "Sushi 01", "Sushi 02", "GIRO"],
    'ASSEMBLE': ["MA01", "MA02", "MA03", "MA04", "MA05", "MA06", "MA07", "MA08", "MA09", "MA10"],
    'TESTE': ["MMFT", "RUNIN"],
    'PACKING': ["PKG01", "PKG02", "PKG03", "PREKIT"]
};

const todasEstacoes = ["ABASTECIMENTO", "Sushi 01", "Sushi 02", "GIRO", "MA01", "MA02", "MA03", "MA04", "MA05", "MA06", "MA07", "MA08", "MA09", "MA10", "MMFT", "RUNIN", "PKG01", "PKG02", "PKG03", "PREKIT", "REPARO"];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function GestaoEquipe() {
    const { user } = useContext(AuthContext);

    // Estados principais
    const [db, setDb] = useState({
        operadores: [],
        lideres: [],
        linhas: [],
        alocacoes: [],
        produtos: [],
        postos: [],
        performance: {},
        opPerformance: {}
    });

    // Estados dos Filtros
    const [filtroLider, setFiltroLider] = useState('');
    const [filtroLinha, setFiltroLinha] = useState('');
    const [filtroSetor, setFiltroSetor] = useState('');
    const [filtroSkillProduto, setFiltroSkillProduto] = useState('');

    // Estados de Controle de Interface
    const [opExpandido, setOpExpandido] = useState(null);
    const [activeForm, setActiveForm] = useState('');
    const [formValues, setFormValues] = useState({});

    // Modal de Confirmação Customizado
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        message: '',
        action: null,
        confirmText: 'Confirmar',
        btnColor: '#e74c3c'
    });

    // ============================================================================
    // CARREGAR DADOS DA API
    // ============================================================================
    const carregarDados = async () => {
        try {
            const res = await api.get('/carregar_tudo');
            setDb(res.data);

            // Se for um Líder acessando, trava automaticamente o painel na equipe dele
            if (user.perfil === 'LIDER' && !filtroLider && user.colaborador_id) {
                setFiltroLider(String(user.colaborador_id));
            }
            // Para SUPERVISAO ou MASTER, não define filtro automático – o usuário escolhe o líder
        } catch (e) {
            toast.error("Erro ao carregar dados do servidor");
        }
    };



    useEffect(() => {
        carregarDados();

        socket.on('dados_atualizados', () => carregarDados());

        return () => {
            socket.off('dados_atualizados');
        };
    }, []);

    // ============================================================================
    // FUNÇÕES DO MODAL DE CONFIRMAÇÃO
    // ============================================================================
    const showConfirm = (message, actionCallback, btnColor = '#e74c3c', confirmText = 'Confirmar') => {
        setConfirmModal({ isOpen: true, message, action: actionCallback, btnColor, confirmText });
    };

    // ============================================================================
    // HANDLERS DAS AÇÕES
    // ============================================================================
    const handleStatusChange = async (opId, novoStatus, extraData = {}) => {
        try {
            const op = db.operadores.find(o => o.id === opId);
            const statusParaEnviar = novoStatus === '' ? null : novoStatus;

            await api.post('/alterar_status', {
                id: opId,
                status_novo: statusParaEnviar,
                is_explicit_update: true,
                ...extraData
            });

            // CORREÇÃO: Se estiver removendo um status especial e o operador tem linhas de cobertura,
            // define o status como Polivalente
            if (novoStatus === '' && op.linhas_vinculadas && op.linhas_vinculadas.length > 0) {
                await api.post('/alterar_status', {
                    id: opId,
                    status_novo: 'Polivalente',
                    is_explicit_update: true
                });
                toast.success('Status removido! Operador voltou a ser Polivalente.');
            } else {
                toast.success(novoStatus === '' ? 'Status removido com sucesso!' : 'Status atualizado com sucesso!');
            }

            setActiveForm('');
            carregarDados();
        } catch (e) {
            toast.error('Erro ao atualizar status.');
        }
    };

    const executarSalvarPolivalente = async (opId) => {
        try {
            if (!formValues.linhasPoli || formValues.linhasPoli.length === 0) {
                return toast.error("Selecione pelo menos uma linha para cobertura.");
            }
            // Primeiro salva as linhas de cobertura
            await api.post('/atualizar_linhas_cobertura', {
                colaborador_id: opId,
                linhas: formValues.linhasPoli
            });
            // Depois define o status como Polivalente
            await api.post('/alterar_status', {
                id: opId,
                status_novo: 'Polivalente',
                is_explicit_update: true
            });
            toast.success('Polivalência configurada com sucesso!');
            setActiveForm('');
            carregarDados();
        } catch (e) {
            toast.error("Erro ao salvar polivalente");
        }
    };

    const executarRemoverPolivalente = async (opId) => {
        try {
            // NÃO remove as linhas de cobertura, apenas remove o status Polivalente
            await api.post('/alterar_status', {
                id: opId,
                status_novo: null,
                is_explicit_update: true
            });
            toast.success('Status de Polivalente removido! As linhas de cobertura foram mantidas.');
            setActiveForm('');
            carregarDados();
        } catch (e) {
            toast.error("Erro ao remover polivalência");
        }
    };

    const handleConfirmarHE = async (opId) => {
        if (!formValues.dataHE) return toast.error("Selecione a data da Hora Extra!");
        try {
            await api.post('/confirmar_he', {
                id: opId,
                data_he: formValues.dataHE,
                desjejum: formValues.desjejum || 'NÃO',
                refeicao: formValues.refeicao || 'NÃO',
                transporte: formValues.transporte || 'NÃO'
            });
            toast.success('Hora Extra agendada!');
            setFormValues({});
            carregarDados();
        } catch (e) {
            toast.error("Erro ao confirmar HE.");
        }
    };

    const executarRemoverHE = async (opId, dataEspecifica) => {
        try {
            await api.post('/remover_he', { id: opId, data_he: dataEspecifica });
            toast.success('Hora Extra Cancelada!');
            carregarDados();
        } catch (e) {
            toast.error("Erro ao cancelar HE.");
        }
    };

    const handleQuickAlloc = async (opId) => {
        if (!formValues.quickProd || !formValues.quickPosto) {
            return toast.error("Selecione Produto e Posto!");
        }
        const op = db.operadores.find(o => o.id === opId);
        try {
            await api.post('/salvar_alocacao_multipla', {
                colaborador_id: opId,
                produto_id: formValues.quickProd,
                postos_ids: [formValues.quickPosto],
                turno: op?.turno || 'T1'
            });
            toast.success("Treinamento adicionado com sucesso!");
            setActiveForm('');
            carregarDados();
        } catch (e) {
            toast.error("Erro ao salvar alocação");
        }
    };

    const executarZerarTreinamentos = async (opId) => {
        try {
            await api.post('/zerar_treinamentos', { colaborador_id: opId });
            toast.success("Todos os treinamentos foram zerados!");
            carregarDados();
        } catch (e) {
            toast.error("Erro ao zerar treinamentos.");
        }
    };

    // ============================================================================
    // LÓGICA DE FILTRAGEM DA EQUIPE
    // ============================================================================
    const equipeFiltrada = db.operadores.filter(op => {
        // Filtro por Líder
        if (filtroLider && String(op.lider_id) !== String(filtroLider)) return false;

        // Filtro por Linha (considerando polivalência)
        const arrLinhas = Array.isArray(op.linhas_vinculadas) ? op.linhas_vinculadas : [];
        if (filtroLinha !== "" && op.linha !== filtroLinha && !arrLinhas.includes(filtroLinha)) return false;

        // Filtro por Setor
        if (filtroSetor !== "") {
            const aloc = db.alocacoes.filter(a => String(a.colaborador_id) === String(op.id)).slice(-1)[0];
            if (!aloc || !mapeamentoSetores[filtroSetor]?.includes(aloc.posto)) return false;
        }

        return true;
    });

    // Calcular contadores para os badges
    let cAtivos = 0, cFaltas = 0, cFerias = 0, cSaidas = 0, cAfastados = 0;
    equipeFiltrada.forEach(op => {
        if (op.status_especial === "Absenteísmo") cFaltas++;
        else if (op.status_especial === "Férias") cFerias++;
        else if (op.status_especial === "Saída Antecipada") cSaidas++;
        else if (op.status_especial === "Afastamento / Licença") cAfastados++;
        else cAtivos++;
    });

    // Obter cor do Yield
    const getYieldColor = (yieldVal) => {
        if (!yieldVal) return 'yield-dot';
        if (yieldVal < 95) return 'yield-dot-red';
        if (yieldVal < 98) return 'yield-dot-yellow';
        return 'yield-dot-green';
    };

    return (
        <div className="page">
            <h2 className="page-title">👥 Gestão de Equipe</h2>
            <div className="leader-panel-section">
                {/* CABEÇALHO COM FILTROS */}
                <div className="filter-row">
                    <div>
                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>1. Líder Responsável</label>
                        <select
                            value={filtroLider}
                            onChange={e => setFiltroLider(e.target.value)}
                            disabled={user.perfil === 'LIDER'}
                        >
                            {user.perfil !== 'LIDER' && <option value="">-- Escolha um Líder --</option>}
                            {db.lideres.map(l => (
                                <option key={l.id} value={l.id}>{l.nome}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>2. Filtrar por Linha</label>
                        <select value={filtroLinha} onChange={e => setFiltroLinha(e.target.value)}>
                            <option value="">Todas</option>
                            {db.linhas.map(l => (
                                <option key={l.id} value={l.nome}>{l.nome}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>3. Filtrar por Local</label>
                        <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="KITTING">KITTING</option>
                            <option value="ASSEMBLE">ASSEMBLE</option>
                            <option value="TESTE">TESTE</option>
                            <option value="PACKING">PACKING</option>
                        </select>
                    </div>
                </div>

                {/* PAINEL E TABELA DA EQUIPE */}
                {filtroLider && (
                    <div className="leader-card" style={{ display: 'block' }}>
                        <div className="leader-name-header">
                            <span>Equipe de Produção</span>
                            <div className="leader-badges-container">
                                <div className="badge-count bc-ativos">{cAtivos} Ativos</div>
                                {cFaltas > 0 && <div className="badge-count bc-faltas">{cFaltas} Faltas</div>}
                                {cFerias > 0 && <div className="badge-count bc-ferias">{cFerias} Férias</div>}
                                {cSaidas > 0 && <div className="badge-count bc-saida">{cSaidas} Saídas</div>}
                                {cAfastados > 0 && <div className="badge-count bc-afastado">{cAfastados} Afast.</div>}
                            </div>
                        </div>

                        <table className="matrix-table" style={{ marginTop: 0 }}>
                            <thead>
                                <tr>
                                    <th>Operador</th>
                                    <th style={{ textAlign: 'center' }}>Turno</th>
                                    <th style={{ textAlign: 'center' }}>Linha(s)</th>
                                    <th style={{ textAlign: 'center' }}>Vínculo</th>
                                    <th>Alocação Atual</th>
                                </tr>
                            </thead>
                            <tbody>
                                {equipeFiltrada.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: '15px' }}>
                                            Nenhum operador encontrado com os filtros atuais.
                                        </td>
                                    </tr>
                                ) : (
                                    equipeFiltrada.map(op => {
                                        const aloc = db.alocacoes.filter(a => String(a.colaborador_id) === String(op.id)).slice(-1)[0];
                                        let icone = "", infoAdicional = "";
                                        const hojeStr = new Date().toISOString().split('T')[0];

                                        // Verifica se tem linhas de cobertura (para saber se é Polivalente internamente)
                                        const temLinhasCobertura = op.linhas_vinculadas && op.linhas_vinculadas.length > 0;

                                        // CORES E BORDAS - Prioridade: Status Especial > Polivalente > Normal
                                        let rowBg = '#ffffff';
                                        let rowBorderLeft = '4px solid transparent';
                                        let classeStatus = "status-normal";
                                        let displayIcone = "";

                                        // 1. PRIORIDADE MÁXIMA: Status Especiais
                                        if (op.status_especial === "Absenteísmo") {
                                            displayIcone = "⚠️ ";
                                            classeStatus = "status-absenteismo";
                                            let falta = (op.historicoFaltas || []).find(f => f.data === hojeStr);
                                            infoAdicional = falta?.motivo ? ` (Motivo: ${falta.motivo})` : " (Faltou)";
                                            rowBg = '#fadbd8';
                                            rowBorderLeft = '4px solid #e74c3c';
                                        } else if (op.status_especial === "Saída Antecipada") {
                                            displayIcone = "🚪 ";
                                            classeStatus = "status-earlyexit";
                                            infoAdicional = op.early_exit_time ? ` (Saiu às ${op.early_exit_time})` : "";
                                            rowBg = '#fdebd0';
                                            rowBorderLeft = '4px solid #e67e22';
                                        } else if (op.status_especial === "Afastamento / Licença") {
                                            displayIcone = "🏥 ";
                                            classeStatus = "status-afastamento";
                                            infoAdicional = " (Afastado / Licença Médica)";
                                            rowBg = '#e5e7e9';
                                            rowBorderLeft = '4px solid #95a5a6';
                                        } else if (op.status_especial === "Férias") {
                                            displayIcone = "✈️ ";
                                            classeStatus = "status-ferias";
                                            if (op.vacation_end) infoAdicional = ` (${calcularDiasFerias(op.vacation_end)})`;
                                            rowBg = '#d6eaf8';
                                            rowBorderLeft = '4px solid #3498db';
                                        }
                                        // 2. SEGUNDA PRIORIDADE: Status Polivalente (só se não tiver status especial)
                                        else if (op.status_especial === "Polivalente" && temLinhasCobertura) {
                                            displayIcone = "⭐ ";
                                            classeStatus = "status-polivalente";
                                            rowBg = '#fef9e7';
                                            rowBorderLeft = '4px solid #f1c40f';
                                        }
                                        // 3. Caso especial: Tem linhas de cobertura mas NÃO tem status Polivalente (não deve acontecer, mas tratamos)
                                        else if (temLinhasCobertura) {
                                            // Não mostra ícone, mas mantém as linhas na coluna Linha(s)
                                            rowBg = '#ffffff';
                                            rowBorderLeft = '4px solid transparent';
                                        }

                                        // Se expandido, sobrepõe com azul claro
                                        const currentBg = opExpandido === op.id ? '#ebf5fb' : rowBg;
                                        const currentBorder = opExpandido === op.id ? '4px solid #3498db' : rowBorderLeft;

                                        const countHE = op.overtimeDates ? op.overtimeDates.length : 0;
                                        const badgeHE = countHE > 0 ? (
                                            <span style={{ marginLeft: '10px', background: '#2980b9', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7em', fontWeight: 'bold' }}>
                                                {countHE} HE
                                            </span>
                                        ) : null;

                                        // Buscar performance do operador
                                        const opPerf = db.opPerformance?.[op.nome] || {};

                                        return (
                                            <React.Fragment key={op.id}>
                                                <tr
                                                    style={{
                                                        backgroundColor: currentBg,
                                                        transition: 'background-color 0.2s',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => {
                                                        setOpExpandido(opExpandido === op.id ? null : op.id);
                                                        setActiveForm('');
                                                        setFormValues({});
                                                        setFiltroSkillProduto('');
                                                    }}
                                                >
                                                    <td style={{ padding: '10px', borderLeft: currentBorder }}>
                                                        <span className={classeStatus}>
                                                            {displayIcone}<strong style={{ fontSize: '1.05em', color: '#2c3e50' }}>{op.nome}</strong>
                                                        </span>
                                                        {badgeHE}
                                                        {infoAdicional && (
                                                            <span style={{ color: '#e74c3c', fontSize: '0.85em', fontWeight: 'bold', marginLeft: '10px' }}>
                                                                {infoAdicional}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {op.turno || 'T1'}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {temLinhasCobertura ? (
                                                            <>
                                                                <span style={{ fontWeight: 'bold', color: '#34495e', fontSize: '0.95em' }}>
                                                                    {op.linhas_vinculadas[0]}
                                                                </span>
                                                                {op.linhas_vinculadas.length > 1 && (
                                                                    <>
                                                                        <br />
                                                                        <span style={{ fontSize: '0.75em', color: '#d35400', fontWeight: 'bold' }}>
                                                                            (+ {op.linhas_vinculadas.slice(1).join(', ')})
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span style={{ fontWeight: 'bold', color: '#34495e', fontSize: '0.95em' }}>
                                                                {op.linha || ''}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {op.vinculo === 'CTD' ? 'CTD' : (op.vinculo === 'Temporário' ? 'TEMP' : 'EF')}
                                                    </td>
                                                    <td style={{ color: '#2980b9' }}>
                                                        {aloc ? (
                                                            <span>
                                                                <b>{aloc.produto}</b> - {aloc.posto}
                                                            </span>
                                                        ) : (
                                                            <i>Não alocado</i>
                                                        )}
                                                    </td>
                                                </tr>

                                                {/* GAVETA DE FORMULÁRIOS (EXPANDIDA) */}
                                                {opExpandido === op.id && (
                                                    <tr>
                                                        <td colSpan="4" style={{ padding: 0, border: 'none' }}>
                                                            <div className="expand-drawer" style={{
                                                                padding: '15px',
                                                                background: '#fdfdfd',
                                                                borderTop: '1px solid #e0e0e0'
                                                            }}>
                                                                <div className="btn-status-group" style={{
                                                                    marginBottom: '15px',
                                                                    display: 'flex',
                                                                    gap: '10px',
                                                                    flexWrap: 'wrap'
                                                                }}>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'poli' ? 'active' : ''}`}
                                                                        onClick={() => {
                                                                            setFormValues({
                                                                                ...formValues,
                                                                                linhasPoli: [...(op.linhas_vinculadas || [])]
                                                                            });
                                                                            setActiveForm(activeForm === 'poli' ? '' : 'poli');
                                                                        }}
                                                                    >
                                                                        ⭐ Polivalente
                                                                    </button>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'abs' ? 'active' : ''}`}
                                                                        onClick={() => setActiveForm('abs')}
                                                                    >
                                                                        ⚠️ Absenteísmo
                                                                    </button>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'ferias' ? 'active' : ''}`}
                                                                        onClick={() => setActiveForm('ferias')}
                                                                    >
                                                                        ✈️ Férias
                                                                    </button>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'saida' ? 'active' : ''}`}
                                                                        onClick={() => setActiveForm('saida')}
                                                                    >
                                                                        🚪 Saída Antecip.
                                                                    </button>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'he' ? 'active' : ''}`}
                                                                        onClick={() => setActiveForm('he')}
                                                                    >
                                                                        ⏰ Hora Extra
                                                                    </button>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'afastamento' ? 'active' : ''}`}
                                                                        onClick={() => setActiveForm('afastamento')}
                                                                    >
                                                                        🏥 Afastamento
                                                                    </button>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'alloc' ? 'active' : ''}`}
                                                                        onClick={() => setActiveForm('alloc')}
                                                                    >
                                                                        ⚡ Alocação Rápida
                                                                    </button>
                                                                    <button
                                                                        className={`btn-status ${activeForm === 'skill' ? 'active' : ''}`}
                                                                        onClick={() => setActiveForm('skill')}
                                                                    >
                                                                        🧠 Skill Matrix
                                                                    </button>
                                                                </div>

                                                                {/* 1. POLIVALENTE */}
                                                                {activeForm === 'poli' && (
                                                                    <div className="drawer-form" style={{
                                                                        border: '1px solid #f1c40f',
                                                                        background: '#fdfefe',
                                                                        padding: '15px',
                                                                        borderRadius: '8px',
                                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                                    }}>
                                                                        <label style={{ fontSize: '0.7em', fontWeight: 'bold', color: '#d35400', textTransform: 'uppercase' }}>
                                                                            Selecione as Linhas de Cobertura (Polivalência):
                                                                        </label>
                                                                        <div className="poli-checkbox-group" style={{
                                                                            display: 'flex',
                                                                            flexWrap: 'wrap',
                                                                            gap: '8px',
                                                                            margin: '15px 0'
                                                                        }}>
                                                                            {db.linhas.map(l => (
                                                                                <label
                                                                                    key={l.id}
                                                                                    style={{
                                                                                        fontSize: '0.75em',
                                                                                        fontWeight: 'bold',
                                                                                        background: '#f9f9f9',
                                                                                        padding: '6px 12px',
                                                                                        borderRadius: '4px',
                                                                                        border: '1px solid #ddd',
                                                                                        cursor: 'pointer',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center'
                                                                                    }}
                                                                                >
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        style={{ width: 'auto', marginRight: '8px' }}
                                                                                        checked={(formValues.linhasPoli || []).includes(l.nome)}
                                                                                        onChange={(e) => {
                                                                                            const current = formValues.linhasPoli || [];
                                                                                            if (e.target.checked) {
                                                                                                setFormValues({ ...formValues, linhasPoli: [...current, l.nome] });
                                                                                            } else {
                                                                                                setFormValues({ ...formValues, linhasPoli: current.filter(x => x !== l.nome) });
                                                                                            }
                                                                                        }}
                                                                                    />
                                                                                    {l.nome}
                                                                                </label>
                                                                            ))}
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '10px' }}>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'Confirmar operador como Polivalente com as linhas selecionadas?',
                                                                                    () => executarSalvarPolivalente(op.id),
                                                                                    '#f39c12',
                                                                                    'Confirmar Polivalência'
                                                                                )}
                                                                                style={{
                                                                                    background: '#f39c12',
                                                                                    color: 'white',
                                                                                    fontSize: '0.85em',
                                                                                    padding: '10px 20px',
                                                                                    border: 'none',
                                                                                    borderRadius: '6px',
                                                                                    fontWeight: 'bold',
                                                                                    cursor: 'pointer'
                                                                                }}
                                                                            >
                                                                                Confirmar Polivalência
                                                                            </button>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    `Deseja remover apenas o status de Polivalente de ${op.nome}? As linhas de cobertura serão mantidas.`,
                                                                                    () => executarRemoverPolivalente(op.id),
                                                                                    '#7f8c8d',
                                                                                    'Remover Status'
                                                                                )}
                                                                                style={{
                                                                                    background: '#7f8c8d',
                                                                                    color: 'white',
                                                                                    fontSize: '0.85em',
                                                                                    padding: '10px 20px',
                                                                                    border: 'none',
                                                                                    borderRadius: '6px',
                                                                                    fontWeight: 'bold',
                                                                                    cursor: 'pointer'
                                                                                }}
                                                                            >
                                                                                Remover Status Polivalente
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 2. ABSENTEÍSMO */}
                                                                {activeForm === 'abs' && (
                                                                    <div className="drawer-form" style={{
                                                                        borderLeft: '4px solid #e74c3c',
                                                                        padding: '15px',
                                                                        background: '#fff',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'end' }}>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Motivo da Falta:</label>
                                                                                <input
                                                                                    type="text"
                                                                                    onChange={e => setFormValues({ ...formValues, absReason: e.target.value })}
                                                                                    placeholder="Ex: Atestado médico, Problema pessoal..."
                                                                                />
                                                                            </div>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'Registrar Falta para o dia de hoje?',
                                                                                    () => handleStatusChange(op.id, 'Absenteísmo', { absenteeismComment: formValues.absReason }),
                                                                                    '#e74c3c',
                                                                                    'Confirmar Falta'
                                                                                )}
                                                                                style={{ background: '#e74c3c', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Confirmar Falta
                                                                            </button>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'Remover o status de Absenteísmo deste operador?',
                                                                                    () => handleStatusChange(op.id, ''),
                                                                                    '#7f8c8d',
                                                                                    'Limpar Status'
                                                                                )}
                                                                                style={{ background: '#7f8c8d', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Limpar Status
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 3. FÉRIAS */}
                                                                {activeForm === 'ferias' && (
                                                                    <div className="drawer-form" style={{
                                                                        borderLeft: '4px solid #3498db',
                                                                        padding: '15px',
                                                                        background: '#fff',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '10px', alignItems: 'end' }}>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Início:</label>
                                                                                <input type="date" onChange={e => setFormValues({ ...formValues, vacStart: e.target.value })} />
                                                                            </div>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Data de Retorno:</label>
                                                                                <input type="date" onChange={e => setFormValues({ ...formValues, vacEnd: e.target.value })} />
                                                                            </div>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'Registrar período de Férias?',
                                                                                    () => handleStatusChange(op.id, 'Férias', { vacation_start: formValues.vacStart, vacation_end: formValues.vacEnd }),
                                                                                    '#3498db',
                                                                                    'Confirmar Férias'
                                                                                )}
                                                                                style={{ background: '#3498db', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Confirmar Férias
                                                                            </button>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'O operador retornou das férias?',
                                                                                    () => handleStatusChange(op.id, ''),
                                                                                    '#7f8c8d',
                                                                                    'Retornar'
                                                                                )}
                                                                                style={{ background: '#7f8c8d', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Retornar (Limpar)
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 4. SAÍDA ANTECIPADA */}
                                                                {activeForm === 'saida' && (
                                                                    <div className="drawer-form" style={{
                                                                        borderLeft: '4px solid #e67e22',
                                                                        padding: '15px',
                                                                        background: '#fff',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto auto', gap: '10px', alignItems: 'end' }}>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Horário:</label>
                                                                                {/* <input type="time" onChange={e => setFormValues({ ...formValues, exitTime: e.target.value })} /> */}
                                                                                <input type="text"
                                                                                    placeholder="HH:MM"
                                                                                    maxLength="5"
                                                                                    value={formValues.exitTime || ''}
                                                                                    onInput={(e) => {
                                                                                        let v = e.target.value.replace(/\D/g, '');          // remove tudo que não é dígito
                                                                                        if (v.length > 2) {
                                                                                            v = v.slice(0, 2) + ':' + v.slice(2, 4);
                                                                                        }
                                                                                        e.target.value = v;
                                                                                        setFormValues({ ...formValues, exitTime: v });
                                                                                    }} />
                                                                            </div>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Justificativa:</label>
                                                                                <input type="text" onChange={e => setFormValues({ ...formValues, exitReason: e.target.value })} placeholder="Ex: Banco de horas..." />
                                                                            </div>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'Registrar Saída Antecipada para este operador?',
                                                                                    () => handleStatusChange(op.id, 'Saída Antecipada', { early_exit_time: formValues.exitTime, earlyExitReason: formValues.exitReason }),
                                                                                    '#e67e22',
                                                                                    'Registrar Saída'
                                                                                )}
                                                                                style={{ background: '#e67e22', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Registrar Saída
                                                                            </button>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'Remover Saída Antecipada?',
                                                                                    () => handleStatusChange(op.id, ''),
                                                                                    '#7f8c8d',
                                                                                    'Limpar Status'
                                                                                )}
                                                                                style={{ background: '#7f8c8d', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Limpar Status
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 5. AFASTAMENTO */}
                                                                {activeForm === 'afastamento' && (
                                                                    <div className="drawer-form" style={{
                                                                        borderLeft: '4px solid #8e44ad',
                                                                        padding: '15px',
                                                                        background: '#fff',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <p style={{ fontSize: '0.95em', color: '#555', marginBottom: '15px' }}>
                                                                            O operador ficará oculto dos cálculos de labor operacional.
                                                                            <b> ATENÇÃO: Ao retornar de um afastamento, todos os seus treinamentos da Skill Matrix serão zerados automaticamente pelo sistema.</b>
                                                                        </p>
                                                                        <div style={{ display: 'flex', gap: '10px' }}>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'Confirmar Afastamento Médico/Licença? O operador será ocultado dos cálculos.',
                                                                                    () => handleStatusChange(op.id, 'Afastamento / Licença'),
                                                                                    '#8e44ad',
                                                                                    'Confirmar'
                                                                                )}
                                                                                style={{ background: '#8e44ad', width: 'auto', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Confirmar Afastamento
                                                                            </button>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    'ATENÇÃO: O operador está retornando do afastamento. Isso apagará TODOS os treinamentos da Skill Matrix dele. Continuar?',
                                                                                    () => {
                                                                                        // Primeiro zera os treinamentos, depois remove o status
                                                                                        executarZerarTreinamentos(op.id);
                                                                                        handleStatusChange(op.id, '');
                                                                                    },
                                                                                    '#27ae60',
                                                                                    'Retornar Operador'
                                                                                )}
                                                                                style={{ background: '#27ae60', width: 'auto', padding: '12px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                Retornar Operador (Limpar e Zerar Treinos)
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 6. HORA EXTRA */}
                                                                {activeForm === 'he' && (
                                                                    <div className="drawer-form" style={{
                                                                        borderLeft: '4px solid #2980b9',
                                                                        padding: '15px',
                                                                        background: '#fff',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        {(op.overtimeDates && op.overtimeDates.length > 0) && (
                                                                            <div style={{
                                                                                marginBottom: '20px',
                                                                                padding: '15px',
                                                                                background: '#ebf5fb',
                                                                                borderRadius: '8px',
                                                                                border: '1px solid #bce0fd'
                                                                            }}>
                                                                                <h5 style={{ margin: '0 0 10px 0', color: '#2980b9', fontSize: '0.9em', textTransform: 'uppercase' }}>
                                                                                    📅 Horas Extras Agendadas:
                                                                                </h5>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                    {op.overtimeDates.map((he, idx) => {
                                                                                        const dataHE = typeof he === 'string' ? he : he.data;
                                                                                        const reqTrans = he.transporte === 'SIM' ? '🚌 Transp.' : '';
                                                                                        const reqRefei = he.refeicao === 'SIM' ? '🍲 Ref.' : '';
                                                                                        const reqDesj = he.desjejum === 'SIM' ? '☕ Desj.' : '';
                                                                                        return (
                                                                                            <div key={idx} style={{
                                                                                                display: 'flex',
                                                                                                justifyContent: 'space-between',
                                                                                                alignItems: 'center',
                                                                                                background: 'white',
                                                                                                padding: '10px 15px',
                                                                                                borderRadius: '6px',
                                                                                                border: '1px solid #d6eaf8'
                                                                                            }}>
                                                                                                <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                                                                                                    {dataHE.split('-').reverse().join('/')}
                                                                                                    <span style={{ fontWeight: 'normal', color: '#7f8c8d', fontSize: '0.85em', marginLeft: '10px' }}>
                                                                                                        {reqTrans} {reqRefei} {reqDesj}
                                                                                                    </span>
                                                                                                </span>
                                                                                                <button
                                                                                                    onClick={() => showConfirm(
                                                                                                        `Cancelar a Hora Extra do dia ${dataHE.split('-').reverse().join('/')}?`,
                                                                                                        () => executarRemoverHE(op.id, dataHE),
                                                                                                        '#e74c3c',
                                                                                                        'Cancelar HE'
                                                                                                    )}
                                                                                                    style={{
                                                                                                        background: '#e74c3c',
                                                                                                        color: 'white',
                                                                                                        padding: '6px 12px',
                                                                                                        borderRadius: '4px',
                                                                                                        fontSize: '0.8em',
                                                                                                        border: 'none',
                                                                                                        cursor: 'pointer',
                                                                                                        fontWeight: 'bold',
                                                                                                        width: 'auto'
                                                                                                    }}
                                                                                                >
                                                                                                    ❌ Cancelar HE
                                                                                                </button>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <h5 style={{ margin: '0 0 10px 0', color: '#34495e', fontSize: '0.9em', textTransform: 'uppercase' }}>
                                                                            ➕ Agendar Nova Hora Extra
                                                                        </h5>
                                                                        <div style={{
                                                                            display: 'grid',
                                                                            gridTemplateColumns: '1fr 100px 100px 100px auto',
                                                                            gap: '10px',
                                                                            alignItems: 'end',
                                                                            background: '#f8f9fa',
                                                                            padding: '15px',
                                                                            borderRadius: '8px',
                                                                            border: '1px solid #ddd'
                                                                        }}>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Data da HE:</label>
                                                                                <input
                                                                                    type="date"
                                                                                    value={formValues.dataHE || ''}
                                                                                    onChange={e => setFormValues({ ...formValues, dataHE: e.target.value })}
                                                                                    style={{ padding: '10px' }}
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Desjejum?</label>
                                                                                <select
                                                                                    value={formValues.desjejum || 'NÃO'}
                                                                                    onChange={e => setFormValues({ ...formValues, desjejum: e.target.value })}
                                                                                    style={{ padding: '10px' }}
                                                                                >
                                                                                    <option value="NÃO">NÃO</option>
                                                                                    <option value="SIM">SIM</option>
                                                                                </select>
                                                                            </div>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Refeição?</label>
                                                                                <select
                                                                                    value={formValues.refeicao || 'NÃO'}
                                                                                    onChange={e => setFormValues({ ...formValues, refeicao: e.target.value })}
                                                                                    style={{ padding: '10px' }}
                                                                                >
                                                                                    <option value="NÃO">NÃO</option>
                                                                                    <option value="SIM">SIM</option>
                                                                                </select>
                                                                            </div>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>Transporte?</label>
                                                                                <select
                                                                                    value={formValues.transporte || 'NÃO'}
                                                                                    onChange={e => setFormValues({ ...formValues, transporte: e.target.value })}
                                                                                    style={{ padding: '10px' }}
                                                                                >
                                                                                    <option value="NÃO">NÃO</option>
                                                                                    <option value="SIM">SIM</option>
                                                                                </select>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => handleConfirmarHE(op.id)}
                                                                                style={{
                                                                                    background: '#2980b9',
                                                                                    padding: '10px 20px',
                                                                                    border: 'none',
                                                                                    borderRadius: '6px',
                                                                                    color: 'white',
                                                                                    fontWeight: 'bold',
                                                                                    cursor: 'pointer'
                                                                                }}
                                                                            >
                                                                                ✅ Agendar
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 7. ALOCAÇÃO RÁPIDA */}
                                                                {activeForm === 'alloc' && (
                                                                    <div className="drawer-form" style={{
                                                                        borderLeft: '4px solid #27ae60',
                                                                        padding: '15px',
                                                                        background: '#fff',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>1. Produto:</label>
                                                                                <select onChange={e => setFormValues({ ...formValues, quickProd: e.target.value })}>
                                                                                    <option value="">Selecione...</option>
                                                                                    {db.produtos.map(p => (
                                                                                        <option key={p.id} value={p.id}>{p.nome}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                            <div>
                                                                                <label style={{ fontSize: '0.8em', fontWeight: 'bold' }}>2. Estação (Posto):</label>
                                                                                <select onChange={e => setFormValues({ ...formValues, quickPosto: e.target.value })}>
                                                                                    <option value="">Selecione...</option>
                                                                                    {db.postos.map(p => (
                                                                                        <option key={p.id} value={p.id}>{p.nome}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => handleQuickAlloc(op.id)}
                                                                                style={{
                                                                                    background: '#27ae60',
                                                                                    padding: '12px 20px',
                                                                                    border: 'none',
                                                                                    borderRadius: '6px',
                                                                                    color: 'white',
                                                                                    fontWeight: 'bold',
                                                                                    cursor: 'pointer',
                                                                                    width: 'auto'
                                                                                }}
                                                                            >
                                                                                Salvar Treinamento
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 8. SKILL MATRIX */}
                                                                {activeForm === 'skill' && (
                                                                    <div className="drawer-form" style={{
                                                                        borderLeft: '4px solid #1abc9c',
                                                                        padding: '15px',
                                                                        background: '#fff',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                                                            <h5 style={{ margin: 0, color: '#2c3e50' }}>Treinamentos Atuais:</h5>
                                                                            <div>
                                                                                <select
                                                                                    value={filtroSkillProduto}
                                                                                    onChange={(e) => setFiltroSkillProduto(e.target.value)}
                                                                                    style={{ padding: '6px', fontSize: '0.85em', borderRadius: '4px', border: '1px solid #ccc' }}
                                                                                >
                                                                                    <option value="">Todos os Produtos</option>
                                                                                    {db.produtos.map(p => (
                                                                                        <option key={p.id} value={p.nome}>{p.nome}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                        </div>

                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '15px' }}>
                                                                            {db.alocacoes.filter(a => String(a.colaborador_id) === String(op.id) && (filtroSkillProduto === '' || a.produto === filtroSkillProduto)).length === 0 ? (
                                                                                <span style={{ fontSize: '0.85em', color: '#7f8c8d' }}>
                                                                                    Nenhum treinamento encontrado para este filtro.
                                                                                </span>
                                                                            ) : (
                                                                                db.alocacoes.filter(a => String(a.colaborador_id) === String(op.id) && (filtroSkillProduto === '' || a.produto === filtroSkillProduto)).map(a => (
                                                                                    <span key={a.id} className="badge-skill skill-trained" style={{ padding: '6px 12px' }}>
                                                                                        {a.produto} - {a.posto}
                                                                                    </span>
                                                                                ))
                                                                            )}
                                                                        </div>

                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '15px' }}>
                                                                            <button
                                                                                onClick={() => {
                                                                                    const postosTreinados = db.alocacoes
                                                                                        .filter(a => a.colaborador_id === op.id && (filtroSkillProduto === '' || a.produto === filtroSkillProduto))
                                                                                        .map(a => a.posto);
                                                                                    setFormValues({ ...formValues, showPostos: !formValues.showPostos, postosTreinados });
                                                                                }}
                                                                                style={{ background: '#1abc9c', width: 'auto', padding: '10px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                {formValues.showPostos ? 'Ocultar Matriz' : 'Ver Matriz de Postos'}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => showConfirm(
                                                                                    "ATENÇÃO: Deseja apagar TODOS os treinamentos do operador?",
                                                                                    () => executarZerarTreinamentos(op.id),
                                                                                    '#e74c3c',
                                                                                    'Zerar Tudo'
                                                                                )}
                                                                                style={{ background: '#e74c3c', width: 'auto', padding: '10px 20px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >
                                                                                🗑️ Zerar Todos os Treinamentos
                                                                            </button>
                                                                        </div>

                                                                        {formValues.showPostos && (
                                                                            <div style={{
                                                                                marginTop: '15px',
                                                                                background: '#fff4e5',
                                                                                padding: '15px',
                                                                                borderRadius: '8px',
                                                                                border: '1px solid #f39c12'
                                                                            }}>
                                                                                <h6 style={{ margin: '0 0 10px 0', color: '#d35400', fontSize: '0.85em', textTransform: 'uppercase' }}>
                                                                                    Matriz de Habilidades
                                                                                </h6>
                                                                                <div className="status-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                                                    {todasEstacoes.map(estacao => {
                                                                                        const isTrained = (formValues.postosTreinados || []).includes(estacao);
                                                                                        const opPerfEstacao = opPerf[estacao];
                                                                                        const yieldClass = opPerfEstacao ? getYieldColor(parseFloat(opPerfEstacao)) : '';

                                                                                        return (
                                                                                            <div
                                                                                                key={estacao}
                                                                                                className={`badge-skill ${isTrained ? 'skill-trained' : 'skill-empty'} ${yieldClass}`}
                                                                                                style={{
                                                                                                    flex: '1 1 0',
                                                                                                    minWidth: '75px', // Garante uma largura mínima ideal para não esmagar o texto
                                                                                                    height: '42px',   // Altura fixa padrão para alinhar com os indicadores
                                                                                                    fontSize: '0.75em',
                                                                                                    position: 'relative',
                                                                                                    cursor: 'help',
                                                                                                    // --- ENGENHARIA DE ALINHAMENTO CENTRALIZADO ---
                                                                                                    display: 'inline-flex',
                                                                                                    flexDirection: 'column',
                                                                                                    justifyContent: 'center', // Centraliza verticalmente
                                                                                                    alignItems: 'center',     // Centraliza horizontalmente
                                                                                                    textAlign: 'center',
                                                                                                    whiteSpace: 'normal',     // Permite quebra de linha se o nome for composto (ex: Sushi 01)
                                                                                                    lineHeight: '1.2',
                                                                                                    boxSizing: 'border-box',
                                                                                                    padding: '4px'
                                                                                                }}
                                                                                                title={opPerfEstacao ? `Yield: ${opPerfEstacao}%` : 'Sem dados de yield'}
                                                                                            >
                                                                                                <span style={{ fontWeight: 'bold', block: 'inline-block' }}>{estacao}</span>
                                                                                                {opPerfEstacao && (
                                                                                                    <span style={{
                                                                                                        display: 'block',
                                                                                                        fontSize: '0.85em',
                                                                                                        fontWeight: '900',
                                                                                                        marginTop: '2px',
                                                                                                        color: getYieldColor(parseFloat(opPerfEstacao)).includes('green') ? '#1e8449' :
                                                                                                            getYieldColor(parseFloat(opPerfEstacao)).includes('yellow') ? '#9a7d0a' : '#943126'
                                                                                                    }}>
                                                                                                        {opPerfEstacao}%
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL DE CONFIRMAÇÃO CUSTOMIZADO */}
            {confirmModal.isOpen && (
                <div
                    className="modal-overlay"
                    style={{ display: 'flex', zIndex: 99999 }}
                    onClick={(e) => {
                        if (e.target.className.includes('modal-overlay')) {
                            setConfirmModal({ ...confirmModal, isOpen: false });
                        }
                    }}
                >
                    <div className="modal-box" style={{
                        width: '400px',
                        padding: '30px',
                        textAlign: 'center',
                        animation: 'fadeIn 0.2s',
                        borderRadius: '12px'
                    }}>
                        <div style={{ fontSize: '3em', marginBottom: '10px' }}>⚠️</div>
                        <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '1.3em' }}>Confirmação</h3>
                        <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '0.95em', lineHeight: '1.5' }}>
                            {confirmModal.message}
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                                style={{
                                    background: '#ecf0f1',
                                    color: '#7f8c8d',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    width: '50%'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (confirmModal.action) confirmModal.action();
                                    setConfirmModal({ ...confirmModal, isOpen: false });
                                }}
                                style={{
                                    background: confirmModal.btnColor,
                                    color: 'white',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    width: '50%'
                                }}
                            >
                                {confirmModal.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}