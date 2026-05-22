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

api.interceptors.request.use(config => {
    // Busca a chave EXATA que o AuthContext salva
    const token = localStorage.getItem('token');
    
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;