const pool = require('../config/db');
const CoreModel = require('./CoreModel'); // Necessita da data correta do turno

class LaborModel {
    static async validarAcessoLider(colaborador_id, lider_id) {
        if (!lider_id) return true;
        const result = await pool.query('SELECT lider_id FROM colaboradores WHERE id = $1', [colaborador_id]);
        return result.rows.length > 0 && result.rows[0].lider_id === lider_id;
    }

static async salvarColaborador(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Inteligência: Criar o primeiro contrato formatado
            const hoje = new Date().toISOString().substring(0, 10);
            const primeiroContrato = [{
                vinculo: dados.vinculo || 'Efetivo',
                inicio: hoje,
                fim: null
            }];

            const result = await client.query(`
                INSERT INTO colaboradores (nome, cargo, lider_id, vinculo, turno, historico_contratos) 
                VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
                [
                    dados.nome, 
                    dados.cargo, 
                    dados.lider_id || null, 
                    dados.vinculo || null, 
                    dados.turno || 'T1',
                    JSON.stringify(primeiroContrato)
                ]
            );

            if (dados.cargo === 'Operador' && dados.linhas?.length > 0) {
                for (let linha_id of dados.linhas) {
                    await client.query("INSERT INTO colaborador_linhas (colaborador_id, linha_id) VALUES ($1, $2)", [result.rows[0].id, linha_id]);
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
            
            // 1. Remove o acesso ao sistema (se for um Líder)
            const liderInfo = await client.query("SELECT nome FROM colaboradores WHERE id = $1 AND cargo = 'Líder'", [dados.id]);
            if (liderInfo.rows.length) await client.query('DELETE FROM usuarios_acesso WHERE nome = $1', [liderInfo.rows[0].nome]);
            
            // 2. Remove o vínculo de liderança dos seus subordinados
            await client.query("UPDATE colaboradores SET lider_id = NULL WHERE lider_id = $1", [dados.id]);
            
            // 3. Remove alocações futuras/ativas da Skill Matrix (mas mantém o histórico de Yield)
            await client.query("DELETE FROM alocacoes WHERE colaborador_id = $1", [dados.id]);
            
            // 4. LÓGICA DE DESLIGAMENTO: Encerra o contrato com a data escolhida pelo RH
            const resultColab = await client.query("SELECT historico_contratos FROM colaboradores WHERE id = $1", [dados.id]);
            if (resultColab.rows.length > 0) {
                let historicoAtual = typeof resultColab.rows[0].historico_contratos === 'string' 
                    ? JSON.parse(resultColab.rows[0].historico_contratos) 
                    : (resultColab.rows[0].historico_contratos || []);
                
                // Se a data não vier do frontend por algum motivo, usa a de hoje por segurança
                const dataFim = dados.data_demissao || new Date().toISOString().substring(0, 10);
                
                for (let i = historicoAtual.length - 1; i >= 0; i--) {
                    if (historicoAtual[i].fim === null) {
                        historicoAtual[i].fim = dataFim;
                        break;
                    }
                }

                // Desativa o funcionário e grava a "foto" final do contrato
                await client.query(`
                    UPDATE colaboradores 
                    SET is_ativo = false, 
                        status_especial = 'Desligado',
                        historico_contratos = $2::jsonb 
                    WHERE id = $1`, 
                    [dados.id, JSON.stringify(historicoAtual)]
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

static async alterarStatus(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const check = await client.query(`SELECT status_especial, historico_faltas, historico_saidas FROM colaboradores WHERE id = $1`, [dados.id]);
            const status_banco = check.rows[0]?.status_especial;
            
            let hist_faltas = typeof check.rows[0]?.historico_faltas === 'string' ? JSON.parse(check.rows[0].historico_faltas) : (check.rows[0]?.historico_faltas || []);
            let hist_saidas = typeof check.rows[0]?.historico_saidas === 'string' ? JSON.parse(check.rows[0].historico_saidas) : (check.rows[0]?.historico_saidas || []);
            let novoStatus = dados.status_novo;

            if (!dados.is_explicit_update && dados.status_atual === dados.status_novo) novoStatus = null;

            // Limpa Skill Matrix se retornou de Afastamento
            if (status_banco === 'Afastamento / Licença' && novoStatus !== 'Afastamento / Licença') {
                await client.query("DELETE FROM alocacoes WHERE colaborador_id = $1", [dados.id]);
            }

            const vacStart = (novoStatus === 'Férias' && dados.vacation_start) ? dados.vacation_start : null;
            const vacEnd = (novoStatus === 'Férias' && dados.vacation_end) ? dados.vacation_end : null;
            const earlyExit = (novoStatus === 'Saída Antecipada' && dados.early_exit_time) ? dados.early_exit_time : null;
            const hoje = CoreModel.getHoje();

            if (novoStatus === 'Absenteísmo' && !hist_faltas.some(f => f.data === hoje)) {
                hist_faltas.push({ data: hoje, motivo: dados.absenteeismComment || '' });
            }

            // =======================================================
            // CORREÇÃO: GRAVAÇÃO DO HISTÓRICO DE SAÍDA ANTECIPADA
            // =======================================================
            if (novoStatus === 'Saída Antecipada') {
                let dataSaida = hoje;
                if (earlyExit) {
                    const [horaSaida, minutoSaida] = earlyExit.split(':').map(Number);
                    const agora = new Date();
                    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
                    const horaAtual = agora.getHours();

                    // Tratamento de turno para saídas da madrugada
                    if (horaAtual >= 5 && (horaSaida > 17 || (horaSaida === 17 && minutoSaida >= 48))) {
                        const ontem = new Date(hoje);
                        ontem.setDate(ontem.getDate() - 1);
                        dataSaida = ontem.toISOString().split('T')[0];
                    }
                }
                
                // Agora sim, empurramos (push) a saída para dentro do banco de dados!
                if (!hist_saidas.some(s => s.data === dataSaida)) {
                    hist_saidas.push({ data: dataSaida, horario: earlyExit, motivo: dados.earlyExitComment || dados.absenteeismComment || '' });
                }
            }

            await client.query(`UPDATE colaboradores SET status_especial = $1, vacation_start = $2, vacation_end = $3, early_exit_time = $4, historico_faltas = $5, historico_saidas = $6 WHERE id = $7`,
                [novoStatus, vacStart, vacEnd, earlyExit, JSON.stringify(hist_faltas), JSON.stringify(hist_saidas), dados.id]
            );
            await client.query("COMMIT");
        } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    }

    static async confirmarHE(dados) {
        const check = await pool.query("SELECT overtime_dates FROM colaboradores WHERE id = $1", [dados.id]);
        let dates = typeof check.rows[0]?.overtime_dates === 'string' ? JSON.parse(check.rows[0].overtime_dates) : (check.rows[0]?.overtime_dates || []);
        const hoje = CoreModel.getHoje();
        
        dates = dates.filter(h => (typeof h === 'string' ? h : h.data) >= hoje);
        if (!dates.some(d => d === dados.data_he || (d && d.data === dados.data_he))) {
            dates.push({ data: dados.data_he, desjejum: dados.desjejum || 'NÃO', refeicao: dados.refeicao || 'NÃO', transporte: dados.transporte || 'NÃO' });
            await pool.query("UPDATE colaboradores SET overtime_dates = $1 WHERE id = $2", [JSON.stringify(dates), dados.id]);
        }
    }

    static async removerHE(dados) {
        const check = await pool.query("SELECT overtime_dates FROM colaboradores WHERE id = $1", [dados.id]);
        let dates = typeof check.rows[0]?.overtime_dates === 'string' ? JSON.parse(check.rows[0].overtime_dates) : (check.rows[0]?.overtime_dates || []);
        const hoje = CoreModel.getHoje();
        
        dates = dates.filter(he => { const d = typeof he === 'string' ? he : he.data; return d >= hoje && d !== dados.data_he; });
        await pool.query("UPDATE colaboradores SET overtime_dates = $1 WHERE id = $2", [JSON.stringify(dates), dados.id]);
    }

    static async atualizarLinhasCobertura(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("DELETE FROM colaborador_linhas WHERE colaborador_id = $1", [dados.colaborador_id]);
            if (dados.linhas && dados.linhas.length > 0) {
                for (let nome of dados.linhas) {
                    const l = await client.query("SELECT id FROM linhas WHERE nome = $1", [nome]);
                    if (l.rows.length > 0) await client.query("INSERT INTO colaborador_linhas (colaborador_id, linha_id) VALUES ($1, $2)", [dados.colaborador_id, l.rows[0].id]);
                }
            }
            await client.query("COMMIT");
        } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    }

    static async resetSaidasAntecipadas() {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE colaboradores c SET status_especial = 'Polivalente', early_exit_time = NULL WHERE c.status_especial = 'Saída Antecipada' AND EXISTS (SELECT 1 FROM colaborador_linhas cl WHERE cl.colaborador_id = c.id)`);
            await client.query(`UPDATE colaboradores c SET status_especial = NULL, early_exit_time = NULL WHERE c.status_especial = 'Saída Antecipada' AND NOT EXISTS (SELECT 1 FROM colaborador_linhas cl WHERE cl.colaborador_id = c.id)`);
            await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }

    // ========================================================================
    // INTEGRAÇÕES EXTERNAS (APIs AVANÇADAS)
    // ========================================================================
    static async getAbsenteismoIntegracao(dataInicio, dataFim) {
        // 1. Puxa todos os operadores ativos que possuem algum histórico de faltas
        const result = await pool.query(`
            SELECT id, nome, turno, vinculo, historico_faltas, lider_id
            FROM colaboradores 
            WHERE is_ativo = true AND historico_faltas IS NOT NULL
        `);

        const dadosFinais = [];

        // 2. Varre os operadores e filtra o JSON interno de faltas por intervalo
        result.rows.forEach(op => {
            const faltas = typeof op.historico_faltas === 'string' 
                ? JSON.parse(op.historico_faltas) 
                : (op.historico_faltas || []);

            faltas.forEach(f => {
                if (!f || !f.data) return;

                let incluir = false;

                // Cenário A: Foi passado um intervalo completo (De / Até)
                if (dataInicio && dataFim) {
                    if (f.data >= dataInicio && f.data <= dataFim) incluir = true;
                }
                // Cenário B: Foi passada apenas uma data específica (Igualdade)
                else if (dataInicio && !dataFim) {
                    if (f.data === dataInicio) incluir = true;
                }
                // Cenário C: Nenhum parâmetro enviado, traz o dia de hoje por padrão
                else {
                    const hoje = CoreModel.getHoje();
                    if (f.data === hoje) incluir = true;
                }

                if (incluir) {
                    dadosFinais.push({
                        id_colaborador: op.id,
                        nome: op.nome,
                        turno: op.turno || 'T1',
                        vinculo: op.vinculo || 'Indefinido',
                        data_falta: f.data,
                        motivo: f.motivo || 'Sem justificativa no sistema'
                    });
                }
            });
        });

        // Ordena o resultado final por data mais recente e depois por nome
        dadosFinais.sort((a, b) => b.data_falta.localeCompare(a.data_falta) || a.nome.localeCompare(b.nome));

        return {
            filtros_aplicados: {
                data_inicio: dataInicio || CoreModel.getHoje(),
                data_fim: dataFim || dataInicio || CoreModel.getHoje(),
                tipo_busca: (dataInicio && dataFim) ? "INTERVALO" : (dataInicio ? "DATA_UNICA" : "PADRAO_HOJE")
            },
            total_registros: dadosFinais.length,
            dados: dadosFinais
        };
    }

// ========================================================================
    // PAINEL ANALÍTICO DO RH - ESTATÍSTICAS DE ABSENTEÍSMO (DIAS ÚTEIS DINÂMICOS)
    // ========================================================================
    static async getPainelAbsenteismoRH(dataInicio, dataFim) {
        if (!dataInicio) dataInicio = CoreModel.getHoje();
        if (!dataFim) dataFim = dataInicio;

        const isDiario = dataInicio === dataFim;

        // 1. Configura Datas e Período Anterior (Para a seta de tendência)
        const dI = new Date(dataInicio + 'T12:00:00Z');
        const dF = new Date(dataFim + 'T12:00:00Z');
        const totalDiasCorridos = Math.ceil(Math.abs(dF - dI) / (1000 * 60 * 60 * 24)) + 1;

        const dFPrev = new Date(dI);
        dFPrev.setDate(dFPrev.getDate() - 1);
        const dIPrev = new Date(dFPrev);
        dIPrev.setDate(dIPrev.getDate() - (totalDiasCorridos - 1));
        
        const dataInicioPrev = dIPrev.toISOString().substring(0, 10);
        const dataFimPrev = dFPrev.toISOString().substring(0, 10);

        // 2. Inteligência de Dias Úteis (Seg-Sex + Fins de semana com trabalho)
        const diasUteisAtual = new Set();
        let currA = new Date(dI);
        while (currA <= dF) {
            if (currA.getDay() !== 0 && currA.getDay() !== 6) diasUteisAtual.add(currA.toISOString().substring(0, 10));
            currA.setDate(currA.getDate() + 1);
        }

        const diasUteisAnterior = new Set();
        let currPrev = new Date(dIPrev);
        while (currPrev <= dFPrev) {
            if (currPrev.getDay() !== 0 && currPrev.getDay() !== 6) diasUteisAnterior.add(currPrev.toISOString().substring(0, 10));
            currPrev.setDate(currPrev.getDate() + 1);
        }

        const result = await pool.query(`
            SELECT c.id, c.nome, c.turno, c.vinculo, c.historico_faltas, l.nome as nome_lider
            FROM colaboradores c
            LEFT JOIN colaboradores l ON c.lider_id = l.id
            WHERE c.cargo = 'Operador'
        `);

        let totalFaltas = 0;
        let totalFaltasAnterior = 0;
        let faltasT1 = 0;
        let faltasT2 = 0;
        
        const distribuicaoDias = {}; 
        const distribuicaoLider = {}; 
        const distribuicaoMotivo = {}; 
        const distribuicaoVinculo = {}; 
        const distribuicaoDiaSemana = { 'Segunda-feira': 0, 'Terça-feira': 0, 'Quarta-feira': 0, 'Quinta-feira': 0, 'Sexta-feira': 0, 'Sábado': 0, 'Domingo': 0 };
        const diasSemanaNomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const registrosDetalheaders = [];

        result.rows.forEach(op => {
            const faltas = typeof op.historico_faltas === 'string' ? JSON.parse(op.historico_faltas) : (op.historico_faltas || []);

            faltas.forEach(f => {
                if (!f || !f.data) return;

                // Verifica período Anterior
                if (f.data >= dataInicioPrev && f.data <= dataFimPrev) {
                    totalFaltasAnterior++;
                    diasUteisAnterior.add(f.data); // Se teve falta no Sáb/Dom, o sistema valida como dia útil!
                }

                // Verifica período Atual
                if (f.data >= dataInicio && f.data <= dataFim) {
                    totalFaltas++;
                    diasUteisAtual.add(f.data); // Adiciona finais de semana com produção ao cálculo
                    
                    const turnoOp = op.turno || 'T1';
                    const nomeLider = op.nome_lider || 'Sem Líder Vinculado';
                    
                    let vinculoBase = op.vinculo ? op.vinculo.toUpperCase() : 'EF';
                    let vinculoOp = 'Efetivo (CLT / CTD)'; 
                    if (vinculoBase.includes('TEMP')) vinculoOp = 'Temporário';

                    let motivoFalta = (f.motivo || 'Sem Justificativa').trim();
                    if (motivoFalta.includes(' - ')) motivoFalta = motivoFalta.split(' - ')[0].trim();
                    if (motivoFalta.length > 30) motivoFalta = motivoFalta.substring(0, 30) + '...';

                    if (turnoOp === 'T2') faltasT2++;
                    else faltasT1++;

                    distribuicaoDias[f.data] = (distribuicaoDias[f.data] || 0) + 1;

                    const [ano, mes, dia] = f.data.split('-');
                    const dataObj = new Date(ano, mes - 1, dia);
                    const nomeDia = diasSemanaNomes[dataObj.getDay()];
                    distribuicaoDiaSemana[nomeDia]++;

                    distribuicaoLider[nomeLider] = (distribuicaoLider[nomeLider] || 0) + 1;
                    distribuicaoMotivo[motivoFalta] = (distribuicaoMotivo[motivoFalta] || 0) + 1;
                    distribuicaoVinculo[vinculoOp] = (distribuicaoVinculo[vinculoOp] || 0) + 1;

                    registrosDetalheaders.push({
                        id_colaborador: op.id,
                        nome: op.nome,
                        turno: turnoOp,
                        vinculo: vinculoOp,
                        vinculo_original: vinculoBase, 
                        lider: nomeLider,
                        data: f.data,
                        motivo: f.motivo || 'Sem Justificativa'
                    });
                }
            });
        });

        // 3. Cálculos de KPI protegidos (Evitar divisão por zero)
        const countOpsResult = await pool.query("SELECT COUNT(*) FROM colaboradores WHERE cargo = 'Operador' AND is_ativo = true");
        const headcountAtivo = parseInt(countOpsResult.rows[0].count, 10) || 1;

        const qtdDiasUteisAtual = diasUteisAtual.size > 0 ? diasUteisAtual.size : 1;
        const qtdDiasUteisPrev = diasUteisAnterior.size > 0 ? diasUteisAnterior.size : 1;

        const taxaMediaAbsenteismo = parseFloat(((totalFaltas / (headcountAtivo * qtdDiasUteisAtual)) * 100).toFixed(2));
        const taxaAnterior = parseFloat(((totalFaltasAnterior / (headcountAtivo * qtdDiasUteisPrev)) * 100).toFixed(2));
        const diferencaTaxa = parseFloat((taxaMediaAbsenteismo - taxaAnterior).toFixed(2));

        const taxaDiaria = {};
        Object.keys(distribuicaoDias).forEach(dia => {
            taxaDiaria[dia] = parseFloat(((distribuicaoDias[dia] / headcountAtivo) * 100).toFixed(2));
        });

        const porcetagemT1 = totalFaltas > 0 ? parseFloat(((faltasT1 / totalFaltas) * 100).toFixed(1)) : 0;
        const porcetagemT2 = totalFaltas > 0 ? parseFloat(((faltasT2 / totalFaltas) * 100).toFixed(1)) : 0;

        const motivosOrdenados = Object.entries(distribuicaoMotivo).sort((a,b) => b[1] - a[1]);
        const motivosTop = {};
        let somaOutros = 0;
        motivosOrdenados.forEach((m, idx) => {
            if (idx < 6) motivosTop[m[0]] = m[1];
            else somaOutros += m[1];
        });
        if (somaOutros > 0) motivosTop['Outros Motivos Menores'] = somaOutros;

        return {
            filtros: { data_inicio: dataInicio, data_fim: dataFim, dias_analisados: qtdDiasUteisAtual },
            is_diario: isDiario,
            kpis: {
                total_faltas: totalFaltas,
                headcount_base: headcountAtivo,
                taxa_media_periodo: taxaMediaAbsenteismo,
                taxa_anterior: taxaAnterior,
                diferenca_taxa: diferencaTaxa,
                turno_maior_indice: faltasT2 > faltasT1 ? 'Turno 2' : (faltasT1 > faltasT2 ? 'Turno 1' : 'Empate')
            },
            turnos: { t1_total: faltasT1, t1_porcentagem: porcetagemT1, t2_total: faltasT2, t2_porcentagem: porcetagemT2 },
            grafico_taxa_diaria: taxaDiaria,
            grafico_dia_semana: distribuicaoDiaSemana,
            grafico_motivos: motivosTop,
            grafico_vinculo: distribuicaoVinculo,
            grafico_lideres: distribuicaoLider,
            tabela_detalhada: registrosDetalheaders.sort((a, b) => b.data.localeCompare(a.data))
        };
    }
    
    static async lancamentoRetroativoAbsenteismo(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            
            const { colaborador_id, data_falta, motivo } = dados;
            
            // 1. Pega o histórico atual do operador
            const result = await client.query("SELECT historico_faltas FROM colaboradores WHERE id = $1", [colaborador_id]);
            if (result.rows.length === 0) throw new Error("Colaborador não encontrado.");
            
            let historico = typeof result.rows[0].historico_faltas === 'string' 
                ? JSON.parse(result.rows[0].historico_faltas) 
                : (result.rows[0].historico_faltas || []);
            
            // 2. Verifica se já existe falta nessa data. Se sim, atualiza; se não, adiciona.
            const indexExistente = historico.findIndex(f => f.data === data_falta);
            if (indexExistente >= 0) {
                historico[indexExistente].motivo = motivo;
            } else {
                historico.push({ data: data_falta, motivo: motivo });
            }
            
            // 3. Ordena o histórico pelas datas mais recentes
            historico.sort((a, b) => b.data.localeCompare(a.data));

            // 4. Salva a injeção diretamente no banco sem alterar o status do dia de hoje
            await client.query(
                "UPDATE colaboradores SET historico_faltas = $1::jsonb WHERE id = $2",
                [JSON.stringify(historico), colaborador_id]
            );
            
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    static async removerAbsenteismo(dados) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const { colaborador_id, data_falta } = dados;

            // 1. Pega o histórico atual
            const result = await client.query("SELECT historico_faltas FROM colaboradores WHERE id = $1", [colaborador_id]);
            if (result.rows.length === 0) throw new Error("Colaborador não encontrado.");

            let historico = typeof result.rows[0].historico_faltas === 'string' 
                ? JSON.parse(result.rows[0].historico_faltas) 
                : (result.rows[0].historico_faltas || []);

            // 2. Filtra o histórico removendo exatamente a data solicitada
            const historicoFiltrado = historico.filter(f => f.data !== data_falta);

            // 3. Atualiza o JSON no banco de dados
            await client.query(
                "UPDATE colaboradores SET historico_faltas = $1::jsonb WHERE id = $2",
                [JSON.stringify(historicoFiltrado), colaborador_id]
            );

            // 4. BÓNUS: Se a falta apagada for de HOJE, removemos o status de ausente da tela da fábrica!
const hoje = new Date().toISOString().substring(0, 10);
            if (data_falta === hoje) {
                await client.query("UPDATE colaboradores SET status_especial = NULL WHERE id = $1 AND status_especial = 'Absenteísmo'", [colaborador_id]);
            }

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

}
module.exports = LaborModel;