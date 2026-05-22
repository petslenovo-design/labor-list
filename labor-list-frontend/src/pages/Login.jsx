import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
    // Estados para campos do formulário
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    
    // Estado de carregamento (exibe loader similar ao Dashboard)
    const [loading, setLoading] = useState(false);
    
    const { signIn } = useContext(AuthContext);
    const navigate = useNavigate();

    // Função para realizar login
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true); // Ativa o loader
        try {
            await signIn(login, senha);
            toast.success("Acesso Liberado!");
            navigate('/dashboard');
        } catch (err) {
            toast.error(err.response?.data?.erro || "Credenciais inválidas");
        } finally {
            setLoading(false); // Desativa o loader independente do resultado
        }
    };

    return (
        // Container principal com gradiente, centralizando vertical e horizontalmente
        <div style={{
            display: 'flex',
            height: '100vh',
            width: '100vw',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #2c3e50 0%, #3498db 100%)'
        }}>
            {/* Card de login com sombra e cantos arredondados */}
            <div style={{
                background: 'white',
                padding: '40px',
                borderRadius: '12px',
                width: '380px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                textAlign: 'center',
                position: 'relative' // para posicionar o loader de sobreposição
            }}>
                {/* Logo oficial do projeto, centralizada acima do título */}
                <img 
                    src="/logo_lenovo.png" 
                    alt="Labor List Logo" 
                    style={{ width: '150px', marginBottom: '10px' }}
                />

                {/* Título principal */}
                <h2 style={{
                    color: '#2c3e50',
                    margin: '0 0 5px 0',
                    fontSize: '2em',
                    letterSpacing: '2px'
                }}>
                    LABOR LIST
                </h2>

                {/* Subtítulo / tagline */}
                <span style={{
                    fontSize: '0.8em',
                    color: '#bdc3c7',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '30px'
                }}>
                    Enterprise Authentication
                </span>
                
                {/* Formulário de login */}
                <form onSubmit={handleLogin} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '15px'
                }}>
                    {/* Campo Usuário LDAP */}
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#7f8c8d' }}>
                            Usuário LDAP:
                        </label>
                        <input 
                            type="text" 
                            placeholder="Seu ITCODE"
                            value={login}
                            onChange={e => setLogin(e.target.value)} 
                            required 
                            disabled={loading} // Desabilita durante o carregamento
                            style={{
                                width: '100%',
                                padding: '12px',
                                marginTop: '5px',
                                border: '1px solid #ced4da',
                                borderRadius: '6px',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Campo Senha */}
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#7f8c8d' }}>
                            Senha:
                        </label>
                        <input 
                            type="password" 
                            placeholder="••••••••" 
                            value={senha}
                            onChange={e => setSenha(e.target.value)} 
                            required 
                            disabled={loading} // Desabilita durante o carregamento
                            style={{
                                width: '100%',
                                padding: '12px',
                                marginTop: '5px',
                                border: '1px solid #ced4da',
                                borderRadius: '6px',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    
                    {/* Botão de submit com estado de carregamento */}
                    <button 
                        type="submit" 
                        disabled={loading} // Evita múltiplos cliques
                        style={{
                            marginTop: '20px',
                            background: loading ? '#95a5a6' : '#27ae60', // Muda cor quando carregando
                            color: 'white',
                            padding: '12px',
                            borderRadius: '6px',
                            border: 'none',
                            fontWeight: 'bold',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '1.1em',
                            transition: 'background 0.2s ease'
                        }}
                    >
                        {loading ? 'Autenticando...' : '🔓 Desbloquear Acesso'}
                    </button>
                </form>

                {/* Overlay de carregamento (idêntico ao usado no Dashboard) */}
                {loading && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(255,255,255,0.9)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '12px',
                        zIndex: 10
                    }}>
                        {/* Spinner utilizando a classe global já existente */}
                        <div className="loading-spinner" />
                        <p style={{ marginTop: '15px', color: '#2c3e50', fontWeight: 'bold' }}>
                            Verificando credenciais...
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}