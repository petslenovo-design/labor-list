import React, { useEffect, useState } from 'react';
import api from '../services/api';

const ESTACOES = [
    "ABASTECIMENTO", "Sushi 01", "Sushi 02", "GIRO", 
    "MA01", "MA02", "MA03", "MA04", "MA05", "MA06", "MA07", "MA08", "MA09", "MA10", 
    "MMFT", "RUNIN", 
    "PKG01", "PKG02", "PKG03", "PREKIT", "REPARO"
];
const LINHAS = ["L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08", "L09", "L10", "Célula Híbrida"];

export default function Heatmap() {
    const [db, setDb] = useState({ produtos: [], operadores: [], alocacoes: [], produto_yield: [], colaborador_yield: [] });
    const [prodId, setProdId] = useState('');
    const [turno, setTurno] = useState('');

    useEffect(() => { 
        api.get('/carregar_tudo').then(res => setDb(res.data)).catch(console.error); 
    }, []);

    const produto = db.produtos.find(p => String(p.id) === String(prodId));

    // Define a classe CSS baseada na métrica de Yield (Igual ao App.css original)
    const getYieldCor = (val) => val < 95 ? "yield-red-border" : (val < 98 ? "yield-yellow-border" : "yield-green-border");

    return (
        <div className="page">
            <h2 className="page-title">🔥 Mapa de Calor Operacional (Heatmap)</h2>
            
            <div className="heatmap-section" style={{ background: '#f8f9fa', padding: '20px', border: '2px solid #34495e', borderRadius: '8px', marginBottom: '25px' }}>
                
                {/* FILTROS SUPERIORES */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                    <select value={prodId} onChange={e => setProdId(e.target.value)} style={{ padding: '12px', fontSize: '1em', borderRadius: '6px', border: '1px solid #ced4da', background: '#fff', fontWeight: 'bold', color: '#2c3e50' }}>
                        <option value="">-- Selecione o Produto Base --</option>
                        {db.produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                    
                    <select value={turno} onChange={e => setTurno(e.target.value)} style={{ padding: '12px', fontSize: '1em', borderRadius: '6px', border: '1px solid #ced4da', background: '#fff' }}>
                        <option value="">Todos os Turnos</option>
                        <option value="T1">Turno 1</option>
                        <option value="T2">Turno 2</option>
                    </select>
                </div>

                {!produto ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '1.1em' }}>
                        ☝️ Selecione um produto acima para carregar as métricas de qualidade (Yield) e disponibilidade operacional.
                    </div>
                ) : (
                    <>
                        {/* ============================================================================
                            YIELD SISTÊMICO GERAL (LINHA ÚNICA ADAPTÁVEL)
                        ============================================================================ */}
                        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '1.2em' }}>Análise de Yield Sistêmico: <span style={{color: '#3498db'}}>{produto.nome}</span></h4>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', flexWrap: 'nowrap', width: '100%' }}>
                                {ESTACOES.map(e => {
                                    const y = db.produto_yield.find(py => py.produto_nome === produto.nome && py.posto_nome === e)?.yield_value || 100;
                                    
                                    return (
                                        <div key={e} 
                                             title={`Estação: ${e} | Yield Atual: ${y}%`}
                                             className={`badge-skill ${getYieldCor(y)}`} 
                                             style={{ 
                                                 flex: '1 1 0', 
                                                 minWidth: 0, 
                                                 background: 'white', 
                                                 color: '#333', 
                                                 padding: '8px 2px', 
                                                 borderRadius: '6px',
                                                 textAlign: 'center',
                                                 display: 'flex',
                                                 flexDirection: 'column',
                                                 justifyContent: 'center',
                                                 boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                                             }}>
                                            
                                            <div style={{ fontSize: '0.65em', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', marginBottom: '4px' }}>
                                                {e}
                                            </div>
                                            <div style={{ fontSize: '1em', fontWeight: '900' }}>
                                                {y}%
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ============================================================================
                            DISPONIBILIDADE POR LINHAS (LINHAS ÚNICAS ADAPTÁVEIS)
                        ============================================================================ */}
                        <div>
                            <h3 style={{ margin: '0 0 5px 0', color: '#2c3e50', fontSize: '1.4em' }}>📍 Linhas Treinadas</h3>
                            <p style={{ fontSize: '0.9em', color: '#7f8c8d', margin: '0 0 20px 0' }}>Visualização sistêmica de operadores aptos alocados em cada linha. Exibindo o maior Yield disponível.</p>
                            
                            {LINHAS.map(linha => {
                                
                                // Filtra quem está disponível nesta linha e turno específico
                                const opsDisponiveis = db.operadores.filter(op => {
                                    const matchTurno = turno === "" || (op.turno || 'T1') === turno;
                                    const arrLinhas = Array.isArray(op.linhas_vinculadas) ? op.linhas_vinculadas : [];
                                    const matchLinha = op.linha === linha || arrLinhas.includes(linha);
                                    const apto = !['Férias', 'Absenteísmo', 'Afastamento / Licença'].includes(op.status_especial);
                                    
                                    return matchTurno && matchLinha && apto;
                                });

                                // Se não tem ninguém disponível nesta linha, podemos até ocultar ou renderizar vazio.
                                // Mantivemos o render para consistência visual do layout da fábrica.
                                
                                return (
                                    <div key={linha} style={{ marginBottom: '15px', padding: '15px', background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                        
                                        <h5 style={{ margin: '0 0 12px 0', color: '#2980b9', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {linha} 
                                            <span style={{ fontSize: '0.7em', color: '#fff', background: '#95a5a6', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                                                {opsDisponiveis.length} Disp.
                                            </span>
                                        </h5>
                                        
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', flexWrap: 'nowrap', width: '100%' }}>
                                            {ESTACOES.map(est => {
                                                
                                                // Verifica quais dos operadores disponíveis são treinados neste posto para este produto
                                                const treinadosNaEstacao = opsDisponiveis.filter(op => 
                                                    db.alocacoes.some(a => String(a.colaborador_id) === String(op.id) && a.produto === produto.nome && a.posto === est)
                                                );

                                                if (treinadosNaEstacao.length === 0) {
                                                    return (
                                                        <div key={est} 
                                                             className="badge-skill" 
                                                             style={{ 
                                                                 flex: '1 1 0', 
                                                                 minWidth: 0, 
                                                                 background: '#f8f9fa', 
                                                                 color: '#bdc3c7', 
                                                                 border: '1px dashed #ccc',
                                                                 padding: '6px 2px',
                                                                 borderRadius: '6px',
                                                                 textAlign: 'center',
                                                                 display: 'flex',
                                                                 flexDirection: 'column',
                                                                 justifyContent: 'center'
                                                             }}>
                                                            <div style={{ fontSize: '0.6em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', marginBottom: '4px' }}>{est}</div>
                                                            <div style={{ fontSize: '0.7em', fontWeight: 'bold' }}>S/ TREINO</div>
                                                        </div>
                                                    );
                                                } else {
                                                    let bestYield = 0;
                                                    let infoTooltip = [];

                                                    treinadosNaEstacao.forEach(op => {
                                                        const indYield = db.colaborador_yield.find(y => String(y.colaborador_id) === String(op.id) && y.produto_nome === produto.nome && y.posto_nome === est);
                                                        
                                                        let val = 100; // Verde (Padrão se treinado mas não avaliado manualmente)
                                                        if (indYield?.classificacao === 'yellow') val = 96;
                                                        if (indYield?.classificacao === 'red') val = 90;
                                                        
                                                        if (val > bestYield) bestYield = val;
                                                        infoTooltip.push(`• ${op.nome} (${val}%)`);
                                                    });

                                                    return (
                                                        <div key={est} 
                                                             className={`badge-skill ${getYieldCor(bestYield)}`} 
                                                             style={{ 
                                                                 flex: '1 1 0', 
                                                                 minWidth: 0, 
                                                                 background: 'white', 
                                                                 color: '#333', 
                                                                 cursor: 'help',
                                                                 padding: '6px 2px',
                                                                 borderRadius: '6px',
                                                                 textAlign: 'center',
                                                                 display: 'flex',
                                                                 flexDirection: 'column',
                                                                 justifyContent: 'center',
                                                                 boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                             }} 
                                                             title={`Operadores Aptos (${treinadosNaEstacao.length}):\n${infoTooltip.join('\n')}`}>
                                                            
                                                            <div style={{ fontSize: '0.65em', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', marginBottom: '2px' }}>{est}</div>
                                                            <div style={{ fontSize: '0.9em', fontWeight: '900' }}>{bestYield}%</div>
                                                        </div>
                                                    );
                                                }
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}