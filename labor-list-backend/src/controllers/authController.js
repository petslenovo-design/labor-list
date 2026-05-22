const ldap = require('ldapjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

exports.login = async (req, res) => {
    const { username, password } = req.body;

    // Login Master Hardcoded (Emergência/Engenharia)
    if (username.toLowerCase() === 'engenharia' && password === 'LenovoEng26') {
        const token = jwt.sign({ 
            id: 0, 
            colaborador_id: null,  // Engenharia não tem colaborador associado
            login: 'engenharia', 
            nome: 'Engenharia Lenovo', 
            perfil: 'MASTER' 
        }, process.env.JWT_SECRET, { expiresIn: '12h' });
        return res.json({ sucesso: true, token, user: { nome: 'Engenharia', perfil: 'MASTER' } });
    }

    // Login LDAP normal
    const client = ldap.createClient({ url: process.env.LDAP_URL });
    const userDN = `${username}@lenovo.com`; // AJUSTE SEU DOMINIO

    client.bind(userDN, password, async (err) => {
        if (err) { client.unbind(); return res.status(401).json({ erro: 'Credenciais LDAP inválidas.' }); }

        try {
            const { rows } = await pool.query('SELECT * FROM usuarios_acesso WHERE login_ldap = $1', [username]);
            if (rows.length === 0) return res.status(403).json({ erro: 'Autenticado, mas sem permissão no Labor List.' });
            
            const user = rows[0];
            let colaborador_id = null;

            // Se for líder, busca o ID correspondente na tabela colaboradores
            if (user.perfil === 'LIDER') {
                const colab = await pool.query(
                    `SELECT id FROM colaboradores WHERE nome = $1 AND cargo = 'Líder'`,
                    [user.nome]
                );
                if (colab.rows.length) colaborador_id = colab.rows[0].id;
            }

            const token = jwt.sign({
                id: user.id,
                colaborador_id,   // ← campo novo
                login: user.login_ldap,
                nome: user.nome,
                perfil: user.perfil
            }, process.env.JWT_SECRET, { expiresIn: '12h' });

            res.json({
                sucesso: true,
                token,
                user: {
                    id: user.id,
                    colaborador_id,
                    nome: user.nome,
                    perfil: user.perfil
                }
            });
        } catch (dbErr) {
            console.error(dbErr);
            res.status(500).json({ erro: 'Erro no banco.' });
        } finally {
            client.unbind();
        }
    });
};