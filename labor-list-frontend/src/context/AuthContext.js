import React, { createContext, useState, useEffect } from 'react';
import api from '../services/api';

export const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Quando você der F5 na página, ele recupera quem estava logado
    useEffect(() => {
        const token = localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
            api.defaults.headers.Authorization = `Bearer ${token}`;
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    // Função central de login
    const signIn = async (username, password) => {
        const response = await api.post('/login', { username, password });
        const { token, user } = response.data;

        // Salva na memória do navegador
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));

        // Acopla o token nas próximas requisições
        api.defaults.headers.Authorization = `Bearer ${token}`;
        
        // Avisa o React que o usuário entrou! (Isso resolve o bug de não sair da tela)
        setUser(user);
    };

    const signOut = () => {
        localStorage.clear();
        setUser(null);
    };

    if (loading) return null; // Evita piscar a tela de login antes de carregar o cache

    return (
        <AuthContext.Provider value={{ user, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};