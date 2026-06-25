const pool = require('../config/db');

class AdminModel {
    static async salvarUsuarioAcesso(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(`INSERT INTO usuarios_acesso (nome, login_ldap, perfil) VALUES ($1, $2, $3) ON CONFLICT (login_ldap) DO UPDATE SET perfil = EXCLUDED.perfil`,
                [dados.nome, dados.login_ldap, dados.perfil]);
            
            if (dados.perfil === 'LIDER') {
                const lCheck = await client.query("SELECT id FROM colaboradores WHERE nome = $1 AND cargo = 'Líder'", [dados.nome]);
                if (lCheck.rows.length === 0) await client.query("INSERT INTO colaboradores (nome, cargo) VALUES ($1, 'Líder')", [dados.nome]);
            }
            await client.query("COMMIT");
        } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    }

    static async excluirUsuarioAcesso(dados) {
        await pool.query("DELETE FROM usuarios_acesso WHERE login_ldap = $1", [dados.login_ldap]);
    }

    static async registrarLog(login, acao, detalhes) {
        try {
            await pool.query("INSERT INTO logs_auditoria (usuario_login, acao, detalhes) VALUES ($1, $2, $3)", [login, acao, JSON.stringify(detalhes)]);
        } catch (e) { console.error("Erro ao gravar log:", e); }
    }

    static async carregarLogs() {
        const res = await pool.query("SELECT * FROM logs_auditoria ORDER BY id DESC LIMIT 500");
        return res.rows;
    }
}
module.exports = AdminModel;