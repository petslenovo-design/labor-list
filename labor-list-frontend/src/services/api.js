import axios from 'axios';

// Captura dinamicamente o IP que o usuário acessou no navegador
// Se ele acessou por http://10.33.59.89:3008, o currentHost será "10.33.59.89"
// Se ele acessou por http://172.21.17.20:3008, o currentHost será "172.21.17.20"
const currentHost = window.location.hostname;

// Monta a URL apontando para a porta 5008 do mesmo IP
const API_URL = `http://${currentHost}:5008/api`;
const api = axios.create({
    baseURL: API_URL
});

// Interceptor de requisição: anexa o token JWT automaticamente
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor de resposta: trata erros 401 (token expirado ou inválido)
api.interceptors.response.use(
    response => response, // Respostas bem-sucedidas seguem normalmente
    error => {
        // Se a requisição retornou 401 (não autorizado), força o logout
        if (error.response && error.response.status === 401) {
            // Remove os dados de autenticação
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            delete api.defaults.headers.Authorization;

            // Redireciona para a tela de login
            window.location.href = '/';
        }
        // Propaga o erro para quem chamou a API
        return Promise.reject(error);
    }
);

export default api;