import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';

// ============================================================================
// CONFIGURAÇÃO DO WEBSOCKET
// Conexão em tempo real utilizando o IP dinâmico do servidor da fábrica
// ============================================================================
const currentHost = window.location.hostname;
const socket = io(`http://${currentHost}:5008`);

// Lista fixa e ordenada das 21 estações de trabalho da linha de produção
const TODAS_ESTACOES = [
    "ABASTECIMENTO", "Sushi 01", "Sushi 02", "GIRO", 
    "MA01", "MA02", "MA03", "MA04", "MA05", "MA06", "MA07", "MA08", "MA09", "MA10", 
    "MMFT", "RUNIN", 
    "PKG01", "PKG02", "PKG03", "PREKIT", "REPARO"
];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function SkillMatrix() {
    
    // Estado que centraliza toda a massa de dados vinda do PostgreSQL
    const [db, setDb] = useState({ 
        operadores: [], 
        produtos: [], 
        linhas: [], 
        lideres: [], 
        postos: [], 
        alocacoes: [], 
        colaborador_yield: [] 
    });
    
    // Estado dos filtros da barra de ferramentas superior
    const [filtros, setFiltros] = useState({ 
        linha: '', 
        lider: '', 
        turno: '', 
        produtoId: '', 
        posto: '' 
    });
    
    // Estado para gerenciar a abertura e os dados do Modal de Yield
    const [yieldModal, setYieldModal] = useState(null);

    /**
     * Efetua a chamada à API para carregar a versão mais recente do banco de dados
     */
    const carregarDados = () => {
        api.get('/carregar_tudo')
           .then(res => setDb(res.data))
           .catch(console.error);
    };

    // Inicializa a tela e configura o escutador do Socket para atualizações automáticas
    useEffect(() => { 
        carregarDados();
        socket.on('dados_atualizados', () => carregarDados());
        return () => socket.off('dados_atualizados');
    }, []);

    /**
     * Sincroniza as escolhas dos menus dropdown com o estado de filtros
     */
    const handleChange = (e) => {
        setFiltros({ ...filtros, [e.target.name]: e.target.value });
    };

    /**
     * Reseta todos os seletores para o estado inicial
     */
    const limparFiltros = () => {
        setFiltros({ linha: '', lider: '', turno: '', produtoId: '', posto: '' });
    };

    // Recupera o nome do produto selecionado para validar os cruzamentos de alocação
    const produtoNome = db.produtos.find(p => String(p.id) === String(filtros.produtoId))?.nome;

    // ============================================================================
    // REGRA DE FILTRAGEM DOS OPERADORES
    // ============================================================================
    const operadoresFiltrados = db.operadores.filter(op => {
        
        // Bloqueia a renderização se o usuário não escolheu um produto-alvo no seletor amarelo
        if (!produtoNome) return false;
        
        // Validação da linha de atuação (verifica linha principal e linhas de polivalência)
        const arrLinhas = Array.isArray(op.linhas_vinculadas) ? op.linhas_vinculadas : [];
        const matchLinha = filtros.linha === "" || arrLinhas.includes(filtros.linha) || op.linha === filtros.linha;
        
        const matchLider = filtros.lider === "" || String(op.lider_id) === String(filtros.lider);
        const matchTurno = filtros.turno === "" || (op.turno || 'T1') === filtros.turno;
        
        // Filtro de Posto específico: o operador só passa se possuir alocação registrada nesse posto
        const matchPosto = filtros.posto === "" || db.alocacoes.some(a => 
            String(a.colaborador_id) === String(op.id) && 
            a.produto === produtoNome && 
            a.posto === filtros.posto
        );
        
        // Oculta da matriz operadores sob licença médica ou afastamento definitivo
        const matchStatus = op.status_especial !== "Afastamento / Licença" && op.status_especial !== "Afastamento/Licença";

        return matchLinha && matchLider && matchTurno && matchPosto && matchStatus;
    });

    // ============================================================================
    // GRAVAÇÃO DA AVALIAÇÃO DE QUALIDADE (YIELD)
    // ============================================================================
    const salvarYield = async (corClassificacao) => {
        try {
            await api.post('/salvar_yield_colaborador', {
                colaborador_id: yieldModal.opId,
                produto_id: yieldModal.produtoId,
                posto_id: yieldModal.postoId,
                classificacao: corClassificacao
            });
            toast.success("Classificação de Yield gravada!");
            setYieldModal(null);
            carregarDados(); // Força recarga para atualizar as cores das barras na tela
        } catch (e) {
            toast.error("Erro ao salvar classificação.");
        }
    };

    // ============================================================================
    // INTERFACE VISUAL (JSX)
    // ============================================================================
    return (
        <div className="page">
            <h2 className="page-title">🔍 Matriz de Habilidades (Skill Matrix)</h2>
            
            {/* ============================================================================
                CONTAINER DOS FILTROS SUPERIORES
            ============================================================================ */}
            <div className="skill-matrix-section" style={{ padding: '20px', background: '#fff4e5', border: '2px solid #f39c12', borderRadius: '8px', marginBottom: '25px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    
                    <select name="linha" value={filtros.linha} onChange={handleChange} style={{ padding: '10px', border: '1px solid #ced4da', borderRadius: '6px', background: '#fff' }}>
                        <option value="">Todas as Linhas</option>
                        {db.linhas.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                    </select>
                    
                    <select name="lider" value={filtros.lider} onChange={handleChange} style={{ padding: '10px', border: '1px solid #ced4da', borderRadius: '6px', background: '#fff' }}>
                        <option value="">Todos os Líderes</option>
                        {db.lideres.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                    </select>
                    
                    <select name="turno" value={filtros.turno} onChange={handleChange} style={{ padding: '10px', border: '1px solid #ced4da', borderRadius: '6px', background: '#fff' }}>
                        <option value="">Todos os Turnos</option>
                        <option value="T1">Turno 1</option>
                        <option value="T2">Turno 2</option>
                    </select>
                    
                    <select name="produtoId" value={filtros.produtoId} onChange={handleChange} style={{ padding: '10px', background: '#fcf3cf', fontWeight: 'bold', border: '2px solid #f1c40f', borderRadius: '6px' }}>
                        <option value="">Produto...</option>
                        {db.produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                    
                    <select name="posto" value={filtros.posto} onChange={handleChange} style={{ padding: '10px', border: '1px solid #ced4da', borderRadius: '6px', background: '#fff' }}>
                        <option value="">-- Filtrar Treinado em... --</option>
                        {TODAS_ESTACOES.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>

                    <button onClick={limparFiltros} style={{ background: '#e74c3c', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Limpar Filtros
                    </button>
                </div>
            </div>

            {/* ============================================================================
                CONTÊINER DA MATRIZ: ADAPTAÇÃO TOTAL À TELA
            ============================================================================ */}
            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                
                {/* tableLayout: 'fixed' divide o espaço da tela baseado nas porcentagens dos <th> */}
                <table className="matrix-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', margin: 0 }}>
                    <thead>
                        <tr>
                            {/* Proporções ideais ajustadas: 22% / 6% / 72% */}
                            <th style={{ padding: '14px 10px', width: '22%', background: '#f39c12', color: 'white', fontSize: '0.95em', textAlign: 'left', borderBottom: '3px solid #d68910', textTransform: 'uppercase' }}>Operador / Líder</th>
                            <th style={{ padding: '14px 5px', width: '6%', background: '#f39c12', color: 'white', textAlign: 'center', fontSize: '0.95em', borderBottom: '3px solid #d68910', textTransform: 'uppercase' }}>Linha</th>
                            <th style={{ padding: '14px 10px', width: '72%', background: '#f39c12', color: 'white', fontSize: '0.95em', textAlign: 'center', borderBottom: '3px solid #d68910', textTransform: 'uppercase' }}>Status de Treinamento e Yield (Clique para avaliar)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!produtoNome ? (
                            <tr>
                                <td colSpan="3" style={{ textAlign: 'center', padding: '60px', fontSize: '1.2em', color: '#7f8c8d', fontWeight: '500' }}>
                                    ☝️ Selecione um produto no menu de filtro amarelo acima para carregar a matriz operacional.
                                </td>
                            </tr>
                        ) : (
                            operadoresFiltrados.map(op => {
                                const treinos = db.alocacoes.filter(a => String(a.colaborador_id) === String(op.id) && a.produto === produtoNome).map(a => a.posto);
                                
                                // Regra: Polivalentes ganham fundo amarelo claro. Operadores normais ganham fundo branco.
                                const isPoli = op.status_especial === 'Polivalente' || (op.linhas_vinculadas && op.linhas_vinculadas.length > 1);
                                const linhaStyle = isPoli 
                                    ? { backgroundColor: '#fef9e7', borderTop: '1px solid #f1c40f', borderBottom: '1px solid #f1c40f' }
                                    : { backgroundColor: '#ffffff', borderBottom: '1px solid #eef2f7' };

                                return (
                                    <tr key={op.id} className="hover-row" style={linhaStyle}>
                                        
                                        {/* COLUNA 1: DADOS DO OPERADOR */}
                                        <td style={{ padding: '12px 10px', borderLeft: isPoli ? '4px solid #f1c40f' : '1px solid #eef2f7', verticalAlign: 'middle', overflow: 'hidden' }}>
                                            <span style={{ display: 'block', marginBottom: '3px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                {isPoli ? '⭐ ' : ''}<strong style={{ color: '#2c3e50', fontSize: '0.95em' }}>{op.nome}</strong>
                                                <span className={`tag-vinculo ${op.vinculo === 'Temporário' ? 'tag-temp' : (op.vinculo === 'CTD' ? 'tag-ctd' : 'tag-efetivo')}`} style={{ marginLeft: '6px' }}>
                                                    {op.vinculo === 'CTD' ? 'CTD' : op.vinculo === 'Temporário' ? 'TE' : 'EF'}
                                                </span>
                                            </span>
                                            <span style={{ color: '#7f8c8d', fontSize: '0.8em', display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                Líder: <b>{op.nome_lider || 'Sem Líder'}</b> | Turno: <b>{op.turno || 'T1'}</b>
                                            </span>
                                        </td>
                                        
                                        {/* COLUNA 2: LINHAS */}
                                        <td style={{ textAlign: 'center', padding: '12px 5px', fontWeight: 'bold', color: '#34495e', fontSize: '0.9em', borderLeft: '1px solid #eef2f7', verticalAlign: 'middle' }}>
                                            {(op.linhas_vinculadas || []).join(', ')}
                                        </td>
                                        
                                        {/* COLUNA 3: AS 21 ESTAÇÕES (CAIXAS SEPARADAS) */}
                                        <td style={{ padding: '8px', borderLeft: '1px solid #eef2f7', verticalAlign: 'middle' }}>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2px', flexWrap: 'nowrap', width: '100%' }}>
                                                {TODAS_ESTACOES.map(posto => {
                                                    const temTreino = treinos.includes(posto);
                                                    
                                                    const postoObjeto = db.postos.find(p => p.nome === posto);
                                                    const postoId = postoObjeto ? postoObjeto.id : null;
                                                    
                                                    const yieldRegistro = db.colaborador_yield.find(y => 
                                                        String(y.colaborador_id) === String(op.id) && 
                                                        y.produto_nome === produtoNome && 
                                                        y.posto_nome === posto
                                                    );
                                                    
                                                    // Determina a cor da barra de yield SEPARADA
                                                    let corBarraYield = '#eee';
                                                    if (temTreino && yieldRegistro) {
                                                        if (yieldRegistro.classificacao === 'green') corBarraYield = '#27ae60';
                                                        if (yieldRegistro.classificacao === 'yellow') corBarraYield = '#f1c40f';
                                                        if (yieldRegistro.classificacao === 'red') corBarraYield = '#e74c3c';
                                                    }

                                                    return (
                                                        <div key={posto} 
                                                             title={posto} 
                                                             style={{ 
                                                                 flex: '1 1 0', // Permite o redimensionamento dinâmico sem quebrar
                                                                 minWidth: 0, 
                                                                 opacity: temTreino ? 1 : 0.4,
                                                                 cursor: temTreino ? 'pointer' : 'not-allowed'
                                                             }}
                                                             onClick={() => {
                                                                 if (temTreino && postoId) {
                                                                     setYieldModal({ opId: op.id, opNome: op.nome, postoId: postoId, postoNome: posto, produtoId: filtros.produtoId });
                                                                 } else if (!temTreino) {
                                                                     toast.error("Operador sem treinamento lançado nesta estação.");
                                                                 }
                                                             }}>
                                                            
                                                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                                
                                                                {/* 1. CAIXA DA ESTAÇÃO (Independente, igual ao protótipo HTML) */}
                                                                <div className={`badge-skill ${temTreino ? 'skill-trained' : 'skill-empty'}`} 
                                                                     style={{ 
                                                                         fontSize: '0.65em', 
                                                                         padding: '5px 2px', 
                                                                         borderRadius: '4px', // Bordas arredondadas completas restauradas
                                                                         border: temTreino ? '1px solid #1e8449' : '1px solid #ddd', 
                                                                         whiteSpace: 'nowrap', 
                                                                         overflow: 'hidden', 
                                                                         textOverflow: 'clip', 
                                                                         textAlign: 'center' 
                                                                     }}>
                                                                    {posto}
                                                                </div>
                                                                
                                                                {/* 2. CAIXA DO YIELD (Separada por margem, imitando o yield-dot original) */}
                                                                <div style={{ 
                                                                    height: '8px', 
                                                                    width: '100%', 
                                                                    backgroundColor: corBarraYield, 
                                                                    borderRadius: '2px', // Cantos levemente arredondados
                                                                    border: '1px solid #dee2e6',
                                                                    marginTop: '4px', // O espaço que separa o texto do yield!
                                                                    boxSizing: 'border-box'
                                                                }}></div>

                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ============================================================================
                MODAL PREMIUM DE AVALIAÇÃO DO YIELD OPERACIONAL
            ============================================================================ */}
            {yieldModal && (
                <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => { if(e.target.className.includes('modal-overlay')) setYieldModal(null) }}>
                    <div className="modal-box" style={{ width: '400px', padding: '30px', animation: 'fadeIn 0.2s', borderRadius: '12px' }}>
                        
                        <h3 style={{ marginTop: 0, color: '#2c3e50', fontSize: '1.4em', borderBottom: '2px solid #eee', paddingBottom: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>Qualidade / Yield</h3>
                        
                        <p style={{ fontSize: '0.95em', color: '#7f8c8d', lineHeight: '1.5', margin: '15px 0 25px 0' }}>
                            Defina o nível de performance e acurácia de <strong style={{ color: '#2980b9' }}>{yieldModal.opNome}</strong> na estação de trabalho <strong>{yieldModal.postoNome}</strong>:
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <button onClick={() => salvarYield('green')} style={{ background: '#27ae60', color: 'white', padding: '14px', fontSize: '1.05em', borderRadius: '8px', border: 'none', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'white' }}></div> Excelente (98% - 100%)
                            </button>
                            <button onClick={() => salvarYield('yellow')} style={{ background: '#f1c40f', color: '#2c3e50', padding: '14px', fontSize: '1.05em', borderRadius: '8px', border: 'none', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'white' }}></div> Atenção (95% - 97%)
                            </button>
                            <button onClick={() => salvarYield('red')} style={{ background: '#e74c3c', color: 'white', padding: '14px', fontSize: '1.05em', borderRadius: '8px', border: 'none', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'white' }}></div> Crítico (&lt; 95%)
                            </button>
                        </div>
                        
                        <button onClick={() => setYieldModal(null)} style={{ background: '#ecf0f1', color: '#555', marginTop: '20px', width: '100%', padding: '12px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                            Cancelar Avaliação
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}