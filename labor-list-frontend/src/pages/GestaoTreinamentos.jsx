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

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function GestaoTreinamentos() {
    
    // Estado principal que guarda as listas vindas do Banco de Dados
    const [db, setDb] = useState({ operadores: [], produtos: [], postos: [], alocacoes: [] });
    
    // Estado do formulário de seleção (Alvo do Treinamento)
    const [form, setForm] = useState({ operadorId: '', produtoId: '' });
    
    // Estado para guardar os postos que o líder seleciona na grade (vários cliques)
    const [postosSelecionados, setPostosSelecionados] = useState([]);

    /**
     * Busca os dados atualizados da API.
     */
    const carregarDados = () => {
        api.get('/carregar_tudo')
           .then(res => setDb(res.data))
           .catch(err => console.error("Erro ao carregar dados:", err));
    };

    // Inicializa a tela e o "escutador" do Socket para manter a Auditoria ao vivo
    useEffect(() => { 
        carregarDados(); 
        socket.on('dados_atualizados', () => carregarDados());
        return () => socket.off('dados_atualizados');
    }, []);

    // ============================================================================
    // CONFIGURAÇÃO DE ALERTAS (MENSAGENS GIGANTES E CENTRALIZADAS)
    // ============================================================================
    const toastConfig = {
        position: 'top-center',
        duration: 4000,
        style: {
            fontSize: '1.3em', 
            padding: '20px 30px',
            fontWeight: 'bold',
            textAlign: 'center',
            borderRadius: '12px',
            maxWidth: '600px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
        }
    };

    // ============================================================================
    // LÓGICA DE PREVENÇÃO (BLOQUEIO SE JÁ ESTIVER TREINADO)
    // ============================================================================
    
    // Varre o banco para descobrir quais postos o Operador JÁ POSSUI no Produto escolhido
    const postosJaTreinados = db.alocacoes
        .filter(a => String(a.colaborador_id) === String(form.operadorId) && String(a.produto_id) === String(form.produtoId))
        .map(a => a.posto_id);

    /**
     * Alterna a seleção de um posto. Se ele já for treinado, bloqueia a ação.
     */
    const togglePosto = (id) => {
        if (postosJaTreinados.includes(id)) {
            toast.error("Este operador já foi treinado nesta estação!", toastConfig);
            return;
        }

        setPostosSelecionados(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    // ============================================================================
    // HANDLERS DE AÇÃO DE BANCO DE DADOS
    // ============================================================================

    /**
     * Envia as matrizes de treinamento selecionadas para o servidor.
     */
    const lancarTreinamentos = async () => {
        if (!form.operadorId || !form.produtoId || postosSelecionados.length === 0) {
            return toast.error("Selecione o Operador, o Produto e pelo menos UMA Estação!", toastConfig);
        }
        
        const op = db.operadores.find(o => String(o.id) === String(form.operadorId));
        
        try {
            await api.post('/salvar_alocacao_multipla', {
                colaborador_id: form.operadorId,
                produto_id: form.produtoId,
                postos_ids: postosSelecionados,
                turno: op?.turno || 'T1'
            });

            toast.success("✅ Treinamentos Salvos com Sucesso!", toastConfig);
            
            // Limpa as seleções após o sucesso
            setPostosSelecionados([]); 
            carregarDados();
        } catch (e) {
            toast.error("❌ Erro ao salvar treinamentos.", toastConfig);
        }
    };

    /**
     * Exclui um treinamento pelo painel de Auditoria à direita
     */
    const excluirTreinamentoAuditoria = async (idAlocacao) => {
        if (!window.confirm("⚠️ ATENÇÃO: Deseja apagar este treinamento permanentemente?")) return;
        
        try {
            await api.post('/excluir_alocacao', { id: idAlocacao });
            toast.success("🗑️ Treinamento removido da matriz!", toastConfig);
            carregarDados(); 
        } catch (e) {
            toast.error("Erro ao remover o treinamento.", toastConfig);
        }
    };

    // ============================================================================
    // DADOS DO HISTÓRICO (AUDITORIA FOCADA)
    // ============================================================================
    
    // Regra nova: Se nenhum operador foi selecionado, a matriz de histórico fica VAZIA.
    // Só carrega a auditoria da pessoa específica quando selecionada.
    const historicoAuditoria = form.operadorId 
        ? db.alocacoes
            .filter(a => String(a.colaborador_id) === String(form.operadorId))
            .slice()
            .reverse() 
        : [];

    // ============================================================================
    // RENDERIZAÇÃO DA INTERFACE (JSX)
    // ============================================================================
    return (
        <div className="page">
            <h2 className="page-title">🎓 Gestão de Treinamentos</h2>

            <div className="management-layout">
                
                {/* =====================================================================
                    COLUNA 1 (ESQUERDA): LANÇAMENTO DE TREINAMENTOS (Formulário)
                ===================================================================== */}
                <div className="management-box">
                    
                    <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '1.2em' }}>1. Alvo do Treinamento</h3>
                    
                    <div className="grid-inputs" style={{ marginBottom: '25px' }}>
                        <div>
                            <label style={{ fontWeight: 'bold', fontSize: '0.9em', color: '#34495e', display: 'block', marginBottom: '5px' }}>Operador:</label>
                            <select value={form.operadorId} onChange={e => { setForm({...form, operadorId: e.target.value}); setPostosSelecionados([]); }}>
                                <option value="">Selecione...</option>
                                {db.operadores.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontWeight: 'bold', fontSize: '0.9em', color: '#34495e', display: 'block', marginBottom: '5px' }}>Produto Base:</label>
                            <select value={form.produtoId} onChange={e => { setForm({...form, produtoId: e.target.value}); setPostosSelecionados([]); }}>
                                <option value="">Selecione...</option>
                                {db.produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                        </div>
                    </div>

                    <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '1.2em' }}>2. Postos de Trabalho (Selecione um ou vários)</h3>
                    
                    {/* GRADE DE SELEÇÃO DE POSTOS (Barra de rolagem removida com maxHeight: 'none') */}
                    <div className="posto-selection-grid" style={{ 
                        marginBottom: '20px', 
                        maxHeight: 'none', // Sobrescreve o App.css para mostrar todos os itens
                        overflowY: 'visible' 
                    }}>
                        
                        {db.postos.map(posto => {
                            const isTrained = postosJaTreinados.includes(posto.id);
                            const isSelected = postosSelecionados.includes(posto.id);

                            let bgColor = '#f8f9fa';
                            let textColor = '#333';
                            let borderColor = '#dee2e6';
                            let cursorStyle = 'pointer';

                            if (isTrained) {
                                bgColor = '#e8f8f5';
                                textColor = '#27ae60';
                                borderColor = '#27ae60';
                                cursorStyle = 'not-allowed';
                            } else if (isSelected) {
                                bgColor = '#3498db';
                                textColor = '#fff';
                                borderColor = '#2980b9';
                            }

                            return (
                                <div key={posto.id} 
                                     onClick={() => togglePosto(posto.id)}
                                     style={{
                                         background: bgColor, 
                                         color: textColor, 
                                         border: `2px solid ${borderColor}`,
                                         padding: '12px 5px', 
                                         borderRadius: '6px', 
                                         textAlign: 'center',
                                         cursor: cursorStyle, 
                                         transition: '0.2s',
                                         boxShadow: isSelected ? '0 4px 8px rgba(52, 152, 219, 0.3)' : 'none',
                                         transform: isSelected ? 'translateY(-2px)' : 'none'
                                     }}>
                                    
                                    <div style={{ fontSize: '0.9em', fontWeight: 'bold' }}>{posto.nome}</div>
                                    
                                    {isTrained && <div style={{ fontSize: '0.7em', marginTop: '5px', fontWeight: 'bold' }}>✅ Já Treinado</div>}
                                    {!isTrained && isSelected && <div style={{ fontSize: '0.7em', marginTop: '5px', fontWeight: 'bold' }}>📌 Selecionado</div>}
                                    {!isTrained && !isSelected && <div style={{ fontSize: '0.7em', marginTop: '5px', color: '#95a5a6' }}>Pendente</div>}
                                </div>
                            )
                        })}
                    </div>

                    <button className="btn-success" onClick={lancarTreinamentos} style={{ width: '100%', padding: '15px', fontSize: '1.1em', borderRadius: '8px' }}>
                        ✔ Confirmar e Salvar Treinamentos
                    </button>

                </div>

                {/* =====================================================================
                    COLUNA 2 (DIREITA): AUDITORIA E HISTÓRICO
                ===================================================================== */}
                <div className="management-box" style={{ display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <h3 style={{ margin: '0', color: '#2c3e50', fontSize: '1.2em' }}>📋 Histórico do Operador</h3>
                    </div>
                    
                    <p style={{ fontSize: '0.85em', color: '#7f8c8d', marginBottom: '15px', lineHeight: '1.4' }}>
                        {form.operadorId 
                            ? <strong style={{color: '#f39c12', display:'block'}}>Mostrando apenas lançamentos da pessoa selecionada.</strong> 
                            : <strong style={{color: '#e74c3c', display:'block'}}>Selecione um operador no menu ao lado.</strong>
                        }
                    </p>
                    
                    {/* LISTA DE AUDITORIA */}
                    <div style={{ flex: 1, overflowY: 'auto', background: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '10px' }}>
                        
                        {historicoAuditoria.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#95a5a6', fontSize: '0.9em' }}>
                                {!form.operadorId 
                                    ? 'Aguardando seleção do operador...' 
                                    : 'Nenhum lançamento recente encontrado para este operador.'}
                            </div>
                        ) : (
                            historicoAuditoria.map((aloc) => (
                                <div key={aloc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', padding: '10px 5px' }}>
                                    
                                    <div style={{ fontSize: '0.85em', lineHeight: '1.4' }}>
                                        <b style={{ color: '#2c3e50', fontSize: '1.1em' }}>{aloc.operador}</b><br/>
                                        <span style={{ color: '#3498db', fontWeight: 'bold' }}>{aloc.produto}</span> 
                                        <span style={{ margin: '0 5px', color: '#7f8c8d' }}>&rarr;</span> 
                                        <span style={{ color: '#27ae60', fontWeight: 'bold' }}>{aloc.posto}</span><br/>
                                        <small style={{ color: '#95a5a6' }}>Turno: {aloc.turno}</small>
                                    </div>

                                    <button 
                                        onClick={() => excluirTreinamentoAuditoria(aloc.id)}
                                        style={{ background: '#e74c3c', color: 'white', padding: '6px 10px', fontSize: '0.75em', borderRadius: '4px', border: 'none', cursor: 'pointer', height: 'fit-content' }}>
                                        Excluir
                                    </button>
                                
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}