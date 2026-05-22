import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

export const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Referência para o timeout de inatividade (1 hora)
    const inactivityTimer = useRef(null);

    // Tempo de inatividade: 1 hora em milissegundos
    const INACTIVITY_LIMIT = 60 * 60 * 1000; // 3600000 ms

    // Função que reseta o timer de inatividade
    const resetInactivityTimer = useCallback(() => {
        // Limpa o timer anterior, se existir
        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
        }

        // Define um novo timer que chama signOut após o limite
        inactivityTimer.current = setTimeout(() => {
            // Só executa o logout se ainda houver um usuário logado
            if (localStorage.getItem('token')) {
                // Chama a função de logout definida abaixo
                signOut();
            }
        }, INACTIVITY_LIMIT);
    }, []); // A dependência signOut será tratada com useRef para evitar loop

    // Efeito para recuperar a sessão ao recarregar a página (F5)
    useEffect(() => {
        const token = localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
            api.defaults.headers.Authorization = `Bearer ${token}`;
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    // Função de logout (precisa ser estável para o timer)
    const signOut = useCallback(() => {
        // Limpa o timer de inatividade para evitar disparos duplos
        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
            inactivityTimer.current = null;
        }

        // Remove os dados de autenticação
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete api.defaults.headers.Authorization;
        setUser(null);

        // Redireciona para a tela de login
        //window.location.href = '/';
    }, []);

    // Efeito que configura os listeners de atividade do usuário
    useEffect(() => {
        // Só inicia o monitoramento se o usuário estiver logado
        if (!user) return;

        // Eventos que consideramos como atividade
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

        // Handler que reseta o timer
        const activityHandler = () => resetInactivityTimer();

        // Adiciona os listeners
        events.forEach(event => window.addEventListener(event, activityHandler));

        // Inicia o timer imediatamente
        resetInactivityTimer();

        // Cleanup: remove listeners e limpa o timer quando o componente desmontar
        return () => {
            events.forEach(event => window.removeEventListener(event, activityHandler));
            if (inactivityTimer.current) {
                clearTimeout(inactivityTimer.current);
            }
        };
    }, [user, resetInactivityTimer, signOut]);

    // Função de login
    const signIn = async (username, password) => {
        const response = await api.post('/login', { username, password });
        const { token, user } = response.data;

        // Persiste os dados no navegador
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));

        // Acopla o token nas próximas requisições
        api.defaults.headers.Authorization = `Bearer ${token}`;

        // Atualiza o estado do React (isso dispara o efeito de monitoramento)
        setUser(user);
    };

    if (loading) return null; // Evita flicker da tela de login antes de carregar o cache

    return (
        <AuthContext.Provider value={{ user, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};