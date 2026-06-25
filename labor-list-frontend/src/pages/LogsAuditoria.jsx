import React, { useEffect, useState, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LogsAuditoria() {
    const { user } = useContext(AuthContext);
    const [logs, setLogs] = useState([]);
    const [db, setDb] = useState({ produtos: [], lideres: [], linhas: [], operadores: [] });
    const [filtroTexto, setFiltroTexto] = useState('');
    const [filtroAcao, setFiltroAcao] = useState('');

    // Estados para controle do Modal de Inspeção Individual
    const [selectedLog, setSelectedLog] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [abaVisualizacao, setAbaVisualizacao] = useState('amigavel'); // 'amigavel' ou 'json'

    const carregarLogsEDados = () => {
        // Carrega os logs
        api.get('/carregar_logs')
            .then(res => setLogs(res.data))
            .catch(() => toast.error("Erro ao carregar logs de auditoria."));

        // Carrega dados gerais da fábrica para decodificar os IDs
        api.get('/carregar_tudo')
            .then(res => setDb(res.data))
            .catch(() => console.error("Erro ao cruzar dados de IDs para auditoria."));
    };

    useEffect(() => {
        if (user?.perfil === 'MASTER') {
            carregarLogsEDados();
        }
    }, [user]);

    if (user?.perfil !== 'MASTER') {
        return (
            <div className="page" style={{ textAlign: 'center', padding: '50px' }}>
                <h2 style={{ color: '#c0392b' }}>⛔ Acesso Restrito</h2>
                <p>O seu perfil atual não tem permissão para visualizar a trilha de auditoria do sistema.</p>
            </div>
        );
    }

    const acoesUnicas = [...new Set(logs.map(l => l.acao))];

    const logsFiltrados = logs.filter(log => {
        const matchAcao = filtroAcao === '' || log.acao === filtroAcao;
        const stringona = `${log.usuario_login} ${log.acao} ${JSON.stringify(log.detalhes)}`.toUpperCase();
        const matchTexto = filtroTexto === '' || stringona.includes(filtroTexto.toUpperCase());
        return matchAcao && matchTexto;
    });

    const abrirInspeção = (log) => {
        setSelectedLog(log);
        setAbaVisualizacao('amigavel');
        setIsModalOpen(true);
    };

    // Dicionário base de tradução dos termos técnicos
    const dicionarioTermos = {
        id: 'ID do Registro',
        nome: 'Nome do Colaborador',
        cargo: 'Cargo Ocupado',
        vinculo: 'Vínculo Contratual',
        turno: 'Turno de Trabalho',
        lider_id: 'Líder Responsável',
        linhas: 'Linhas Vinculadas',
        linha_id: 'Linha Principal',
        produtoId: 'Produto',
        produto_id: 'Produto',
        posto_id: 'Posto de Trabalho',
        postos_ids: 'Postos de Trabalho Cadastrados',
        status_novo: 'Novo Status Definido',
        is_explicit_update: 'Atualização Direta',
        absenteeismComment: 'Motivo da Falta',
        early_exit_time: 'Horário de Saída',
        earlyExitReason: 'Motivo da Saída Antecipada',
        vacation_start: 'Início das Férias',
        vacation_end: 'Retorno das Férias',
        data_he: 'Data da Hora Extra',
        desjejum: 'Solicitou Desjejum',
        refeicao: 'Solicitou Refeição',
        transporte: 'Solicitou Transporte',
        login_ldap: 'Login de Rede (LDAP)',
        perfil: 'Perfil de Acesso',
        rows: 'Registros Sincronizados',
        colaborador_id: 'Colaborador',
        novo_lider_id: 'Novo Líder Responsável',
        novo_turno: 'Novo Turno Base',
        nova_linha_id: 'Nova Linha Principal'
    };

    // ============================================================================
    // INTELIGÊNCIA DE CRUTAMENTO DE DADOS (RESOLUÇÃO DE IDs)
    // ============================================================================
    const resolverNomePeloID = (chave, valor) => {
        const valorStr = String(valor);

        // 1. Resolver PRODUTO
        if (chave === 'produto_id' || chave === 'produtoId') {
            const prod = db.produtos.find(p => String(p.id) === valorStr);
            return prod ? `${prod.nome} (ID: #${valorStr})` : `Produto #${valorStr}`;
        }

        // 2. Resolver LINHA
        if (chave === 'linha_id' || chave === 'nova_linha_id') {
            const lin = db.linhas.find(l => String(l.id) === valorStr);
            return lin ? `${lin.nome} (ID: #${valorStr})` : `Linha #${valorStr}`;
        }

        // 3. Resolver LÍDER
        if (chave === 'lider_id' || chave === 'novo_lider_id') {
            const lid = db.lideres.find(l => String(l.id) === valorStr);
            return lid ? `${lid.nome} (ID: #${valorStr})` : `Líder #${valorStr}`;
        }

        // 4. Resolver COLABORADOR / OPERADOR
        if (chave === 'colaborador_id' || (chave === 'id' && !selectedLog?.acao.toUpperCase().includes('PRODUTO'))) {
            // Procura tanto em operadores quanto em líderes (caso o excluído seja líder)
            const op = db.operadores.find(o => String(o.id) === valorStr) || db.lideres.find(l => String(l.id) === valorStr);
            return op ? `${op.nome} (ID: #${valorStr})` : `Colaborador #${valorStr}`;
        }

        // 5. Resolver MÚLTIPLOS POSTOS (Array de IDs)
        if (chave === 'postos_ids' && Array.isArray(valor)) {
            return valor.map(pid => {
                const postoNome = db.postos?.find(p => String(p.id) === String(pid))?.nome || `#${pid}`;
                return postoNome;
            }).join(', ');
        }

        // 6. Resolver POSTO ÚNICO
        if (chave === 'posto_id') {
            const postoNome = db.postos?.find(p => String(p.id) === valorStr)?.nome || `#${valorStr}`;
            return `${postoNome} (ID: #${valorStr})`;
        }

        // Retorno padrão para dados que não são IDs relacionais (textos comuns, datas, etc)
        if (Array.isArray(valor)) return valor.join(', ');
        return valorStr;
    };

    // INTERFACE AMIGÁVEL RENDERIZADA
    const renderizarMetadadosAmigaveis = (detalhes) => {
        try {
            const obj = typeof detalhes === 'string' ? JSON.parse(detalhes) : detalhes;

            if (!obj || Object.keys(obj).length === 0) {
                return <div style={{ color: '#7f8c8d', fontStyle: 'italic' }}>Nenhum metadado adicional registrado para esta ação.</div>;
            }

            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(obj).map(([chave, valor]) => {
                        const labelAmigavel = dicionarioTermos[chave] || chave.replace(/_/g, ' ').toUpperCase();

                        // Dispara a resolução inteligente para traduzir o ID no nome correto
                        const valorTratado = resolverNomePeloID(chave, valor);

                        const isSim = valorTratado === 'SIM' || valorTratado === 'true';
                        const isNao = valorTratado === 'NÃO' || valorTratado === 'false';

                        let valorStyle = { fontWeight: 'bold', color: '#2c3e50', textAlign: 'right', wordBreak: 'break-word' };
                        if (isSim) valorStyle = { ...valorStyle, background: '#27ae60', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.9em' };
                        if (isNao) valorStyle = { ...valorStyle, background: '#95a5a6', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.9em' };

                        return (
                            <div key={chave} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.95em', gap: '15px' }}>
                                <span style={{ color: '#7f8c8d', fontWeight: '500', whiteSpace: 'nowrap' }}>{labelAmigavel}:</span>
                                <span style={valorStyle}>{valorTratado}</span>
                            </div>
                        );
                    })}
                </div>
            );
        } catch (e) {
            return <div style={{ color: '#2c3e50', fontWeight: 'bold' }}>{String(detalhes)}</div>;
        }
    };

    const renderizarJsonBruto = (detalhes) => {
        try {
            const obj = typeof detalhes === 'string' ? JSON.parse(detalhes) : detalhes;
            return (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: '0.9em', color: '#2980b9', lineHeight: '1.5' }}>
                    {JSON.stringify(obj, null, 4)}
                </pre>
            );
        } catch (e) {
            return <span style={{ color: '#7f8c8d' }}>{String(detalhes)}</span>;
        }
    };

    return (
        <div className="page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '3px solid #f4f7fa', paddingBottom: '15px' }}>
                <h2 style={{ margin: 0, fontSize: '2em', fontWeight: 800, color: '#2c3e50' }}>📜 Logs de Auditoria (Trilha Invisível)</h2>
                <button onClick={carregarLogsEDados} style={{ width: 'auto', background: '#34495e', color: 'white', padding: '10px 20px', fontWeight: 'bold' }}>🔄 Atualizar Logs</button>
            </div>

            {/* FILTROS */}
            <div className="filter-row" style={{ marginBottom: '20px', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ flex: 2 }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Pesquisa Geral (Utilizador, IDs ou Conteúdo)</label>
                    <input
                        type="text"
                        placeholder="Clique em qualquer linha da tabela para inspecionar os detalhes resolvidos..."
                        value={filtroTexto}
                        onChange={e => setFiltroTexto(e.target.value)}
                        style={{ padding: '10px', fontSize: '1em' }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Filtrar por Ação</label>
                    <select value={filtroAcao} onChange={e => setFiltroAcao(e.target.value)} style={{ padding: '10px', fontSize: '1em' }}>
                        <option value="">Todas as Ações</option>
                        {acoesUnicas.map((ac, idx) => <option key={idx} value={ac}>{ac}</option>)}
                    </select>
                </div>
            </div>

            {/* TABELA DE REGISTROS */}
            <div className="leader-card" style={{ display: 'block', padding: 0, overflow: 'hidden' }}>
                <table className="matrix-table" style={{ marginTop: 0 }}>
                    <thead style={{ background: '#2c3e50', color: 'white' }}>
                        <tr>
                            <th style={{ width: '80px', textAlign: 'center' }}>ID</th>
                            <th style={{ width: '150px' }}>Data/Hora</th>
                            <th style={{ width: '180px' }}>Utilizador (LDAP)</th>
                            <th style={{ width: '220px' }}>Ação Executada</th>
                            <th>Metadados Resumidos (Clique para expandir)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logsFiltrados.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>Nenhum log de auditoria encontrado para os filtros aplicados.</td></tr>
                        ) : (
                            logsFiltrados.map(log => {
                                const bruto = typeof log.detalhes === 'object' ? JSON.stringify(log.detalhes) : log.detalhes;
                                const isCritico = log.acao.toUpperCase().includes('EXCLUIR') || log.acao.toUpperCase().includes('ZERAR') || log.acao.toUpperCase().includes('REVOGAR');

                                // Formata a data/hora (ajuste o nome do campo conforme seu banco)
                                const dataHora = log.data_hora
                                    ? new Date(log.data_hora).toLocaleString('pt-BR', {
                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                                    })
                                    : '—';

                                return (
                                    <tr
                                        key={log.id}
                                        className="hover-row"
                                        onClick={() => abrirInspeção(log)}
                                        style={{ fontSize: '0.9em', cursor: 'pointer' }}
                                    >
                                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: isCritico ? '#e74c3c' : '#7f8c8d' }}>
                                            {isCritico ? '🚨' : ''} #{log.id}
                                        </td>
                                        <td style={{ fontSize: '0.85em', color: '#555' }}>{dataHora}</td>  {/* ← NOVA CÉLULA */}
                                        <td>
                                            <span style={{ background: '#ebf5fb', color: '#2980b9', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                {log.usuario_login}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: '700', color: isCritico ? '#c0392b' : '#2c3e50' }}>{log.acao}</td>
                                        <td style={{ color: '#7f8c8d', background: '#fcfcfc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>
                                            {bruto}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ============================================================================
                MODAL DE INSPEÇÃO AVANÇADA (IDs TRADUZIDOS EM NOMES)
            ============================================================================ */}
            {isModalOpen && selectedLog && (
                <div className="modal-overlay" style={{ display: 'flex', zIndex: 99999 }} onClick={(e) => { if (e.target.className.includes('modal-overlay')) setIsModalOpen(false) }}>
                    <div className="modal-box" style={{ width: '650px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '12px', overflow: 'hidden' }}>

                        {/* CABEÇALHO DO MODAL */}
                        <div style={{
                            background: selectedLog.acao.toUpperCase().includes('EXCLUIR') ? '#c0392b' : '#34495e',
                            padding: '20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: 0, color: 'white', fontSize: '1.2em' }}>
                                🔎 Relatório de Auditoria: Registro #{selectedLog.id}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5em', width: 'auto', padding: 0 }}>&times;</button>
                        </div>

                        {/* SUB-ABAS DE NAVEGAÇÃO INTERNA DO MODAL */}
                        <div style={{ display: 'flex', background: '#eee', borderBottom: '1px solid #ddd' }}>
                            <button
                                onClick={() => setAbaVisualizacao('amigavel')}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: abaVisualizacao === 'amigavel' ? '#fff' : 'transparent',
                                    border: 'none',
                                    fontWeight: 'bold',
                                    color: abaVisualizacao === 'amigavel' ? '#1abc9c' : '#555',
                                    cursor: 'pointer',
                                    borderBottom: abaVisualizacao === 'amigavel' ? '3px solid #1abc9c' : 'none'
                                }}
                            >
                                📋 Tradução Amigável (Nomes Reais)
                            </button>
                            <button
                                onClick={() => setAbaVisualizacao('json')}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: abaVisualizacao === 'json' ? '#fff' : 'transparent',
                                    border: 'none',
                                    fontWeight: 'bold',
                                    color: abaVisualizacao === 'json' ? '#2980b9' : '#555',
                                    cursor: 'pointer',
                                    borderBottom: abaVisualizacao === 'json' ? '3px solid #2980b9' : 'none'
                                }}
                            >
                                💻 Código Técnico (JSON Bruto)
                            </button>
                        </div>

                        {/* CONTEÚDO DINÂMICO CONFORME A ABA SELECIONADA */}
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', gap: '15px' }}>

                            {/* Metadados Fixos do Log */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={{ background: '#f8f9fa', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#95a5a6' }}>RESPONSÁVEL PELA AÇÃO</span>
                                    <div style={{ fontSize: '1.05em', fontWeight: 'bold', color: '#2c3e50', marginTop: '2px' }}>{selectedLog.usuario_login}</div>
                                </div>
                                <div style={{ background: '#f8f9fa', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#95a5a6' }}>EVENTO MAPEADO</span>
                                    <div style={{ fontSize: '1.05em', fontWeight: 'bold', color: '#2c3e50', marginTop: '2px' }}>{selectedLog.acao}</div>
                                </div>
                                <span style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#95a5a6' }}>DATA/HORA</span>
                                <div style={{ fontSize: '1.05em', fontWeight: 'bold', color: '#2c3e50', marginTop: '2px' }}>
                                    {selectedLog.data_hora
                                        ? new Date(selectedLog.data_hora).toLocaleString('pt-BR', {
                                            day: '2-digit', month: '2-digit', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                                        })
                                        : '—'}
                                </div>
                            </div>

                            {/* Área de Payload Alternável */}
                            <div style={{ background: '#fff', padding: '15px', borderRadius: '6px', border: '1px solid #e2e8f0', flex: 1 }}>
                                <span style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#95a5a6', display: 'block', marginBottom: '10px' }}>CONTEÚDO DETALHADO DO EVENTO</span>
                                <div style={{ background: '#fafafa', border: '1px solid #ddd', padding: '15px', borderRadius: '4px', overflowX: 'auto', maxHeight: '35vh' }}>
                                    {abaVisualizacao === 'amigavel'
                                        ? renderizarMetadadosAmigaveis(selectedLog.detalhes)
                                        : renderizarJsonBruto(selectedLog.detalhes)
                                    }
                                </div>
                            </div>
                        </div>

                        {/* RODAPÉ DO MODAL */}
                        <div style={{ padding: '15px 20px', borderTop: '1px solid #eee', background: '#f8f9fa', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setIsModalOpen(false)} style={{ width: 'auto', padding: '10px 25px', cursor: 'pointer', background: '#34495e', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '6px' }}>
                                Fechar Inspeção
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}