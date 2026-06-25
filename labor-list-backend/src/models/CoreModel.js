const pool = require('../config/db');

class CoreModel {
    /**
     * Retorna a data baseada no fuso de São Paulo, virando o dia apenas às 05:00 da manhã.
     * CORREÇÃO: Usa o relógio nativo do sistema sem mutações de TimezoneOffset.
     */
    static getHoje() {
        const spTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        
        // Se for antes das 05:00 da manhã, pertence ao dia anterior
        if (spTime.getHours() < 5) {
            spTime.setDate(spTime.getDate() - 1);
        }
        
        const yyyy = spTime.getFullYear();
        const mm = String(spTime.getMonth() + 1).padStart(2, '0');
        const dd = String(spTime.getDate()).padStart(2, '0');
        
        return `${yyyy}-${mm}-${dd}`;
    }

    static async carregarTudo() {
        // AUTO-LIMPEZA
        await pool.query(`UPDATE colaboradores SET status_especial = NULL, vacation_start = NULL, vacation_end = NULL WHERE status_especial = 'Férias' AND vacation_end < CURRENT_DATE`);
        await pool.query(`DELETE FROM alocacoes a USING alocacoes b WHERE a.id > b.id AND a.colaborador_id = b.colaborador_id AND a.produto_id = b.produto_id AND a.posto_id = b.posto_id`);

        const hoje = CoreModel.getHoje();

        // CONSULTA MASSIVA
        const [ operadores, produtos, linhas, postos, lideres, alocacoes, prodYield, colabYield, planejamentos ] = await Promise.all([
            pool.query(`
                SELECT c.*, l.nome as nome_lider,
                       COALESCE((SELECT json_agg(li.nome) FROM colaborador_linhas cl JOIN linhas li ON cl.linha_id = li.id WHERE cl.colaborador_id = c.id), '[]') as linhas_vinculadas,
                       (SELECT cl.linha_id FROM colaborador_linhas cl WHERE cl.colaborador_id = c.id LIMIT 1) as linha_principal_id
                FROM colaboradores c LEFT JOIN colaboradores l ON c.lider_id = l.id 
                WHERE c.cargo = 'Operador' AND c.is_ativo = true 
                ORDER BY c.nome
            `),
            pool.query("SELECT * FROM produtos ORDER BY nome"),
            pool.query("SELECT * FROM linhas ORDER BY nome"),
            pool.query("SELECT * FROM postos ORDER BY id"),
            pool.query("SELECT * FROM colaboradores WHERE cargo = 'Líder' AND is_ativo = true ORDER BY nome"),
            pool.query(`SELECT a.id, c.nome as operador, c.id as colaborador_id, p.nome as produto, p.id as produto_id, po.nome as posto, po.id as posto_id, a.turno FROM alocacoes a JOIN colaboradores c ON a.colaborador_id = c.id JOIN produtos p ON a.produto_id = p.id JOIN postos po ON a.posto_id = po.id ORDER BY a.data_alocacao ASC`),
            pool.query(`SELECT p.nome as produto_nome, po.nome as posto_nome, py.yield_value FROM produto_postos_yield py JOIN produtos p ON py.produto_id = p.id JOIN postos po ON py.posto_id = po.id`),
            pool.query(`SELECT cy.colaborador_id, p.nome as produto_nome, po.nome as posto_nome, cy.classificacao FROM colaborador_postos_yield cy JOIN produtos p ON cy.produto_id = p.id JOIN postos po ON cy.posto_id = po.id`),
            pool.query("SELECT dados FROM planejamentos_he")
        ]);

        return {
            operadores: operadores.rows.map(op => {
                let he = typeof op.overtime_dates === 'string' ? JSON.parse(op.overtime_dates) : (op.overtime_dates || []);
                he = he.filter(h => (typeof h === 'string' ? h : h.data) >= hoje);

                let hist_faltas = typeof op.historico_faltas === 'string' ? JSON.parse(op.historico_faltas) : (op.historico_faltas || []);
                let hist_saidas = typeof op.historico_saidas === 'string' ? JSON.parse(op.historico_saidas) : (op.historico_saidas || []);

                if (op.status_especial === 'Absenteísmo' && !hist_faltas.some(f => f.data === hoje)) op.status_especial = null;
                if (op.status_especial === 'Saída Antecipada' && !hist_saidas.some(s => s.data === hoje)) { op.status_especial = null; op.early_exit_time = null; }

                return { ...op, linhas_vinculadas: typeof op.linhas_vinculadas === 'string' ? JSON.parse(op.linhas_vinculadas) : op.linhas_vinculadas, overtimeDates: he, historicoFaltas: hist_faltas, historicoSaidas: hist_saidas };
            }),
            produtos: produtos.rows, linhas: linhas.rows, postos: postos.rows, lideres: lideres.rows, alocacoes: alocacoes.rows, produto_yield: prodYield.rows, colaborador_yield: colabYield.rows,
            planejamentos: planejamentos.rows.map(r => typeof r.dados === 'string' ? JSON.parse(r.dados) : r.dados).filter(p => p.data >= hoje)
        };
    }
}
module.exports = CoreModel;