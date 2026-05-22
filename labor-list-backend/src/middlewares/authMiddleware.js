const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    // Busca o token no cabeçalho (Header) da requisição que o Axios do React envia
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ sucesso: false, erro: 'Acesso negado. Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1]; // Remove a palavra "Bearer "

    try {
        // Valida se o token foi gerado pela sua aplicação e não está expirado
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Salva os dados do usuário (perfil, login) para usar nas rotas se precisar
        next(); // Libera o acesso para o Controller
    } catch (err) {
        return res.status(401).json({ sucesso: false, erro: 'Sessão expirada ou token inválido. Faça login novamente.' });
    }
};