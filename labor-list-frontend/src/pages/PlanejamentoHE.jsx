import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';

// ============================================================================
// CONFIGURAÇÃO DO WEBSOCKET E VARIÁVEIS GLOBAIS
// ============================================================================
const currentHost = window.location.hostname;
const socket = io(`http://${currentHost}:5008`);

const SETORES = { 
    'KITTING': ["ABASTECIMENTO", "Sushi 01", "Sushi 02", "GIRO"], 
    'ASSEMBLE': ["MA01", "MA02", "MA03", "MA04", "MA05", "MA06", "MA07", "MA08", "MA09", "MA10"], 
    'TESTE': ["MMFT", "RUNIN"], 
    'PACKING': ["PKG01", "PKG02", "PKG03", "PREKIT"] 
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function PlanejamentoHE() {
    const [db, setDb] = useState({ produtos: [], linhas: [], lideres: [], operadores: [], alocacoes: [], planejamentos: [] });
    const [form, setForm] = useState({ data: '', produtoId: '', linhaId: '' });

    const carregar = () => api.get('/carregar_tudo').then(res => setDb(res.data)).catch(() => toast.error("Erro ao carregar planejamento."));
    
    useEffect(() => { 
        carregar(); 
        socket.on('dados_atualizados', () => carregar());
        return () => socket.off('dados_atualizados');
    }, []);

    // Configuração dos Alertas Grandes
    const toastConfig = {
        position: 'top-center',
        duration: 4000,
        style: { fontSize: '1.3em', padding: '20px 30px', fontWeight: 'bold', textAlign: 'center', borderRadius: '12px', maxWidth: '600px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }
    };

    // ============================================================================
    // HANDLERS E REGRAS DE NEGÓCIO
    // ============================================================================

    const addPlano = async () => {
        if (!form.data || !form.produtoId || !form.linhaId) return toast.error("Preencha Data, Produto e Linha!", toastConfig);
        
        const prod = db.produtos.find(p => String(p.id) === String(form.produtoId))?.nome;
        const lin = db.linhas.find(l => String(l.id) === String(form.linhaId))?.nome;
        
        // REGRA DE SEGURANÇA 1: Não permite adicionar a mesma linha no mesmo dia
        const jaExiste = db.planejamentos.some(p => p.data === form.data && String(p.linha) === String(lin));
        if (jaExiste) return toast.error(`A linha ${lin} já possui um planejamento aberto para o dia ${form.data.split('-').reverse().join('/')}!`, toastConfig);

        const novo = { id: Date.now(), data: form.data, produto: prod, linha: lin, setores: {} };
        Object.keys(SETORES).forEach(s => novo.setores[s] = { lider: '', alocacoes: {}, trainMode: {} });
        
        const rows = [...db.planejamentos, novo];
        try {
            await api.post('/sync_planejamento', { rows });
            toast.success("✅ Plano de HE criado com sucesso!", toastConfig);
            // Mantém a data, mas limpa o produto e a linha para agilizar
            setForm({ ...form, produtoId: '', linhaId: '' }); 
        } catch (e) {
            toast.error("Erro ao sincronizar o plano.", toastConfig);
        }
    };

    const updatePlano = async (rowId, setor, campo, valor, posto = null) => {
        const rows = [...db.planejamentos];
        const r = rows.find(x => x.id === rowId);
        if (posto) r.setores[setor].alocacoes[posto] = valor;
        else r.setores[setor][campo] = valor;
        
        try {
            await api.post('/sync_planejamento', { rows });
        } catch (e) { toast.error("Erro ao salvar alocação do plano."); }
    };

    const toggleTrainMode = async (rowId, setor, posto, isChecked) => {
        const rows = [...db.planejamentos];
        const r = rows.find(x => x.id === rowId);
        if (!r.setores[setor].trainMode) r.setores[setor].trainMode = {};
        r.setores[setor].trainMode[posto] = isChecked;

        // Se desmarcou o "Modo Treinamento", verifica se a pessoa alocada é treinada. 
        // Se não for, ejeta a pessoa automaticamente para não gerar erro na fábrica.
        if (!isChecked && r.setores[setor].alocacoes[posto]) {
            const opName = r.setores[setor].alocacoes[posto];
            const opObj = db.operadores.find(o => o.nome === opName);
            if (opObj) {
                const isTrained = db.alocacoes.some(a => String(a.colaborador_id) === String(opObj.id) && a.produto === r.produto && a.posto === posto);
                if (!isTrained) delete r.setores[setor].alocacoes[posto];
            }
        }

        try {
            await api.post('/sync_planejamento', { rows });
        } catch (e) { toast.error("Erro ao salvar o modo de treinamento."); }
    };

    const removerPlano = async (planId) => {
        if (!window.confirm("⚠️ Tem certeza que deseja apagar permanentemente este plano de Hora Extra?")) return;
        const rows = db.planejamentos.filter(x => x.id !== planId);
        try {
            await api.post('/sync_planejamento', { rows });
            toast.success("🗑️ Plano removido.", toastConfig);
        } catch (e) { toast.error("Erro ao remover o plano."); }
    };

    // ============================================================================
    // GERAÇÃO DO ARQUIVO CSV DE PRESENÇA
    // ============================================================================
    const baixarListaHEConfirmada = () => {
        if (!form.data) return toast.error("Selecione a 'Data da HE' no filtro superior para baixar a lista de presença.", toastConfig);
        
        const confirmados = db.operadores.filter(op => (op.overtimeDates || []).some(h => h === form.data || h.data === form.data));
        if (confirmados.length === 0) return toast.error("Ninguém está confirmado para fazer Hora Extra nesta data.", toastConfig);
        
        let csv = "NOME;LIDER_FIXO;LINHA_FIXA;TURNO;DESJEJUM;REFEICAO;TRANSPORTE\n";
        confirmados.forEach(op => {
            const he = (op.overtimeDates || []).find(h => h === form.data || h.data === form.data);
            const des = he.desjejum || "N/A";
            const ref = he.refeicao || "N/A";
            const tra = he.transporte || "N/A";
            csv += `${op.nome};${op.nome_lider || 'Sem Líder'};${op.linha || ''};${op.turno || 'T1'};${des};${ref};${tra}\n`;
        });
        
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url;
        link.download = `Lista_Presenca_HE_${form.data}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    // ============================================================================
    // INTERFACE VISUAL (JSX)
    // ============================================================================
    return (
        <div className="page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '3px solid #f4f7fa', paddingBottom: '15px' }}>
                <h2 style={{ margin: 0, fontSize: '2em', fontWeight: 800, color: '#1e2b3c' }}>📅 Planejamento Antecipado de Hora Extra</h2>
            </div>

            {/* BARRA DE CRIAÇÃO (ESTILO ORIGINAL DO PROTÓTIPO) */}
            <div style={{ background: '#fcf3cf', padding: '20px', border: '2px solid #f1c40f', borderRadius: '12px', marginBottom: '25px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr auto auto', gap: '15px', alignItems: 'end', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #f1c40f' }}>
                    <div>
                        <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#34495e', display: 'block', marginBottom: '5px' }}>Data da HE:</label>
                        <input type="date" value={form.data} onChange={e => setForm({...form, data: e.target.value})} style={{ padding: '12px', fontSize: '1.05em', border: '1px solid #bdc3c7', borderRadius: '6px', width: '100%' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#34495e', display: 'block', marginBottom: '5px' }}>Produto em Foco:</label>
                        <select value={form.produtoId} onChange={e => setForm({...form, produtoId: e.target.value})} style={{ padding: '12px', fontSize: '1.05em', border: '1px solid #bdc3c7', borderRadius: '6px', width: '100%' }}>
                            <option value="">Selecione...</option>
                            {db.produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#34495e', display: 'block', marginBottom: '5px' }}>Linha Base:</label>
                        <select value={form.linhaId} onChange={e => setForm({...form, linhaId: e.target.value})} style={{ padding: '12px', fontSize: '1.05em', border: '1px solid #bdc3c7', borderRadius: '6px', width: '100%' }}>
                            <option value="">Selecione...</option>
                            {db.linhas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                        </select>
                    </div>
                    <button onClick={addPlano} style={{ background: '#27ae60', color: 'white', padding: '12px 25px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.05em', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.3)', width: 'auto' }}>
                        + Adicionar Linha
                    </button>
                    <button onClick={baixarListaHEConfirmada} style={{ background: '#f39c12', color: 'white', padding: '12px 25px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.05em', boxShadow: '0 4px 10px rgba(243, 156, 18, 0.3)', width: 'auto' }}>
                        📥 Baixar Lista Presença HE
                    </button>
                </div>
            </div>

            {/* LISTAGEM DOS PLANOS CRIADOS */}
            {db.planejamentos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d', background: '#f8f9fa', borderRadius: '12px', border: '1px dashed #bdc3c7', fontSize: '1.1em' }}>
                    Nenhum planejamento criado ainda. Defina a Data, Produto e Linha acima e clique em "Adicionar Linha".
                </div>
            ) : (
                db.planejamentos.map(plan => {
                    
                    // REGRA DE SEGURANÇA 2: Descobre todo mundo que já foi alocado neste DIA específico (cross-linhas)
                    let globalAlocados = [];
                    db.planejamentos.filter(r => r.data === plan.data).forEach(r => { 
                        Object.values(r.setores).forEach(setorObj => {
                            Object.values(setorObj.alocacoes).forEach(opName => {
                                if(opName) globalAlocados.push(opName);
                            });
                        }); 
                    });

                    return (
                        <div key={plan.id} style={{ background: 'white', border: '1px solid #f1c40f', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                            
                            {/* CABEÇALHO DO PLANO */}
                            <div style={{ background: '#f1c40f', color: '#2c3e50', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '800', borderBottom: '2px solid #d4ac0d' }}>
                                <div style={{ fontSize: '1.1em' }}>
                                    PLANO: 
                                    <span style={{ background: '#2c3e50', color: '#fff', padding: '4px 10px', borderRadius: '4px', margin: '0 10px' }}>{plan.produto}</span>
                                    <span style={{ background: '#2c3e50', color: '#fff', padding: '4px 10px', borderRadius: '4px', marginRight: '10px' }}>{plan.linha}</span>
                                    <small style={{ fontWeight: 'normal', color: '#555' }}>({plan.data.split('-').reverse().join('/')})</small>
                                </div>
                                <button onClick={() => removerPlano(plan.id)} style={{ background: '#e74c3c', color: 'white', padding: '8px 15px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9em' }}>
                                    Remover Plano
                                </button>
                            </div>
                            
                            {/* CORPO DO PLANO (SETORES) */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', padding: '20px' }}>
                                {Object.entries(SETORES).map(([setor, postos]) => (
                                    
                                    <div key={setor} style={{ background: '#fdfdfd', padding: '15px', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: 'inset 0 0 5px rgba(0,0,0,0.02)' }}>
                                        <h5 style={{ margin: '0 0 12px 0', color: '#2c3e50', textTransform: 'uppercase', fontSize: '1em', textAlign: 'center', borderBottom: '2px solid #f1c40f', paddingBottom: '8px' }}>
                                            {setor}
                                        </h5>
                                        
                                        {/* Seleção do Líder do Setor */}
                                        <div style={{ marginBottom: '15px', background: '#f1f4f7', padding: '10px', borderRadius: '6px' }}>
                                            <label style={{ fontSize: '0.75em', fontWeight: '900', color: '#7f8c8d', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Líder do Setor:</label>
                                            <select style={{ width: '100%', padding: '8px', fontSize: '1em', borderRadius: '4px', border: '1px solid #bdc3c7' }} value={plan.setores[setor]?.lider || ''} onChange={e => updatePlano(plan.id, setor, 'lider', e.target.value)}>
                                                <option value="">Selecione...</option>
                                                {db.lideres.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                                            </select>
                                        </div>
                                        
                                        {/* Renderiza as estações (postos) do Setor */}
                                        {postos.map(posto => {
                                            const isTrainMode = plan.setores[setor]?.trainMode?.[posto] || false;
                                            const selectedOpName = plan.setores[setor]?.alocacoes[posto] || "";

                                            // Filtra todos os operadores que podem assumir esta posição
                                            const opsElegiveis = db.operadores.filter(op => {
                                                // O operador confirmou HE nesse dia exato?
                                                const confirmouHE = (op.overtimeDates || []).some(he => he === plan.data || he.data === plan.data);
                                                
                                                // Bloqueio de Segurança: Ele já não está alocado em outra máquina ou setor hoje?
                                                // Ele só fica disponível se não estiver na lista global, OU se a vaga atual já for dele.
                                                const disponivel = !globalAlocados.includes(op.nome) || selectedOpName === op.nome;
                                                
                                                if (!confirmouHE || !disponivel) return false;
                                                
                                                // Verifica se é treinado no sistema
                                                const treinado = db.alocacoes.some(a => String(a.colaborador_id) === String(op.id) && a.produto === plan.produto && a.posto === posto);
                                                
                                                // Se "Treinamento" estiver marcado, libera todo mundo. Se não, só quem é treinado.
                                                return isTrainMode ? true : treinado;
                                            });

                                            // Cores inteligentes baseadas no Status do Selecionado (Igual ao HTML Original)
                                            let isYellow = false;
                                            let isGreen = false;

                                            if (selectedOpName !== "") {
                                                const opObj = db.operadores.find(o => o.nome === selectedOpName);
                                                if (opObj) {
                                                    const isSelectedTrained = db.alocacoes.some(a => String(a.colaborador_id) === String(opObj.id) && a.produto === plan.produto && a.posto === posto);
                                                    if (!isSelectedTrained) isYellow = true;
                                                    else isGreen = true;
                                                }
                                            }

                                            // Estilos Condicionais para a Seleção (Select)
                                            let selectStyle = { width: '100%', padding: '8px', fontSize: '1em', borderRadius: '4px', border: '1px solid #bdc3c7', background: '#fff', color: '#333' };
                                            if (isYellow) selectStyle = { ...selectStyle, background: '#f1c40f', color: '#2c3e50', fontWeight: 'bold' };
                                            if (isGreen) selectStyle = { ...selectStyle, background: '#27ae60', color: 'white', fontWeight: 'bold' };

                                            return (
                                                <div key={posto} style={{ marginBottom: '12px' }}>
                                                    
                                                    {/* Layout do Título do Posto e Botão de Treinamento idênticos ao protótipo */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                        <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#34495e', margin: 0 }}>{posto}</label>
                                                        
                                                        <label style={{ fontSize: '0.7em', fontWeight: 'bold', color: '#d35400', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                                                            <input type="checkbox" checked={isTrainMode} onChange={e => toggleTrainMode(plan.id, setor, posto, e.target.checked)} style={{ width: 'auto', margin: 0, padding: 0 }} /> 
                                                            Treinamento
                                                        </label>
                                                    </div>
                                                    
                                                    <select style={selectStyle} value={selectedOpName} onChange={e => updatePlano(plan.id, setor, null, e.target.value, posto)}>
                                                        <option value="" style={{ background: '#fff', color: '#333' }}>-- Vago --</option>
                                                        
                                                        {opsElegiveis.map(op => {
                                                            // Verifica se é treinado para botar o chapeuzinho
                                                            const isOpTrained = db.alocacoes.some(a => String(a.colaborador_id) === String(op.id) && a.produto === plan.produto && a.posto === posto);
                                                            const tagStatus = isOpTrained ? '' : ' 🎓';
                                                            
                                                            // Mostra Transporte e/ou Refeição para o líder saber a logística visualmente
                                                            const infoHE = (op.overtimeDates || []).find(he => he === plan.data || he.data === plan.data);
                                                            const logistica = (infoHE?.transporte === 'SIM' || infoHE?.refeicao === 'SIM' || infoHE?.desjejum === 'SIM') ? ' 🍽️/🚌' : '';

                                                            return (
                                                                <option key={op.id} value={op.nome} style={{ background: '#fff', color: '#333' }}>
                                                                    {op.nome}{tagStatus}{logistica}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}