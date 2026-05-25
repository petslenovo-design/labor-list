import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Configuracoes() {
    const { user } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState('');
    const [db, setDb] = useState({ produtos: [], lideres: [], linhas: [], operadores: [] });

    // Formulários
    const [novoProduto, setNovoProduto] = useState('');
    const [remProdutoId, setRemProdutoId] = useState('');

    const [novoAuth, setNovoAuth] = useState({ nome: '', login_ldap: '', perfil: 'LIDER' });
    const [remAuthId, setRemAuthId] = useState('');

    const [opForm, setOpForm] = useState({ nome: '', linha_id: '', vinculo: 'Efetivo', turno: 'T1', lider_id: '' });

    // Transferência / Edição
    const [transferModal, setTransferModal] = useState({
        visivel: false,
        operadorId: null,
        operadorNome: '',
        novoLiderId: '',
        novoTurno: '',
        novaLinhaId: '',
        novoVinculo: ''   // NOVO campo para vínculo
    });

    // Exclusão de Líder
    const [remLiderId, setRemLiderId] = useState('');
    const [showModalLider, setShowModalLider] = useState(false);

    // MODAL DE SELEÇÃO GENÉRICO
    const [selecaoModal, setSelecaoModal] = useState({
        visivel: false,
        titulo: '',
        lista: [],
        acaoConfirmar: null,
        campoBusca: 'nome',
        mensagemConfirmacao: null
    });

    // MODAL DE CONFIRMAÇÃO GENÉRICO
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null, onCancel: null });

    const carregarDados = () => {
        api.get('/carregar_tudo').then(res => setDb(res.data)).catch(() => toast.error("Erro ao carregar dados"));
    };

    useEffect(() => {
        carregarDados();
        if (user.perfil === 'MASTER') setActiveTab('eng');
        else if (user.perfil === 'SUPERVISAO') setActiveTab('sup');
        else setActiveTab('lider');
    }, [user]);

    const handleAction = async (action, data, clearFunc) => {
        try {
            await api.post(`/${action}`, data);
            toast.success('Ação realizada com sucesso!');
            carregarDados();
            if (clearFunc) clearFunc();
        } catch (e) {
            toast.error(e.response?.data?.erro || "Erro na operação");
        }
    };

    const showConfirm = (message, onConfirm, onCancel = null) => {
        setConfirmModal({ isOpen: true, message, onConfirm, onCancel });
    };

    const abrirSelecao = (titulo, lista, aoSelecionar, mensagemConfirmacao = null) => {
        setSelecaoModal({
            visivel: true,
            titulo,
            lista,
            acaoConfirmar: aoSelecionar,
            campoBusca: 'nome',
            mensagemConfirmacao,
            busca: ''
        });
    };

    // Lógica do Líder
    const meuLiderId = user.colaborador_id;
    const operadoresVisiveis = db.operadores.filter(op => user.perfil !== 'LIDER' || String(op.lider_id) === String(meuLiderId));
    const opsAfetadosLider = db.operadores.filter(op => String(op.lider_id) === String(remLiderId));

    // Operadores que NÃO são líderes (para promover)
    const operadoresNaoLideres = db.operadores.filter(op => op.cargo !== 'Líder');

    // Ações específicas
    const aoExcluirOperador = (operador) => {
        showConfirm(
            `🚨 ATENÇÃO: Você está prestes a excluir permanentemente o operador "${operador.nome}".\n\nTodo o histórico de treinamentos, faltas e horas extras será perdido. Esta ação é irreversível.\n\nConfirma a exclusão?`,
            async () => {
                await handleAction('excluir_colaborador', { id: operador.id }, () => {});
            }
        );
        setSelecaoModal({ ...selecaoModal, visivel: false });
    };

    const aoPromoverOperador = (operador, loginLdap) => {
        showConfirm(
            `⭐ Confirmar promoção de "${operador.nome}" para Líder?\n\nSerá criado acesso LDAP com login: ${loginLdap}\nO operador passará a ter cargo de Líder e poderá gerenciar sua própria equipe.`,
            async () => {
                await handleAction('salvar_colaborador', { id: operador.id, cargo: 'Líder', nome: operador.nome, vinculo: operador.vinculo, turno: operador.turno }, null);
                await handleAction('salvar_usuario_acesso', { nome: operador.nome, login_ldap: loginLdap, perfil: 'LIDER' }, null);
                toast.success(`Operador ${operador.nome} agora é Líder!`);
                carregarDados();
            }
        );
        setSelecaoModal({ ...selecaoModal, visivel: false });
    };

const aoSelecionarTransferir = (operador) => {
    setTransferModal({
        visivel: true,
        operadorId: operador.id,
        operadorNome: operador.nome,
        novoLiderId: operador.lider_id || '',
        novoTurno: operador.turno || '',
        novaLinhaId: operador.linha_principal_id || '',  
        novoVinculo: operador.vinculo || ''
    });
    setSelecaoModal({ ...selecaoModal, visivel: false });
};

    const confirmarTransferencia = () => {
        const { operadorId, novoLiderId, novoTurno, novaLinhaId, novoVinculo } = transferModal;
        if (!operadorId || !novoLiderId || !novoTurno || !novaLinhaId || !novoVinculo) {
            toast.error("Preencha todos os campos da transferência, incluindo o vínculo!");
            return;
        }
        showConfirm(
            `🔄 Confirmar transferência/edição do operador "${transferModal.operadorNome}"?`,
            async () => {
                await handleAction('transferir_operador', {
                    colaborador_id: operadorId,
                    novo_lider_id: novoLiderId,
                    novo_turno: novoTurno,
                    nova_linha_id: novaLinhaId,
                    novo_vinculo: novoVinculo   // envia o novo vínculo
                }, () => {
                    setTransferModal({
                        visivel: false,
                        operadorId: null,
                        operadorNome: '',
                        novoLiderId: '',
                        novoTurno: '',
                        novaLinhaId: '',
                        novoVinculo: ''
                    });
                });
            }
        );
    };

    return (
        <div className="page">
            <h2 className="page-title">⚙️ Configurações e Cadastros</h2>

            <div className="internal-tabs">
                {user.perfil === 'MASTER' && <button className={`internal-tab-btn ${activeTab === 'eng' ? 'active' : ''}`} onClick={() => setActiveTab('eng')}>⚙️ Engenharia</button>}
                {(user.perfil === 'MASTER' || user.perfil === 'SUPERVISAO') && <button className={`internal-tab-btn ${activeTab === 'sup' ? 'active' : ''}`} onClick={() => setActiveTab('sup')}>🛡️ Gestão de Acessos</button>}
                <button className={`internal-tab-btn ${activeTab === 'lider' ? 'active' : ''}`} onClick={() => setActiveTab('lider')}>👨‍✈️ Equipe (Produção)</button>
            </div>

            {/* --- ABA: ENGENHARIA --- */}
            {activeTab === 'eng' && (
                <div className="setup-box-full" style={{ borderLeft: '4px solid #8e44ad' }}>
                    <h4>📦 Cadastro de Produtos</h4>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                        <input type="text" placeholder="Nome do Produto (Ex: ThinkPad L14)" value={novoProduto} onChange={e => setNovoProduto(e.target.value)} />
                        <button style={{ width: 'auto' }} onClick={() => handleAction('salvar_produto', { nome: novoProduto }, () => setNovoProduto(''))}>+ Salvar Produto</button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', borderTop: '1px dashed #ddd', paddingTop: '15px' }}>
                        <select value={remProdutoId} onChange={e => setRemProdutoId(e.target.value)}>
                            <option value="">Remover Produto Existente...</option>
                            {db.produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                        <button style={{ background: '#e74c3c', width: 'auto' }} onClick={() => handleAction('excluir_produto', { id: remProdutoId }, () => setRemProdutoId(''))}>Excluir Produto</button>
                    </div>
                </div>
            )}

            {/* --- ABA: SUPERVISÃO (LDAP) --- */}
            {activeTab === 'sup' && (
                <div className="setup-box-full" style={{ borderLeft: '4px solid #3498db' }}>
                    <h4>👨‍✈️ Conceder Acesso ao Sistema (LDAP)</h4>
                    <p style={{ fontSize: '0.8em', color: '#7f8c8d' }}>A senha é validada automaticamente pela rede da Lenovo. Informe apenas o login do usuário.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', marginBottom: '15px' }}>
                        <input type="text" placeholder="Nome Completo" value={novoAuth.nome} onChange={e => setNovoAuth({ ...novoAuth, nome: e.target.value })} />
                        <input type="text" placeholder="Login LDAP (Ex: ofaccioli)" value={novoAuth.login_ldap} onChange={e => setNovoAuth({ ...novoAuth, login_ldap: e.target.value })} />
                        <select value={novoAuth.perfil} onChange={e => setNovoAuth({ ...novoAuth, perfil: e.target.value })}>
                            <option value="LIDER">Líder de Linha</option>
                            {user.perfil === 'MASTER' && <option value="SUPERVISAO">Supervisor</option>}
                        </select>
                        <button onClick={() => handleAction('salvar_usuario_acesso', novoAuth, () => setNovoAuth({ nome: '', login_ldap: '', perfil: 'LIDER' }))}>+ Conceder Acesso</button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', borderTop: '1px dashed #ddd', paddingTop: '15px' }}>
                        <input type="text" placeholder="Digite o Login LDAP para remover acesso..." value={remAuthId} onChange={e => setRemAuthId(e.target.value)} />
                        <button style={{ background: '#e74c3c', width: 'auto' }} onClick={() => handleAction('excluir_usuario_acesso', { login_ldap: remAuthId }, () => setRemAuthId(''))}>Revogar Acesso</button>
                    </div>
                </div>
            )}

            {/* --- ABA: LÍDER / PRODUÇÃO --- */}
            {activeTab === 'lider' && (
                <>
                    {/* Cadastrar Operador */}
                    <div className="setup-box-full" style={{ borderLeft: '4px solid #27ae60' }}>
                        <h4>👤 Cadastro de Operadores da Produção</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <input type="text" placeholder="Nome Completo do Operador" value={opForm.nome} onChange={e => setOpForm({ ...opForm, nome: e.target.value })} />
                            <select value={opForm.linha_id} onChange={e => setOpForm({ ...opForm, linha_id: e.target.value })}>
                                <option value="">Selecione a Linha Principal...</option>
                                {db.linhas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: user.perfil === 'LIDER' ? '1fr 1fr' : '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <select value={opForm.vinculo} onChange={e => setOpForm({ ...opForm, vinculo: e.target.value })}>
                                <option value="Efetivo">Efetivo</option>
                                <option value="Temporário Manpower">Temporário Manpower</option>
                                <option value="Temporário We Can">Temporário We Can</option>
                                <option value="CTD">CTD</option>
                            </select>
                            <select value={opForm.turno} onChange={e => setOpForm({ ...opForm, turno: e.target.value })}>
                                <option value="T1">Turno 1</option>
                                <option value="T2">Turno 2</option>
                            </select>
                            {user.perfil !== 'LIDER' && (
                                <select value={opForm.lider_id} onChange={e => setOpForm({ ...opForm, lider_id: e.target.value })}>
                                    <option value="">Selecione o Líder Responsável...</option>
                                    {db.lideres.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                                </select>
                            )}
                        </div>
                        <button className="btn-success" onClick={() => {
                            if (!opForm.nome || !opForm.linha_id) return toast.error("Preencha Nome e Linha!");
                            const nomeTratado = opForm.nome.trim().toUpperCase();
                            const existe = db.operadores.some(o => o.nome.trim().toUpperCase() === nomeTratado);
                            if (existe) return toast.error(`❌ Já existe um operador com o nome "${opForm.nome.trim()}" no sistema!`);
                            const liderFinal = user.perfil === 'LIDER' ? meuLiderId : opForm.lider_id;
                            if (user.perfil === 'LIDER' && !liderFinal) return toast.error("Seu perfil de líder não está vinculado a nenhum colaborador. Contate a engenharia.");
                            if (!liderFinal) return toast.error("Selecione um líder responsável.");
                            handleAction('salvar_colaborador', { ...opForm, cargo: 'Operador', lider_id: liderFinal, linhas: [opForm.linha_id] }, () => setOpForm({ ...opForm, nome: '', linha_id: '' }));
                        }}>+ Salvar Operador</button>
                    </div>

                    {/* Seção de Ações sobre Operadores */}
                    <div className="setup-box-full" style={{ borderLeft: '4px solid #2980b9' }}>
                        <h4>⚙️ Gerenciar Operadores</h4>
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '15px' }}>
                            <button style={{ background: '#e74c3c', width: 'auto' }} onClick={() => {
                                if (operadoresVisiveis.length === 0) return toast.error("Nenhum operador disponível para exclusão.");
                                abrirSelecao(
                                    "🗑️ Excluir Operador",
                                    operadoresVisiveis,
                                    (op) => aoExcluirOperador(op),
                                    "Selecione o operador que deseja excluir permanentemente."
                                );
                            }}>🗑️ Excluir Operador</button>

                            <button style={{ background: '#f39c12', width: 'auto' }} onClick={() => {
                                if (operadoresNaoLideres.length === 0) return toast.error("Nenhum operador disponível para promoção.");
                                abrirSelecao(
                                    "⭐ Promover a Líder",
                                    operadoresNaoLideres,
                                    (op) => {
                                        const loginSugerido = op.nome.toLowerCase().replace(/[^a-z0-9]/g, '');
                                        const login = prompt(`Informe o login LDAP para "${op.nome}":`, loginSugerido);
                                        if (!login) return;
                                        aoPromoverOperador(op, login);
                                    },
                                    "Selecione o operador que será promovido a líder."
                                );
                            }}>⭐ Promover a Líder</button>

                            <button style={{ background: '#f39c12', width: 'auto' }} onClick={() => {
                                if (operadoresVisiveis.length === 0) return toast.error("Nenhum operador disponível para transferência.");
                                abrirSelecao(
                                    "🔄 Transferir / Editar Operador",
                                    operadoresVisiveis,
                                    (op) => aoSelecionarTransferir(op),
                                    "Selecione o operador que deseja transferir ou editar (líder, turno, linha e vínculo)."
                                );
                            }}>🔄 Transferir / Editar Operador</button>
                        </div>
                    </div>

                    {/* Exclusão de Líder (Apenas visível para Perfis Superiores) */}
                    {user.perfil !== 'LIDER' && (
                        <div className="setup-box-full" style={{ borderLeft: '4px solid #c0392b' }}>
                            <h4 style={{ color: '#c0392b' }}>⚠️ Exclusão de Líder</h4>
                            <p style={{ fontSize: '0.8em', color: '#7f8c8d' }}>A remoção do líder irá desvincular (limpar o ID) de todos os operadores que pertencem a ele.</p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <select value={remLiderId} onChange={e => setRemLiderId(e.target.value)} style={{ flex: 2 }}>
                                    <option value="">Selecione o Líder para exclusão...</option>
                                    {db.lideres.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                                </select>
                                <button style={{ background: '#c0392b', width: 'auto' }} onClick={() => {
                                    if (!remLiderId) return toast.error("Selecione um líder primeiro!");
                                    setShowModalLider(true);
                                }}>Excluir Líder</button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ============================================================================
                MODAIS
            ============================================================================ */}

            {/* MODAL DE SELEÇÃO GENÉRICO */}
            {selecaoModal.visivel && (
                <div className="modal-overlay" style={{ display: 'flex', zIndex: 9999 }} onClick={(e) => {
                    if (e.target.className.includes('modal-overlay')) setSelecaoModal({ ...selecaoModal, visivel: false });
                }}>
                    <div className="modal-box" style={{ width: '550px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
                        <div style={{ background: '#3498db', padding: '15px 20px', borderRadius: '12px 12px 0 0', color: 'white' }}>
                            <h3 style={{ margin: 0 }}>{selecaoModal.titulo}</h3>
                            {selecaoModal.mensagemConfirmacao && <p style={{ margin: '5px 0 0', fontSize: '0.85em', opacity: 0.9 }}>{selecaoModal.mensagemConfirmacao}</p>}
                        </div>
                        <div style={{ padding: '15px' }}>
                            <input type="text" placeholder="🔍 Buscar por nome..." className="form-control" style={{ marginBottom: '15px', width: '100%', padding: '10px' }}
                                onChange={(e) => setSelecaoModal({ ...selecaoModal, busca: e.target.value.toLowerCase() })} />
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 15px 15px 15px' }}>
                            {selecaoModal.lista
                                .filter(item => item[selecaoModal.campoBusca].toLowerCase().includes(selecaoModal.busca || ''))
                                .map(item => (
                                    <div key={item.id} style={{
                                        background: '#f8f9fa',
                                        marginBottom: '8px',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #ddd',
                                        cursor: 'pointer',
                                        transition: '0.2s',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                    onClick={() => selecaoModal.acaoConfirmar(item)}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e9ecef'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}>
                                        <div>
                                            <strong>{item.nome}</strong>
                                            <div style={{ fontSize: '0.8em', color: '#6c757d' }}>
                                                {item.linha ? `Linha: ${item.linha}` : ''}
                                                {item.turno ? ` | Turno: ${item.turno}` : ''}
                                                {item.vinculo ? ` | Vínculo: ${item.vinculo}` : ''}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '1.2em', color: '#3498db' }}>→</span>
                                    </div>
                                ))}
                            {selecaoModal.lista.filter(item => item[selecaoModal.campoBusca].toLowerCase().includes(selecaoModal.busca || '')).length === 0 && (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>Nenhum registro encontrado.</div>
                            )}
                        </div>
                        <div style={{ padding: '15px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setSelecaoModal({ ...selecaoModal, visivel: false })} style={{ background: '#ecf0f1', color: '#2c3e50', width: 'auto' }}>Fechar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE TRANSFERÊNCIA / EDIÇÃO (ATUALIZADO COM VÍNCULO) */}
            {transferModal.visivel && (
                <div className="modal-overlay" style={{ display: 'flex', zIndex: 9999 }} onClick={(e) => {
                    if (e.target.className.includes('modal-overlay')) setTransferModal({ ...transferModal, visivel: false });
                }}>
                    <div className="modal-box" style={{ width: '500px', padding: '30px' }}>
                        <h3 style={{ marginTop: 0, color: '#f39c12' }}>🔄 Transferir / Editar Operador</h3>
                        <p style={{ marginBottom: '20px' }}>Altere os dados de <strong>{transferModal.operadorNome}</strong>:</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Novo Líder:</label>
                                <select value={transferModal.novoLiderId || ''} onChange={e => setTransferModal({ ...transferModal, novoLiderId: e.target.value })}>
                                    <option value="">Selecione...</option>
                                    {db.lideres.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Novo Turno:</label>
                                <select value={transferModal.novoTurno || ''} onChange={e => setTransferModal({ ...transferModal, novoTurno: e.target.value })}>
                                    <option value="">Selecione...</option>
                                    <option value="T1">Turno 1</option>
                                    <option value="T2">Turno 2</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Nova Linha:</label>
                                <select value={transferModal.novaLinhaId || ''} onChange={e => setTransferModal({ ...transferModal, novaLinhaId: e.target.value })}>
                                    <option value="">Selecione...</option>
                                    {db.linhas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Novo Vínculo:</label>
                                <select value={transferModal.novoVinculo || ''} onChange={e => setTransferModal({ ...transferModal, novoVinculo: e.target.value })}>
                                    <option value="">Selecione...</option>
                                    <option value="Efetivo">Efetivo</option>
                                    <option value="Temporário Manpower">Temporário Manpower</option>
                                    <option value="Temporário We Can">Temporário We Can</option>
                                    <option value="CTD">CTD</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '25px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setTransferModal({ ...transferModal, visivel: false })} style={{ background: '#ecf0f1', color: '#2c3e50', width: 'auto' }}>Cancelar</button>
                            <button onClick={confirmarTransferencia} style={{ background: '#f39c12', width: 'auto' }}>Confirmar Alterações</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE EXCLUSÃO DE LÍDER */}
            {showModalLider && (
                <div className="modal-overlay" style={{ display: 'flex', zIndex: 9999 }} onClick={(e) => { if (e.target.className.includes('modal-overlay')) setShowModalLider(false); }}>
                    <div className="modal-box" style={{ width: '500px', padding: '30px', textAlign: 'center' }}>
                        <div style={{ fontSize: '3em', marginBottom: '15px' }}>🚨</div>
                        <h3 style={{ color: '#c0392b', marginBottom: '15px' }}>Confirmar Exclusão de Líder</h3>
                        <p style={{ marginBottom: '20px' }}>Tem certeza que deseja excluir permanentemente este Líder do sistema?</p>
                        {opsAfetadosLider.length > 0 && (
                            <div style={{ background: '#fadbd8', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'left' }}>
                                <p style={{ margin: '0 0 10px', fontWeight: 'bold', color: '#c0392b' }}>
                                    Atenção! Os seguintes {opsAfetadosLider.length} operadores ficarão sem líder (vínculo limpo):
                                </p>
                                <ul style={{ margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
                                    {opsAfetadosLider.map(op => <li key={op.id}>{op.nome}</li>)}
                                </ul>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button onClick={() => setShowModalLider(false)} style={{ background: '#ecf0f1', color: '#2c3e50', width: 'auto' }}>Cancelar</button>
                            <button onClick={() => {
                                handleAction('excluir_colaborador', { id: remLiderId }, () => {
                                    setRemLiderId('');
                                    setShowModalLider(false);
                                });
                            }} style={{ background: '#c0392b', width: 'auto' }}>Sim, Excluir Líder</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE CONFIRMAÇÃO GENÉRICO */}
            {confirmModal.isOpen && (
                <div className="modal-overlay" style={{ display: 'flex', zIndex: 9999 }} onClick={(e) => {
                    if (e.target.className.includes('modal-overlay')) {
                        if (confirmModal.onCancel) confirmModal.onCancel();
                        setConfirmModal({ ...confirmModal, isOpen: false });
                    }
                }}>
                    <div className="modal-box" style={{ width: '450px', padding: '30px', textAlign: 'center' }}>
                        <div style={{ fontSize: '3em', marginBottom: '10px' }}>⚠️</div>
                        <h3 style={{ margin: '0 0 15px', color: '#f39c12' }}>Confirmação</h3>
                        <p style={{ marginBottom: '25px', whiteSpace: 'pre-line', color: '#555' }}>{confirmModal.message}</p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button onClick={() => {
                                if (confirmModal.onCancel) confirmModal.onCancel();
                                setConfirmModal({ ...confirmModal, isOpen: false });
                            }} style={{ background: '#ecf0f1', color: '#2c3e50', width: 'auto' }}>Cancelar</button>
                            <button onClick={() => {
                                if (confirmModal.onConfirm) confirmModal.onConfirm();
                                setConfirmModal({ ...confirmModal, isOpen: false });
                            }} style={{ background: '#e74c3c', width: 'auto' }}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}