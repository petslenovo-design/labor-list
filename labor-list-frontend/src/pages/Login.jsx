import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    
    const { signIn } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            await signIn(login, senha);
            toast.success("Acesso Liberado!");
            navigate('/dashboard'); 
        } catch (err) {
            toast.error(err.response?.data?.erro || "Credenciais inválidas");
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2c3e50 0%, #3498db 100%)' }}>
            <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '380px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', textAlign: 'center' }}>
                <h2 style={{ color: '#2c3e50', margin: '0 0 5px 0', fontSize: '2em', letterSpacing: '2px' }}>LABOR LIST</h2>
                <span style={{ fontSize: '0.8em', color: '#bdc3c7', letterSpacing: '2px', textTransform: 'uppercase', display: 'block', marginBottom: '30px' }}>
                    Enterprise Authentication
                </span>
                
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#7f8c8d' }}>Usuário LDAP:</label>
                        <input 
                            type="text" 
                            placeholder="Ex: ofaccioli" 
                            value={login}
                            onChange={e => setLogin(e.target.value)} 
                            required 
                            style={{ width: '100%', padding: '12px', marginTop: '5px', border: '1px solid #ced4da', borderRadius: '6px' }}
                        />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#7f8c8d' }}>Senha:</label>
                        <input 
                            type="password" 
                            placeholder="••••••••" 
                            value={senha}
                            onChange={e => setSenha(e.target.value)} 
                            required 
                            style={{ width: '100%', padding: '12px', marginTop: '5px', border: '1px solid #ced4da', borderRadius: '6px' }}
                        />
                    </div>
                    
                    <button type="submit" style={{ marginTop: '20px', background: '#27ae60', color: 'white', padding: '12px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1em' }}>
                        🔓 Desbloquear Acesso
                    </button>
                </form>
            </div>
        </div>
    );
}