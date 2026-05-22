const pool = require('../config/db');

class DataModel {

    // ============================================================================
    // MÉTODOS DE UTILIDADE PÚBLICA
    // ============================================================================

    /**
     * Retorna a data de hoje no formato YYYY-MM-DD compensando o fuso horário local.
     * Isso impede que o servidor Node.js (que geralmente roda em UTC) marque 
     * faltas ou horas extras no dia errado.
     */
    static getHoje() {
        const hojeLocal = new Date();
        hojeLocal.setMinutes(hojeLocal.getMinutes() - hojeLocal.getTimezoneOffset());
        return hojeLocal.toISOString().split('T')[0];
    }

    // ============================================================================
    // CARGA INICIAL DO SISTEMA (BIG LOAD)
    // ============================================================================

    /**
     * Carrega todas as informações do PostgreSQL e faz a auto-limpeza de dados 
     * temporários (Férias vencidas, Horas Extras passadas, Alocações duplicadas).
     */
    static async carregarTudo() {

        // 1. AUTO-LIMPEZA: Remove o status de "Férias" se a data final já passou de ontem
        await pool.query(`
            UPDATE colaboradores 
            SET status_especial = NULL, vacation_start = NULL, vacation_end = NULL 
            WHERE status_especial = 'Férias' AND vacation_end < CURRENT_DATE
        `);

        // 2. AUTO-LIMPEZA: Remove treinamentos duplicados da Skill Matrix no banco
        await pool.query(`
            DELETE FROM alocacoes a 
            USING alocacoes b 
            WHERE a.id > b.id 
              AND a.colaborador_id = b.colaborador_id 
              AND a.produto_id = b.produto_id 
              AND a.posto_id = b.posto_id
        `);

        const hoje = DataModel.getHoje();

        // 3. CONSULTA MASSIVA: Dispara todas as consultas ao mesmo tempo (Promise.all)
        // para não bloquear a thread do Node e entregar o painel instantaneamente.
        const [
            operadores,
            produtos,
            linhas,
            postos,
            lideres,
            alocacoes,
            prodYield,
            colabYield,
            planejamentos
        ] = await Promise.all([
            // Query de Operadores (Usa JSON_AGG para trazer todas as linhas do Polivalente num array)
            pool.query(`
                SELECT c.*, l.nome as nome_lider, 
                COALESCE(
                    (SELECT json_agg(li.nome) 
                     FROM colaborador_linhas cl 
                     JOIN linhas li ON cl.linha_id = li.id 
                     WHERE cl.colaborador_id = c.id), 
                '[]') as linhas_vinculadas 
                FROM colaboradores c 
                LEFT JOIN colaboradores l ON c.lider_id = l.id 
                WHERE c.cargo = 'Operador' 
                ORDER BY c.nome
            `),
            pool.query("SELECT * FROM produtos ORDER BY nome"),
            pool.query("SELECT * FROM linhas ORDER BY nome"),
            pool.query("SELECT * FROM postos ORDER BY id"),
            pool.query("SELECT * FROM colaboradores WHERE cargo = 'Líder' ORDER BY nome"),

            // Query de Alocações (Traz os nomes legíveis ao invés de apenas IDs)
            pool.query(`
                SELECT a.id, c.nome as operador, c.id as colaborador_id, 
                       p.nome as produto, p.id as produto_id, 
                       po.nome as posto, po.id as posto_id, a.turno 
                FROM alocacoes a 
                JOIN colaboradores c ON a.colaborador_id = c.id 
                JOIN produtos p ON a.produto_id = p.id 
                JOIN postos po ON a.posto_id = po.id 
                ORDER BY a.data_alocacao ASC
            `),
            pool.query(`
                SELECT p.nome as produto_nome, po.nome as posto_nome, py.yield_value 
                FROM produto_postos_yield py 
                JOIN produtos p ON py.produto_id = p.id 
                JOIN postos po ON py.posto_id = po.id
            `),
            pool.query(`
                SELECT cy.colaborador_id, p.nome as produto_nome, po.nome as posto_nome, cy.classificacao 
                FROM colaborador_postos_yield cy 
                JOIN produtos p ON cy.produto_id = p.id 
                JOIN postos po ON cy.posto_id = po.id
            `),
            pool.query("SELECT dados FROM planejamentos_he")
        ]);

        // 4. PROCESSAMENTO DE DADOS ANTES DE ENVIAR PARA O REACT
        return {
            operadores: operadores.rows.map(op => {

                // Trata as Horas Extras agendadas
                let he = typeof op.overtime_dates === 'string' ? JSON.parse(op.overtime_dates) : (op.overtime_dates || []);

                // Oculta no Frontend HEs que já passaram de hoje
                he = he.filter(h => {
                    const d = typeof h === 'string' ? h : h.data;
                    return d >= hoje;
                });

                // Trata o histórico permanente de faltas e saídas para os Gráficos Drill-Down
                let hist_faltas = typeof op.historico_faltas === 'string' ? JSON.parse(op.historico_faltas) : (op.historico_faltas || []);
                let hist_saidas = typeof op.historico_saidas === 'string' ? JSON.parse(op.historico_saidas) : (op.historico_saidas || []);

                return {
                    ...op,
                    linhas_vinculadas: typeof op.linhas_vinculadas === 'string' ? JSON.parse(op.linhas_vinculadas) : op.linhas_vinculadas,
                    overtimeDates: he,
                    historicoFaltas: hist_faltas,
                    historicoSaidas: hist_saidas
                };
            }),
            produtos: produtos.rows,
            linhas: linhas.rows,
            postos: postos.rows,
            lideres: lideres.rows,
            alocacoes: alocacoes.rows,
            produto_yield: prodYield.rows,
            colaborador_yield: colabYield.rows,

            // Oculta os planos antigos de HE da tela de PlanejamentoHE
            planejamentos: planejamentos.rows.map(r => {
                return typeof r.dados === 'string' ? JSON.parse(r.dados) : r.dados;
            }).filter(p => p.data >= hoje)
        };
    }

    // ============================================================================
    // GESTÃO DE PRODUTOS
    // ============================================================================

    static async salvarProduto(dados) {
        await pool.query("INSERT INTO produtos (nome) VALUES ($1)", [dados.nome]);
    }

    static async excluirProduto(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // Apaga as dependências primeiro para não dar erro de banco
            await client.query("DELETE FROM alocacoes WHERE produto_id = $1", [dados.id]);
            await client.query("DELETE FROM produto_postos_yield WHERE produto_id = $1", [dados.id]);
            await client.query("DELETE FROM colaborador_postos_yield WHERE produto_id = $1", [dados.id]);

            // Apaga o produto
            await client.query("DELETE FROM produtos WHERE id = $1", [dados.id]);
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    // ============================================================================
    // GESTÃO DE COLABORADORES E LINHAS
    // ============================================================================

    static async salvarColaborador(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN"); // Proteção Transacional

            // 1. Insere o colaborador base
            const result = await client.query(`
                INSERT INTO colaboradores (nome, cargo, lider_id, vinculo, turno) 
                VALUES ($1, $2, $3, $4, $5) 
                RETURNING id`,
                [dados.nome, dados.cargo, dados.lider_id || null, dados.vinculo || null, dados.turno || 'T1']
            );

            // 2. Se for operador e enviou linhas, vincula na tabela de N:M
            if (dados.cargo === 'Operador' && dados.linhas && dados.linhas.length > 0) {
                const novo_id = result.rows[0].id;
                for (let linha_id of dados.linhas) {
                    await client.query(
                        "INSERT INTO colaborador_linhas (colaborador_id, linha_id) VALUES ($1, $2)",
                        [novo_id, linha_id]
                    );
                }
            }

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    static async excluirColaborador(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 1. Se for líder, remove também da tabela de acessos
            const liderInfo = await client.query(
                "SELECT nome FROM colaboradores WHERE id = $1 AND cargo = 'Líder'",
                [dados.id]
            );
            if (liderInfo.rows.length) {
                await client.query('DELETE FROM usuarios_acesso WHERE nome = $1', [liderInfo.rows[0].nome]);
            }

            // 2. Limpa o vínculo dos operadores que tinham este líder
            await client.query("UPDATE colaboradores SET lider_id = NULL WHERE lider_id = $1", [dados.id]);

            // 3. Apaga os rastros operacionais
            await client.query("DELETE FROM alocacoes WHERE colaborador_id = $1", [dados.id]);
            await client.query("DELETE FROM colaborador_linhas WHERE colaborador_id = $1", [dados.id]);
            await client.query("DELETE FROM colaborador_postos_yield WHERE colaborador_id = $1", [dados.id]);

            // 4. Exclui o colaborador
            await client.query("DELETE FROM colaboradores WHERE id = $1", [dados.id]);

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    // ============================================================================
    // STATUS DO RH (CÉREBRO DA GESTÃO DE LABOR)
    // ============================================================================

    static async alterarStatus(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Busca o estado anterior para calcularmos a diferença de status
            const check = await client.query(`
                SELECT status_especial, historico_faltas, historico_saidas 
                FROM colaboradores 
                WHERE id = $1
            `, [dados.id]);

            const status_banco = check.rows[0]?.status_especial;

            let hist_faltas = check.rows[0]?.historico_faltas;
            hist_faltas = typeof hist_faltas === 'string' ? JSON.parse(hist_faltas) : (hist_faltas || []);

            let hist_saidas = check.rows[0]?.historico_saidas;
            hist_saidas = typeof hist_saidas === 'string' ? JSON.parse(hist_saidas) : (hist_saidas || []);

            let novoStatus = dados.status_novo;

            // Toggle lógico: Se clicou no status que já estava ativo, a intenção é limpar.
            if (!dados.is_explicit_update && dados.status_atual === dados.status_novo) {
                novoStatus = null;
            }

            // REGRA DE NEGÓCIO CRÍTICA:
            // Quando um operador retorna de um "Afastamento / Licença", sua Skill Matrix é ZERADA automaticamente.
            if (status_banco === 'Afastamento / Licença' && novoStatus !== 'Afastamento / Licença') {
                await client.query("DELETE FROM alocacoes WHERE colaborador_id = $1", [dados.id]);
            }

            // Prepara os metadados acessórios (Férias e Saídas)
            const vacStart = (novoStatus === 'Férias' && dados.vacation_start) ? dados.vacation_start : null;
            const vacEnd = (novoStatus === 'Férias' && dados.vacation_end) ? dados.vacation_end : null;
            const earlyExit = (novoStatus === 'Saída Antecipada' && dados.early_exit_time) ? dados.early_exit_time : null;

            // GRAVAÇÃO CONTÍNUA DO HISTÓRICO DE FALTAS PARA GRÁFICOS
            const hoje = DataModel.getHoje();

            if (novoStatus === 'Absenteísmo') {
                // Impede que gravar duas vezes no mesmo dia duplique a entrada no array
                if (!hist_faltas.some(f => f.data === hoje)) {
                    hist_faltas.push({
                        data: hoje,
                        motivo: dados.absenteeismComment || ''
                    });
                }
            }

            if (novoStatus === 'Saída Antecipada') {
                // Impede que gravar duas vezes no mesmo dia duplique a entrada no array
                if (!hist_saidas.some(s => s.data === hoje)) {
                    hist_saidas.push({
                        data: hoje,
                        horario: earlyExit,
                        motivo: dados.earlyExitReason || ''
                    });
                }
            }

            // Grava todas as alterações simultaneamente na linha do colaborador
            await client.query(`
                UPDATE colaboradores 
                SET status_especial = $1, 
                    vacation_start = $2, 
                    vacation_end = $3, 
                    early_exit_time = $4, 
                    historico_faltas = $5, 
                    historico_saidas = $6 
                WHERE id = $7`,
                [novoStatus, vacStart, vacEnd, earlyExit, JSON.stringify(hist_faltas), JSON.stringify(hist_saidas), dados.id]
            );

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    // ============================================================================
    // GESTÃO DE HORAS EXTRAS (HE) E LOGÍSTICA
    // ============================================================================

    static async confirmarHE(dados) {
        const check = await pool.query("SELECT overtime_dates FROM colaboradores WHERE id = $1", [dados.id]);

        let dates = check.rows[0]?.overtime_dates;
        dates = typeof dates === 'string' ? JSON.parse(dates) : (dates || []);

        const hoje = DataModel.getHoje();

        // Remove lixo antigo para não estufar a coluna do banco de dados
        dates = dates.filter(h => {
            const d = typeof h === 'string' ? h : h.data;
            return d >= hoje;
        });

        // Impede que o Líder agende duas HEs para o mesmo dia e duplique a logística
        const jaExiste = dates.some(d => d === dados.data_he || (d && d.data === dados.data_he));

        if (!jaExiste) {
            dates.push({
                data: dados.data_he,
                desjejum: dados.desjejum || 'NÃO',
                refeicao: dados.refeicao || 'NÃO',
                transporte: dados.transporte || 'NÃO'
            });

            await pool.query(
                "UPDATE colaboradores SET overtime_dates = $1 WHERE id = $2",
                [JSON.stringify(dates), dados.id]
            );
        }
    }

    static async removerHE(dados) {
        const check = await pool.query("SELECT overtime_dates FROM colaboradores WHERE id = $1", [dados.id]);

        let dates = check.rows[0]?.overtime_dates;
        dates = typeof dates === 'string' ? JSON.parse(dates) : (dates || []);

        const hoje = DataModel.getHoje();

        // Filtra removendo a data específica que o Líder solicitou cancelar, e limpa as passadas
        dates = dates.filter(he => {
            const d = typeof he === 'string' ? he : he.data;
            return d >= hoje && d !== dados.data_he;
        });

        await pool.query(
            "UPDATE colaboradores SET overtime_dates = $1 WHERE id = $2",
            [JSON.stringify(dates), dados.id]
        );
    }

    // ============================================================================
    // NOVO: POLIVALÊNCIA (MÚLTIPLAS LINHAS DE COBERTURA)
    // ============================================================================

    /**
     * Atualiza as checkboxes de Linhas de Cobertura sem destruir o status principal de RH.
     */
    static async atualizarLinhasCobertura(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 1. Zera as linhas atuais do operador para reconstruir
            await client.query("DELETE FROM colaborador_linhas WHERE colaborador_id = $1", [dados.colaborador_id]);

            // 2. Para cada linha de nome enviada, busca o ID respectivo e associa
            if (dados.linhas && dados.linhas.length > 0) {
                for (let nome of dados.linhas) {
                    const l = await client.query("SELECT id FROM linhas WHERE nome = $1", [nome]);

                    if (l.rows.length > 0) {
                        await client.query(
                            "INSERT INTO colaborador_linhas (colaborador_id, linha_id) VALUES ($1, $2)",
                            [dados.colaborador_id, l.rows[0].id]
                        );
                    }
                }
            }
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    // ============================================================================
    // GESTÃO DA MATRIZ DE TREINAMENTOS (SKILL MATRIX) E ALOCAÇÃO
    // ============================================================================

    /**
     * Executado pelo botão vermelho da aba Skill Matrix.
     */
    static async zerarTreinamentos(dados) {
        await pool.query("DELETE FROM alocacoes WHERE colaborador_id = $1", [dados.colaborador_id]);
    }

    static async salvarAlocacaoMultipla(dados) {
        let addCount = 0;

        // Loop pela array de postos enviados. Apenas adiciona se ele já não for treinado naquele posto.
        for (let pid of dados.postos_ids) {

            const check = await pool.query(
                "SELECT 1 FROM alocacoes WHERE colaborador_id = $1 AND produto_id = $2 AND posto_id = $3",
                [dados.colaborador_id, dados.produto_id, pid]
            );

            if (check.rows.length === 0) {
                await pool.query(
                    "INSERT INTO alocacoes (colaborador_id, produto_id, posto_id, turno) VALUES ($1, $2, $3, $4)",
                    [dados.colaborador_id, dados.produto_id, pid, dados.turno]
                );
                addCount++;
            }
        }
        return addCount;
    }

    static async excluirAlocacao(dados) {
        await pool.query("DELETE FROM alocacoes WHERE id = $1", [dados.id]);
    }

    /**
     * Tela de Transferência (Move o operador de um Líder para outro).
     */
    static async transferirOperador(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 1. Muda o líder e o turno base
            await client.query(
                "UPDATE colaboradores SET lider_id = $1, turno = $2 WHERE id = $3",
                [dados.novo_lider_id || null, dados.novo_turno, dados.colaborador_id]
            );

            // 2. Apaga os vínculos da linha antiga
            await client.query("DELETE FROM colaborador_linhas WHERE colaborador_id = $1", [dados.colaborador_id]);

            // 3. Associa a nova linha principal
            if (dados.nova_linha_id) {
                await client.query(
                    "INSERT INTO colaborador_linhas (colaborador_id, linha_id) VALUES ($1, $2)",
                    [dados.colaborador_id, dados.nova_linha_id]
                );
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
        // Upsert: Insere o valor do Yield. Se já existir, atualiza.
        await pool.query(`
            INSERT INTO colaborador_postos_yield (colaborador_id, produto_id, posto_id, classificacao) 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT (colaborador_id, produto_id, posto_id) 
            DO UPDATE SET classificacao = EXCLUDED.classificacao`,
            [dados.colaborador_id, dados.produto_id, dados.posto_id, dados.classificacao]
        );
    }

    // ============================================================================
    // PLANEJAMENTO DE HORA EXTRA (SALAS DE REUNIÃO)
    // ============================================================================

    static async syncPlanejamento(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Deleta tudo o que for de planejamento visual para não haver duplicatas
            await client.query("TRUNCATE TABLE planejamentos_he");

            // Insere linha por linha o que está ativo no React
            if (dados.rows && dados.rows.length > 0) {
                for (let row of dados.rows) {
                    await client.query("INSERT INTO planejamentos_he (dados) VALUES ($1)", [JSON.stringify(row)]);
                }
            }

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    // ============================================================================
    // GESTÃO DE ACESSOS (LDAP E PERFIS)
    // ============================================================================

    static async salvarUsuarioAcesso(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Upsert: Insere o usuário com login de rede. Se já existir, apenas muda o perfil.
            await client.query(`
                INSERT INTO usuarios_acesso (nome, login_ldap, perfil) 
                VALUES ($1, $2, $3) 
                ON CONFLICT (login_ldap) 
                DO UPDATE SET perfil = EXCLUDED.perfil`,
                [dados.nome, dados.login_ldap, dados.perfil]
            );

            // Inteligência extra: Se a pessoa se tornou Líder, adiciona ela na 
            // lista de Colaboradores para ela aparecer no filtro do painel.
            if (dados.perfil === 'LIDER') {
                const lCheck = await client.query("SELECT id FROM colaboradores WHERE nome = $1 AND cargo = 'Líder'", [dados.nome]);
                if (lCheck.rows.length === 0) {
                    await client.query("INSERT INTO colaboradores (nome, cargo) VALUES ($1, 'Líder')", [dados.nome]);
                }
            }

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    static async excluirUsuarioAcesso(dados) {
        await pool.query("DELETE FROM usuarios_acesso WHERE login_ldap = $1", [dados.login_ldap]);
    }

    // ============================================================================
    // RESET AUTOMÁTICO DE SAÍDAS ANTECIPADAS
    // ============================================================================

    /**
     * Executa o reset das Saídas Antecipadas:
     * - Limpa early_exit_time
     * - Se o operador tiver linhas de cobertura (colaborador_linhas), status_especial vira 'Polivalente'
     * - Caso contrário, status_especial = NULL
     */
    static async resetSaidasAntecipadas() {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Primeiro, atualiza os registros que têm linhas de cobertura
            await client.query(`
            UPDATE colaboradores c
            SET status_especial = 'Polivalente',
                early_exit_time = NULL
            WHERE c.status_especial = 'Saída Antecipada'
              AND EXISTS (
                  SELECT 1 FROM colaborador_linhas cl
                  WHERE cl.colaborador_id = c.id
              )
        `);

            // Depois, atualiza os que NÃO têm linhas de cobertura
            await client.query(`
            UPDATE colaboradores c
            SET status_especial = NULL,
                early_exit_time = NULL
            WHERE c.status_especial = 'Saída Antecipada'
              AND NOT EXISTS (
                  SELECT 1 FROM colaborador_linhas cl
                  WHERE cl.colaborador_id = c.id
              )
        `);

            await client.query('COMMIT');
            console.log(`[Reset Automático] Saídas Antecipadas removidas com sucesso.`);
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Erro ao resetar Saídas Antecipadas:', e);
            throw e;
        } finally {
            client.release();
        }
    }

    // ============================================================================
    // AUDITORIA (TRILHA INVISÍVEL)
    // ============================================================================

    static async registrarLog(login, acao, detalhes) {
        try {
            // Ação gravada passivamente, sem travar o painel se falhar.
            await pool.query(
                "INSERT INTO logs_auditoria (usuario_login, acao, detalhes) VALUES ($1, $2, $3)",
                [login, acao, JSON.stringify(detalhes)]
            );
        } catch (e) {
            console.error("Erro ao gravar log de auditoria:", e);
        }
    }

    // ============================================================================
    // LEITURA DE AUDITORIA (LOGS)
    // ============================================================================
    static async carregarLogs() {
        // Retorna os últimos 500 logs gravados por ordem de ID decrescente
        const res = await pool.query("SELECT * FROM logs_auditoria ORDER BY id DESC LIMIT 500");
        return res.rows;
    }
}


module.exports = DataModel;