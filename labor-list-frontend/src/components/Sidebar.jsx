import React, { useContext, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, signOut } = useContext(AuthContext);
    
    // Estado para controlar se a barra está minimizada ou não
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Menu dinâmico
    const menu = [
        { path: '/dashboard', icon: '📊', label: 'Dashboard' },
        { path: '/equipe', icon: '👥', label: 'Gestão de Equipe' },
        { path: '/matrix', icon: '🧠', label: 'Skill Matrix' },
        { path: '/treinamentos', icon: '📚', label: 'Treinamentos' },
        { path: '/heatmap', icon: '🔥', label: 'Mapa de Calor' },
        { path: '/planejamento-he', icon: '📅', label: 'Planejamento HE' },
        { path: '/rh-absenteismo', icon: '📅', label: 'Absenteísmo RH' },
        { path: '/configuracoes', icon: '⚙️', label: 'Configurações' }
    ];

    // Se for MASTER, injeta a página de Logs de Auditoria
    if (user?.perfil === 'MASTER') {
        menu.push({ path: '/logs', icon: '📜', label: 'Logs do Sistema' });
    }

    return (
        <div className="sidebar" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            /* ALTERAÇÃO AQUI: Mudamos de 280px para 230px para ficar mais compacta quando aberta */
            width: isCollapsed ? '80px' : '230px',
            minWidth: isCollapsed ? '80px' : '230px',
            maxWidth: isCollapsed ? '80px' : '230px',
            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
            position: 'relative',
            background: '#2c3e50',
            color: 'white',
            zIndex: 100,
            borderRight: '1px solid #1a252f'
        }}>
            
            {/* BOTÃO DE EXPANDIR/RECOLHER (Estilo Flutuante na Borda) */}
            <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
                style={{
                    position: 'absolute',
                    top: '25px',
                    right: '-16px',
                    background: '#1abc9c',
                    color: 'white',
                    border: '4px solid #eef2f7',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'transform 0.3s ease',
                    transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                    zIndex: 101,
                    padding: 0
                }}
            >
                ◀
            </button>

            {/* HEADER COM LOGO E TÍTULO */}
            <div style={{ 
                padding: '20px 0', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                borderBottom: '1px solid #1a252f',
                minHeight: '110px',
                boxSizing: 'border-box'
            }}>
                <img 
                    src="/logo_lenovo.png" 
                    alt="Logo" 
                    style={{ 
                        width: isCollapsed ? '40px' : '120px', 
                        height: isCollapsed ? '40px' : '30px', 
                        transition: 'all 0.3s ease',
                        objectFit: 'contain'
                    }} 
                />
                
                <div style={{ 
                    marginTop: '8px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    opacity: isCollapsed ? 0 : 1,
                    maxHeight: isCollapsed ? 0 : '50px',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    whiteSpace: 'nowrap'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.3em', color: '#ecf0f1' }}>Labor List</h2>
                    <span style={{ fontSize: '0.7em', color: '#1abc9c', fontWeight: 'bold', letterSpacing: '1px' }}>Skill Matrix</span>
                </div>
            </div>

            {/* PAINEL DO UTILIZADOR LOGADO */}
            <div style={{ 
                background: '#1abc9c', 
                padding: isCollapsed ? '15px 0' : '12px 15px', 
                textAlign: 'center', 
                transition: 'all 0.3s ease',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '60px'
            }}>
                {isCollapsed ? (
                    <b title={user?.nome} style={{ fontSize: '1.4em', color: 'white' }}>{user?.nome?.charAt(0).toUpperCase()}</b>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85em', color: '#e8f8f5' }}>Olá, <b>{user?.nome?.split(' ')[0]}</b></span>
                        <span style={{ fontSize: '0.65em', fontWeight: 'bold', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '12px', marginTop: '4px' }}>{user?.perfil}</span>
                    </div>
                )}
            </div>

            {/* MENU DE NAVEGAÇÃO */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {menu.map(item => {
                        const isActive = location.pathname === item.path;
                        return (
                            <li key={item.path} 
                                onClick={() => navigate(item.path)}
                                title={isCollapsed ? item.label : ""}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '10px 15px',
                                    cursor: 'pointer',
                                    background: isActive ? '#1a252f' : 'transparent',
                                    borderLeft: isActive ? '4px solid #1abc9c' : '4px solid transparent',
                                    color: isActive ? '#1abc9c' : '#bdc3c7',
                                    transition: 'all 0.2s ease',
                                    whiteSpace: 'nowrap',
                                    marginBottom: '4px'
                                }}
                                onMouseEnter={(e) => {
                                    if(!isActive) {
                                        e.currentTarget.style.background = '#34495e';
                                        e.currentTarget.style.color = '#ecf0f1';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if(!isActive) {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = '#bdc3c7';
                                    }
                                }}
                            >
                                <span style={{ fontSize: '1.2em', width: '25px', textAlign: 'center', marginRight: isCollapsed ? '0' : '12px' }}>{item.icon}</span>
                                
                                <span style={{ 
                                    opacity: isCollapsed ? 0 : 1, 
                                    width: isCollapsed ? 0 : 'auto', 
                                    overflow: 'hidden',
                                    transition: 'all 0.3s ease',
                                    fontWeight: isActive ? 'bold' : 'normal',
                                    fontSize: '0.9em'
                                }}>
                                    {item.label}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* BOTÃO DE LOGOFF NO RODAPÉ */}
            <div style={{ padding: '12px', borderTop: '1px solid #1a252f' }}>
                <button 
                    onClick={() => { signOut(); navigate('/'); }}
                    title="Sair / Logoff"
                    style={{
                        width: '100%',
                        background: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        padding: '10px 0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        transition: 'all 0.3s ease',
                        fontSize: '0.9em'
                    }}
                >
                    <span style={{ fontSize: '1.1em' }}>🚪</span>
                    <span style={{ 
                        marginLeft: isCollapsed ? '0' : '8px', 
                        opacity: isCollapsed ? 0 : 1, 
                        width: isCollapsed ? 0 : 'auto', 
                        overflow: 'hidden',
                        transition: 'all 0.3s ease'
                    }}>
                        Sair
                    </span>
                </button>
            </div>

        </div>
    );
}