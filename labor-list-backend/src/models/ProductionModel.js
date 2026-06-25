const pool = require('../config/db');

class ProductionModel {
    static async salvarProduto(dados) {
        await pool.query("INSERT INTO produtos (nome) VALUES ($1)", [dados.nome]);
    }

    static async excluirProduto(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("DELETE FROM alocacoes WHERE produto_id = $1", [dados.id]);
            await client.query("DELETE FROM produto_postos_yield WHERE produto_id = $1", [dados.id]);
            await client.query("DELETE FROM colaborador_postos_yield WHERE produto_id = $1", [dados.id]);
            await client.query("DELETE FROM produtos WHERE id = $1", [dados.id]);
            await client.query("COMMIT");
        } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    }

    static async zerarTreinamentos(dados) {
        await pool.query("DELETE FROM alocacoes WHERE colaborador_id = $1", [dados.colaborador_id]);
    }

static async salvarAlocacaoMultipla(dados) {
        let addCount = 0;
        
        // Loop pela array de postos enviados. 
        // O PostgreSQL agora barra automaticamente duplicatas graças ao "ON CONFLICT DO NOTHING"
        for (let pid of dados.postos_ids) {
            const res = await pool.query(`
                INSERT INTO alocacoes (colaborador_id, produto_id, posto_id, turno) 
                VALUES ($1, $2, $3, $4) 
                ON CONFLICT (colaborador_id, produto_id, posto_id) DO NOTHING
                RETURNING id
            `, [dados.colaborador_id, dados.produto_id, pid, dados.turno]);

            // res.rowCount será 1 se inseriu com sucesso, e 0 se foi ignorado por já existir
            if (res.rowCount > 0) {
                addCount++;
            }
        }
        return addCount;
    }

static async transferirOperador(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            
            const resultColab = await client.query("SELECT vinculo, historico_contratos FROM colaboradores WHERE id = $1", [dados.colaborador_id]);
            if (resultColab.rows.length === 0) throw new Error("Colaborador não encontrado.");
            
            const colabAtual = resultColab.rows[0];
            let historicoAtual = typeof colabAtual.historico_contratos === 'string' 
                ? JSON.parse(colabAtual.historico_contratos) 
                : (colabAtual.historico_contratos || []);
            
            // O frontend agora envia a data exata da mudança, ou usa a de hoje como padrão
            const dataMudanca = dados.nova_data_mudanca || new Date().toISOString().substring(0, 10);
            
            if (dados.novo_vinculo && dados.novo_vinculo !== colabAtual.vinculo) {
                // Encerra o contrato ativo
                for (let i = historicoAtual.length - 1; i >= 0; i--) {
                    if (historicoAtual[i].fim === null) {
                        historicoAtual[i].fim = dataMudanca;
                        break;
                    }
                }
                // Adiciona o novo contrato com a data escolhida
                historicoAtual.push({
                    vinculo: dados.novo_vinculo,
                    inicio: dataMudanca,
                    fim: null
                });
            }

            await client.query(`
                UPDATE colaboradores 
                SET lider_id = $1, 
                    turno = $2, 
                    vinculo = COALESCE($4, vinculo),
                    historico_contratos = $5::jsonb
                WHERE id = $3`,
                [
                    dados.novo_lider_id || null, 
                    dados.novo_turno, 
                    dados.colaborador_id, 
                    dados.novo_vinculo || null,
                    JSON.stringify(historicoAtual)
                ]
            );

            await client.query("DELETE FROM colaborador_linhas WHERE colaborador_id = $1", [dados.colaborador_id]);
            if (dados.nova_linha_id) {
                await client.query("INSERT INTO colaborador_linhas (colaborador_id, linha_id) VALUES ($1, $2)", [dados.colaborador_id, dados.nova_linha_id]);
            }
            
            await client.query("COMMIT");
        } catch (e) { 
            await client.query("ROLLBACK"); 
            throw e; 
        } finally { 
            client.release(); 
        }
    }

    static async salvarYieldColaborador(dados) {
        await pool.query(`INSERT INTO colaborador_postos_yield (colaborador_id, produto_id, posto_id, classificacao) VALUES ($1, $2, $3, $4) ON CONFLICT (colaborador_id, produto_id, posto_id) DO UPDATE SET classificacao = EXCLUDED.classificacao`,
            [dados.colaborador_id, dados.produto_id, dados.posto_id, dados.classificacao]);
    }

    static async syncPlanejamento(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // Para não travar (Access Exclusive Lock), deletamos invés de Truncate na transação concorrente
            await client.query("DELETE FROM planejamentos_he");
            if (dados.rows && dados.rows.length > 0) {
                for (let row of dados.rows) await client.query("INSERT INTO planejamentos_he (dados) VALUES ($1)", [JSON.stringify(row)]);
            }
            await client.query("COMMIT");
        } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    }
}
module.exports = ProductionModel;