import React, { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

// ============================================================================
// CONFIGURAÇÃO DO WEBSOCKET
// ============================================================================
const currentHost = window.location.hostname;
const socket = io(`http://${currentHost}:5008`, {
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement);

// ============================================================================
// PLUGINS CUSTOMIZADOS PARA GRÁFICOS
// ============================================================================
const percentagePlugin = {
    id: 'percentagePlugin',
    afterDraw: (chart) => {
        if (chart.config.type !== 'doughnut') return;
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden) return;
            
            const total = dataset.data.reduce((a, b) => a + b, 0);
            if (total === 0) return;

            meta.data.forEach((arc, index) => {
                const value = dataset.data[index];
                if (value > 0) {
                    const percent = ((value / total) * 100).toFixed(0) + '%';
                    const { x, y } = arc.tooltipPosition();
                    
                    ctx.save();
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 3;
                    ctx.fillText(percent, x, y);
                    ctx.restore();
                }
            });
        });
    }
};

const barValuePlugin = {
    id: 'barValuePlugin',
    afterDatasetsDraw: (chart) => {
        if (chart.config.type !== 'bar') return;
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden) return;
            
            meta.data.forEach((bar, index) => {
                const value = dataset.data[index];
                if (value > 0) {
                    ctx.save();
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    
                    const isStacked = chart.options.scales.x.stacked;
                    const yPos = isStacked ? bar.y + (bar.height / 2) + 4 : bar.y - 4;
                    
                    ctx.fillStyle = isStacked ? 'white' : '#2c3e50';
                    ctx.shadowColor = isStacked ? 'rgba(0,0,0,0.4)' : 'transparent';
                    ctx.shadowBlur = isStacked ? 2 : 0;
                    ctx.fillText(value, bar.x, yPos);
                    ctx.restore();
                }
            });
        });
    }
};

// ============================================================================
// FUNÇÕES AUXILIARES DE DATA E TURNO (BLINDADAS)
// ============================================================================
const getHojeLocal = () => {
    const spTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    if (spTime.getHours() < 5) {
        spTime.setDate(spTime.getDate() - 1);
    }
    const yyyy = spTime.getFullYear();
    const mm = String(spTime.getMonth() + 1).padStart(2, '0');
    const dd = String(spTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const formatDateString = (dateStr) => {
    if (!dateStr) return 'Sem previsão';
    const justDate = dateStr.split('T')[0];
    return justDate.split('-').reverse().join('/');
};

// ============================================================================
// COMPONENTE PRINCIPAL: DASHBOARD
// ============================================================================
export default function Dashboard() {
    const [db, setDb] = useState({ operadores: [], alocacoes: [], postos: [] });
    const [lastUpdate, setLastUpdate] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalInfo, setModalInfo] = useState({ isOpen: false, titulo: '', cor: '', lista: [] });
    const [downloadModal, setDownloadModal] = useState({ isOpen: false, type: '', dateStart: '', dateEnd: '' });
    const [activeStatusFilter, setActiveStatusFilter] = useState(null);
    const [downloading, setDownloading] = useState(false);

    const [absState, setAbsState] = useState({ level: 'month', month: null, week: null });
    const [exitState, setExitState] = useState({ level: 'month', month: null, week: null });

    const carregarDados = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/carregar_tudo');
            setDb(res.data);
            setLastUpdate(new Date().toLocaleTimeString('pt-BR'));
        } catch (e) {
            console.error('Erro ao carregar dados:', e);
            setError('Não foi possível carregar os dados. Verifique sua conexão com o servidor.');
            toast.error('Erro ao carregar o painel.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        carregarDados();
        socket.on('dados_atualizados', () => carregarDados());
        return () => {
            socket.off('dados_atualizados');
        };
    }, [carregarDados]);

    const operadores = useMemo(() => db.operadores || [], [db.operadores]);
    const alocacoes = useMemo(() => db.alocacoes || [], [db.alocacoes]);

    const {
        laborEfetivoList,
        absenteismoList,
        saidaList,
        feriasList,
        alocadosList,
        heList,
        dataStatus,
        dataVinculo,
        dataLideres,
        dataAbsHistory,
        dataExitHistory,
        alertasRH,
        alertasSkillGap
    } = useMemo(() => {
        const hojeStr = getHojeLocal();
        const currentMonthPrefix = hojeStr.substring(0, 7); 

        const laborEfetivoList = operadores.filter(op => 
            op.status_especial !== "Afastamento / Licença" && 
            op.status_especial !== "Afastamento/Licença"
        );

        const absenteismoList = operadores
            .filter(op => op.status_especial === 'Absenteísmo')
            .map(op => {
                const faltaHoje = (op.historicoFaltas || []).find(f => f?.data === hojeStr);
                return {
                    ...op,
                    detalhe: "Falta Ativa",
                    motivoTxt: faltaHoje?.motivo ? `Motivo: ${faltaHoje.motivo}` : "Sem justificativa lançada"
                };
            });

        const saidaList = operadores
            .filter(op => op.status_especial === 'Saída Antecipada')
            .map(op => {
                const saidaHoje = (op.historicoSaidas || []).find(s => s?.data === hojeStr);
                return {
                    ...op,
                    detalhe: op.early_exit_time ? `Saiu às ${op.early_exit_time}` : 'Horário não informado',
                    motivoTxt: saidaHoje?.motivo ? `Justificativa: ${saidaHoje.motivo}` : null
                };
            });

        const feriasList = operadores.filter(op => op.status_especial === 'Férias');

        const alocadosList = laborEfetivoList.filter(op => 
            !['Absenteísmo', 'Saída Antecipada', 'Férias'].includes(op.status_especial) && 
            (alocacoes.some(a => String(a.colaborador_id) === String(op.id)) || 
             (op.linhas_vinculadas || []).some(l => l?.startsWith('Suporte')))
        );

        const heList = [];
        operadores.forEach(op => {
            if (op.overtimeDates && op.overtimeDates.length > 0) {
                const datasStr = op.overtimeDates.map(he => {
                    const dataRaw = typeof he === 'string' ? he : he?.data;
                    return formatDateString(dataRaw);
                }).join(', ');
                heList.push({ ...op, detalhe: `Agendado para: ${datasStr}` });
            }
        });

        const alertasRH = [];
        operadores.forEach(op => {
            const faltasMes = (op.historicoFaltas || []).filter(f => f?.data?.startsWith(currentMonthPrefix)).length;
            const saidasMes = (op.historicoSaidas || []).filter(s => s?.data?.startsWith(currentMonthPrefix)).length;
            const totalOcorrencias = faltasMes + saidasMes;

            if (totalOcorrencias >= 2) { 
                alertasRH.push({ ...op, faltasMes, saidasMes, totalOcorrencias });
            }
        });
        alertasRH.sort((a, b) => b.totalOcorrencias - a.totalOcorrencias);

        const alertasSkillGap = [];
        const postosComAlocacao = [...new Set(alocacoes.map(a => a.posto_id))];

        postosComAlocacao.forEach(postoId => {
            const alocacoesDoPosto = alocacoes.filter(a => String(a.posto_id) === String(postoId));
            const idsOperadoresAlocados = alocacoesDoPosto.map(a => String(a.colaborador_id));

            const operadoresDisponiveis = operadores.filter(op => 
                idsOperadoresAlocados.includes(String(op.id)) && 
                !['Absenteísmo', 'Férias', 'Afastamento / Licença', 'Afastamento/Licença'].includes(op.status_especial)
            );

            if (operadoresDisponiveis.length === 0 && idsOperadoresAlocados.length > 0) {
                const nomePosto = alocacoesDoPosto[0]?.posto || 'Desconhecido';
                const nomeProduto = alocacoesDoPosto[0]?.produto || 'Desconhecido';
                alertasSkillGap.push({ postoId, nomePosto, nomeProduto, totalAlocados: idsOperadoresAlocados.length });
            }
        });

        const countsStatus = { operacionais: 0, suporte: 0, ferias: feriasList.length, absenteismo: absenteismoList.length, afastamento: 0, saida: saidaList.length };
        const lideresMap = {};

        operadores.forEach(op => {
            const isSuporte = (op.linhas_vinculadas || []).some(l => l?.startsWith("Suporte"));
            
            if (op.status_especial === "Afastamento / Licença" || op.status_especial === "Afastamento/Licença") {
                countsStatus.afastamento++;
            } else if (!op.status_especial || op.status_especial === "Polivalente") {
                if (isSuporte) countsStatus.suporte++;
                else countsStatus.operacionais++;
            }

            const l = op.nome_lider || "Sem Líder";
            if (!lideresMap[l]) lideresMap[l] = { operacionais: 0, suporte: 0, ferias: 0, abs: 0, saida: 0, afastamento: 0, totalOperacional: 0 };
            
            if (op.status_especial === "Afastamento / Licença" || op.status_especial === "Afastamento/Licença") {
                lideresMap[l].afastamento++;
            } else if (op.status_especial === "Férias") {
                lideresMap[l].ferias++;
                lideresMap[l].totalOperacional++;
            } else if (op.status_especial === "Absenteísmo") {
                lideresMap[l].abs++;
                lideresMap[l].totalOperacional++;
            } else if (op.status_especial === "Saída Antecipada") {
                lideresMap[l].saida++;
                lideresMap[l].totalOperacional++;
            } else if (!op.status_especial || op.status_especial === "Polivalente") {
                if (isSuporte) lideresMap[l].suporte++;
                else {
                    lideresMap[l].operacionais++;
                    lideresMap[l].totalOperacional++;
                }
            }
        });

        const dataStatus = {
            labels: ['Operadores / Poli', 'Suporte Geral', 'Férias', 'Absenteísmo', 'Afastamento', 'Saída Antecipada'],
            datasets: [{ 
                data: [countsStatus.operacionais, countsStatus.suporte, countsStatus.ferias, countsStatus.absenteismo, countsStatus.afastamento, countsStatus.saida], 
                backgroundColor: ['#27ae60', '#8e44ad', '#3498db', '#e74c3c', '#7f8c8d', '#e67e22'] 
            }]
        };

const countsVinculo = { efetivos: 0, temp: 0 };
        laborEfetivoList.forEach(op => {
            const v = op.vinculo ? op.vinculo.toUpperCase() : 'EF';
            
            // Procura o pedaço "TEMP" para as agências
            if (v.includes('TEMP')) {
                countsVinculo.temp++;
            } else {
                countsVinculo.efetivos++;
            }
        });
        
        const dataVinculo = {
            labels: ['Efetivos (CLT / CTD)', 'Temporários'],
            datasets: [{ 
                data: [countsVinculo.efetivos, countsVinculo.temp], 
                backgroundColor: ['#27ae60', '#e67e22'] 
            }]
        };

        const lideresNomes = Object.keys(lideresMap).sort((a,b) => lideresMap[b].totalOperacional - lideresMap[a].totalOperacional);
        let datasetsLider = [
            { label: 'Operadores / Poli', data: lideresNomes.map(l => lideresMap[l].operacionais), backgroundColor: '#27ae60' },
            { label: 'Férias', data: lideresNomes.map(l => lideresMap[l].ferias), backgroundColor: '#3498db' },
            { label: 'Absenteísmo', data: lideresNomes.map(l => lideresMap[l].abs), backgroundColor: '#e74c3c' },
            { label: 'Saída Antecipada', data: lideresNomes.map(l => lideresMap[l].saida), backgroundColor: '#e67e22' }
        ];
        if (activeStatusFilter) {
            const filterMap = { 'Operadores / Poli': 'Operadores / Poli', 'Férias': 'Férias', 'Absenteísmo': 'Absenteísmo', 'Saída Antecipada': 'Saída Antecipada' };
            if (filterMap[activeStatusFilter]) datasetsLider = datasetsLider.filter(ds => ds.label === filterMap[activeStatusFilter]);
        }
        const dataLideres = { labels: lideresNomes, datasets: datasetsLider };

        let absCounts = {};
        operadores.forEach(op => {
            const t = op.turno || 'T1';
            const datasFalta = new Set((op.historicoFaltas || []).filter(f => f && f.data).map(f => f.data));
            if (op.status_especial === 'Absenteísmo') datasFalta.add(hojeStr);
            datasFalta.forEach(dataFalta => {
                if (dataFalta && dataFalta.length >= 10) {
                    const month = dataFalta.substring(0, 7);
                    const day = parseInt(dataFalta.substring(8, 10), 10);
                    if (absState.level === 'month') {
                        if (!absCounts[month]) absCounts[month] = { T1: 0, T2: 0 };
                        absCounts[month][t]++;
                    } else if (absState.level === 'week' && month === absState.month) {
                        let w = "Semana 5 (29+)";
                        if (day <= 7) w = "Semana 1 (1-7)";
                        else if (day <= 14) w = "Semana 2 (8-14)";
                        else if (day <= 21) w = "Semana 3 (15-21)";
                        else if (day <= 28) w = "Semana 4 (22-28)";
                        if (!absCounts[w]) absCounts[w] = { T1: 0, T2: 0 };
                        absCounts[w][t]++;
                    } else if (absState.level === 'day' && month === absState.month) {
                        let inRange = false;
                        if (absState.week.includes("1-7") && day >= 1 && day <= 7) inRange = true;
                        else if (absState.week.includes("8-14") && day >= 8 && day <= 14) inRange = true;
                        else if (absState.week.includes("15-21") && day >= 15 && day <= 21) inRange = true;
                        else if (absState.week.includes("22-28") && day >= 22 && day <= 28) inRange = true;
                        else if (absState.week.includes("29+") && day >= 29) inRange = true;
                        if (inRange) {
                            if (!absCounts[dataFalta]) absCounts[dataFalta] = { T1: 0, T2: 0 };
                            absCounts[dataFalta][t]++;
                        }
                    }
                }
            });
        });
        
        let absLabels, absDataT1, absDataT2;
        if (absState.level === 'week') {
            absLabels = ["Semana 1 (1-7)", "Semana 2 (8-14)", "Semana 3 (15-21)", "Semana 4 (22-28)", "Semana 5 (29+)"];
            absLabels.forEach(l => { if (!absCounts[l]) absCounts[l] = { T1: 0, T2: 0 }; });
        } else {
            absLabels = Object.keys(absCounts).sort();
        }
        absDataT1 = absLabels.map(l => absCounts[l]?.T1 || 0);
        absDataT2 = absLabels.map(l => absCounts[l]?.T2 || 0);
        const dataAbsHistory = { 
            labels: absLabels.length > 0 ? absLabels : ['Sem Faltas'], 
            datasets: [ { label: 'Turno 1', data: absLabels.length > 0 ? absDataT1 : [0], backgroundColor: '#e74c3c', borderRadius: 4 }, { label: 'Turno 2', data: absLabels.length > 0 ? absDataT2 : [0], backgroundColor: '#922b21', borderRadius: 4 } ] 
        };

        let exitCounts = {};
        operadores.forEach(op => {
            const t = op.turno || 'T1';
            const datasSaida = new Set((op.historicoSaidas || []).filter(s => s && s.data).map(s => s.data));
            if (op.status_especial === 'Saída Antecipada') datasSaida.add(hojeStr);
            datasSaida.forEach(dataSaida => {
                if (dataSaida && dataSaida.length >= 10) {
                    const month = dataSaida.substring(0, 7);
                    const day = parseInt(dataSaida.substring(8, 10), 10);
                    if (exitState.level === 'month') {
                        if (!exitCounts[month]) exitCounts[month] = { T1: 0, T2: 0 };
                        exitCounts[month][t]++;
                    } else if (exitState.level === 'week' && month === exitState.month) {
                        let w = "Semana 5 (29+)";
                        if (day <= 7) w = "Semana 1 (1-7)";
                        else if (day <= 14) w = "Semana 2 (8-14)";
                        else if (day <= 21) w = "Semana 3 (15-21)";
                        else if (day <= 28) w = "Semana 4 (22-28)";
                        if (!exitCounts[w]) exitCounts[w] = { T1: 0, T2: 0 };
                        exitCounts[w][t]++;
                    } else if (exitState.level === 'day' && month === exitState.month) {
                        let inRange = false;
                        if (exitState.week.includes("1-7") && day >= 1 && day <= 7) inRange = true;
                        else if (exitState.week.includes("8-14") && day >= 8 && day <= 14) inRange = true;
                        else if (exitState.week.includes("15-21") && day >= 15 && day <= 21) inRange = true;
                        else if (exitState.week.includes("22-28") && day >= 22 && day <= 28) inRange = true;
                        else if (exitState.week.includes("29+") && day >= 29) inRange = true;
                        if (inRange) {
                            if (!exitCounts[dataSaida]) exitCounts[dataSaida] = { T1: 0, T2: 0 };
                            exitCounts[dataSaida][t]++;
                        }
                    }
                }
            });
        });
        
        let exitLabels, exitDataT1, exitDataT2;
        if (exitState.level === 'week') {
            exitLabels = ["Semana 1 (1-7)", "Semana 2 (8-14)", "Semana 3 (15-21)", "Semana 4 (22-28)", "Semana 5 (29+)"];
            exitLabels.forEach(l => { if (!exitCounts[l]) exitCounts[l] = { T1: 0, T2: 0 }; });
        } else {
            exitLabels = Object.keys(exitCounts).sort();
        }
        exitDataT1 = exitLabels.map(l => exitCounts[l]?.T1 || 0);
        exitDataT2 = exitLabels.map(l => exitCounts[l]?.T2 || 0);
        const dataExitHistory = { 
            labels: exitLabels.length > 0 ? exitLabels : ['Sem Saídas'], 
            datasets: [ { label: 'Turno 1', data: exitLabels.length > 0 ? exitDataT1 : [0], backgroundColor: '#e67e22', borderRadius: 4 }, { label: 'Turno 2', data: exitLabels.length > 0 ? exitDataT2 : [0], backgroundColor: '#a04000', borderRadius: 4 } ] 
        };

        return {
            laborEfetivoList, absenteismoList, saidaList, feriasList, alocadosList, heList, dataStatus, dataVinculo, dataLideres, dataAbsHistory, dataExitHistory, alertasRH, alertasSkillGap
        };
    }, [operadores, alocacoes, activeStatusFilter, absState, exitState]);

    const baixarRelatorioExcel = async () => {
        try {
            const toastId = toast.loading('A gerar relatório Excel...');
            const res = await api.get('/exportar_excel', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `VisaoGeral_LaborList_${getHojeLocal()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Excel descarregado com sucesso!', { id: toastId });
        } catch (e) { toast.error("Erro ao gerar o relatório."); }
    };

    const baixarListaModal = () => {
        if (!modalInfo.lista.length) return;
        setDownloading(true);
        try {
            const dadosPlanilha = modalInfo.lista.map(op => ({
                NOME: op.nome, LIDER: op.nome_lider || 'Sem Líder', TURNO: op.turno || 'T1', LINHAS: (op.linhas_vinculadas || []).join(', '), DETALHE: op.detalhe || '', JUSTIFICATIVA: op.motivoTxt || ''
            }));
            const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, modalInfo.titulo);
            ws['!cols'] = [{wch:30}, {wch:25}, {wch:30}, {wch:10}, {wch:40}, {wch:50}];
            XLSX.writeFile(wb, `Lista_${modalInfo.titulo.replace(/\s+/g, '_')}.xlsx`);
        } catch (e) { toast.error('Erro ao gerar o arquivo Excel.'); } finally { setDownloading(false); }
    };

    const abrirModalDownload = (tipo) => { 
        const hoje = getHojeLocal();
        setDownloadModal({ isOpen: true, type: tipo, dateStart: hoje, dateEnd: hoje }); 
    };

    const baixarCronogramaFerias = (e) => {
        e.stopPropagation();
        if (feriasList.length === 0) return toast.error('Ninguém de férias no momento.');
        
        const feriasOrdenadas = [...feriasList].sort((a, b) => (a.vacation_end || '9999') > (b.vacation_end || '9999') ? 1 : -1);
        const dados = feriasOrdenadas.map(op => ({
            NOME: op.nome,
            LIDER: op.nome_lider || 'Sem Líder',
            RETORNO: op.vacation_end ? formatDateString(op.vacation_end) : 'Sem previsão',
            LINHAS: (op.linhas_vinculadas || []).join(', ')
        }));
        
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Cronograma de Férias");
        ws['!cols'] = [{wch:30}, {wch:25}, {wch:15}, {wch:30}];
        XLSX.writeFile(wb, `Cronograma_Ferias_${getHojeLocal()}.xlsx`);
    };

    const baixarCronogramaHE = (e) => {
        e.stopPropagation();
        if (heList.length === 0) return toast.error('Nenhuma hora extra agendada.');
        
        const dados = heList.map(op => ({
            NOME: op.nome,
            LIDER: op.nome_lider || 'Sem Líder',
            TURNO: op.turno || 'T1',
            DATAS_AGENDADAS: op.overtimeDates.map(h => formatDateString(typeof h === 'string' ? h : h.data)).join(', ')
        }));
        
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Horas Extras");
        ws['!cols'] = [{wch:30}, {wch:25}, {wch:10}, {wch:40}];
        XLSX.writeFile(wb, `Cronograma_HE_${getHojeLocal()}.xlsx`);
    };

    const baixarRelatorioLogistica = (e) => {
        e.stopPropagation();
        if (heList.length === 0) return toast.error('Nenhuma HE agendada no momento.');

        const resumo = {};
        const hoje = getHojeLocal();

        heList.forEach(op => {
            (op.overtimeDates || []).forEach(he => {
                const dataStr = typeof he === 'string' ? he : he.data;
                if (dataStr < hoje) return; 
                
                const turno = op.turno || 'T1';
                const key = `${dataStr}_${turno}`;
                
                if (!resumo[key]) {
                    resumo[key] = { Data: formatDateString(dataStr), Turno: turno, Transporte: 0, Refeicao: 0, Desjejum: 0, DataOriginal: dataStr };
                }
                
                if (he.transporte === 'SIM') resumo[key].Transporte++;
                if (he.refeicao === 'SIM') resumo[key].Refeicao++;
                if (he.desjejum === 'SIM') resumo[key].Desjejum++;
            });
        });

        const dadosArray = Object.values(resumo);
        if(dadosArray.length === 0) return toast.error('Nenhuma logística necessária para as HEs ativas.');

        dadosArray.sort((a,b) => a.DataOriginal.localeCompare(b.DataOriginal));
        const dadosFinais = dadosArray.map(({DataOriginal, ...resto}) => resto);

        const ws = XLSX.utils.json_to_sheet(dadosFinais);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Logística Transporte-Alimentação");
        ws['!cols'] = [{wch:15}, {wch:10}, {wch:15}, {wch:15}, {wch:15}];
        XLSX.writeFile(wb, `Logistica_HE_${hoje}.xlsx`);
    };

    const executarDownloadData = () => {
        const { type, dateStart, dateEnd } = downloadModal;
        if (!dateStart || !dateEnd) return toast.error("Selecione a data de início e fim!");
        if (dateStart > dateEnd) return toast.error("A data de início não pode ser maior que a data de fim!");

        setDownloading(true);
        try {
            const hojeStr = getHojeLocal();
            const rangeIncludesHoje = hojeStr >= dateStart && hojeStr <= dateEnd;
            let dadosPlanilha = [];
            
            if (type === 'abs') {
                operadores.forEach(op => {
                    if (rangeIncludesHoje && op.status_especial === "Absenteísmo") {
                        let faltaHoje = (op.historicoFaltas || []).find(f => f?.data === hojeStr);
                        dadosPlanilha.push({ NOME: op.nome, LIDER: op.nome_lider || 'Sem Líder', LINHA: (op.linhas_vinculadas || []).join(', '), TURNO: op.turno || 'T1', DATA: hojeStr, MOTIVO: faltaHoje?.motivo || 'Falta Atual sem Justificativa' });
                    } 
                    if (op.historicoFaltas) {
                        op.historicoFaltas.forEach(f => {
                            if (f?.data >= dateStart && f?.data <= dateEnd) {
                                if (!(rangeIncludesHoje && f?.data === hojeStr && op.status_especial === "Absenteísmo")) {
                                    dadosPlanilha.push({ NOME: op.nome, LIDER: op.nome_lider || 'Sem Líder', LINHA: (op.linhas_vinculadas || []).join(', '), TURNO: op.turno || 'T1', DATA: f.data, MOTIVO: f.motivo || '' });
                                }
                            }
                        });
                    }
                });
            } else if (type === 'saida') {
                operadores.forEach(op => {
                    if (rangeIncludesHoje && op.status_especial === "Saída Antecipada") {
                        let saidaHoje = (op.historicoSaidas || []).find(s => s?.data === hojeStr);
                        dadosPlanilha.push({ NOME: op.nome, LIDER: op.nome_lider || 'Sem Líder', LINHA: (op.linhas_vinculadas || []).join(', '), TURNO: op.turno || 'T1', DATA: hojeStr, HORARIO: op.early_exit_time || '', MOTIVO: saidaHoje?.motivo || 'Saída Atual sem Justificativa' });
                    } 
                    if (op.historicoSaidas) {
                        op.historicoSaidas.forEach(s => {
                            if (s?.data >= dateStart && s?.data <= dateEnd) {
                                if (!(rangeIncludesHoje && s?.data === hojeStr && op.status_especial === "Saída Antecipada")) {
                                    dadosPlanilha.push({ NOME: op.nome, LIDER: op.nome_lider || 'Sem Líder', LINHA: (op.linhas_vinculadas || []).join(', '), TURNO: op.turno || 'T1', DATA: s.data, HORARIO: s.horario || '', MOTIVO: s.motivo || '' });
                                }
                            }
                        });
                    }
                });
            }

            if (dadosPlanilha.length === 0) {
                toast.error("Nenhum registro encontrado para o período selecionado.");
                return;
            }

            const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
            const wb = XLSX.utils.book_new();
            const sheetName = type === 'abs' ? 'Histórico de Absenteísmo' : 'Histórico de Saídas';
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            ws['!cols'] = [{wch:30}, {wch:25}, {wch:30}, {wch:10}, {wch:12}, {wch:12}, {wch:50}];
            XLSX.writeFile(wb, type === 'abs' ? `Historico_Absenteismo_${dateStart}_a_${dateEnd}.xlsx` : `Historico_Saidas_${dateStart}_a_${dateEnd}.xlsx`);
        } catch (e) { toast.error('Erro ao gerar o arquivo Excel.'); } finally { setDownloading(false); setDownloadModal({ isOpen: false, type: '', dateStart: '', dateEnd: '' }); }
    };

    const abrirModal = (titulo, cor, listaBruta) => { 
        if (titulo === 'Férias') {
            listaBruta = [...listaBruta].sort((a, b) => (a.vacation_end || '9999') > (b.vacation_end || '9999') ? 1 : -1).map(op => ({
                ...op,
                detalhe: op.vacation_end ? `Retorno: ${formatDateString(op.vacation_end)}` : 'Sem data de retorno'
            }));
        }
        setModalInfo({ isOpen: true, titulo, cor, lista: listaBruta }); 
    };

    if (loading) {
        return (
            <div className="page">
                <div className="stats-bar" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="spinner" style={{ width: '50px', height: '50px', border: '5px solid #f3f3f3', borderTop: '5px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
                        <p>Carregando dados do dashboard...</p>
                    </div>
                </div>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (error && !loading) {
        return (
            <div className="page">
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <div style={{ fontSize: '3em', marginBottom: '20px' }}>⚠️</div>
                    <h3>Erro ao carregar dados</h3>
                    <p>{error}</p>
                    <button onClick={carregarDados} style={{ background: '#3498db', marginTop: '20px' }}>Tentar novamente</button>
                </div>
            </div>
        );
    }

    const totalLabor = laborEfetivoList.length;
    const totalAlocados = alocadosList.length;
    const percAlocados = totalLabor > 0 ? ((totalAlocados / totalLabor) * 100).toFixed(1) : 0;
    const laborT1 = laborEfetivoList.filter(op => (op.turno || 'T1') === 'T1').length;
    const laborT2 = laborEfetivoList.filter(op => op.turno === 'T2').length;
    const absT1 = absenteismoList.filter(op => (op.turno || 'T1') === 'T1').length;
    const absT2 = absenteismoList.filter(op => op.turno === 'T2').length;
    const percAbs = totalLabor > 0 ? ((absenteismoList.length / totalLabor) * 100).toFixed(1) : 0;
    const saidaT1 = saidaList.filter(op => (op.turno || 'T1') === 'T1').length;
    const saidaT2 = saidaList.filter(op => op.turno === 'T2').length;
    const percSaida = totalLabor > 0 ? ((saidaList.length / totalLabor) * 100).toFixed(1) : 0;

    let proximoRetorno = null;
    if (feriasList.length > 0) {
        const hoje = getHojeLocal();
        const retornos = feriasList.filter(op => op.vacation_end).map(op => op.vacation_end).filter(data => data >= hoje).sort();
        if (retornos.length > 0) proximoRetorno = retornos[0];
    }
    const proximoRetornoFormatado = proximoRetorno ? formatDateString(proximoRetorno) : (feriasList.length > 0 ? 'Sem previsão' : '');

    return (
        <div className="page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2 style={{ margin: 0, fontSize: '2em', fontWeight: 800, color: '#1e2b3c' }}>📊 Visão Geral</h2>
                    {lastUpdate && <span style={{ background: '#e8f8f5', color: '#2980b9', padding: '5px 12px', borderRadius: '20px', fontSize: '0.75em', fontWeight: 'bold' }}>Atualizado às {lastUpdate}</span>}
                    {activeStatusFilter && (
                        <span style={{ background: '#f39c12', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75em', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            🔍 Filtrando por: {activeStatusFilter}
                            <button onClick={() => setActiveStatusFilter(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1em', width: 'auto', padding: 0 }}>✖</button>
                        </span>
                    )}
                </div>
                <button onClick={baixarRelatorioExcel} style={{ background: '#27ae60', color: 'white', padding: '12px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.3)', width: 'auto', cursor: 'pointer' }}>
                    📥 Exportar Relatório (Excel)
                </button>
            </div>

            {alertasSkillGap.length > 0 && (
                <div className="alert-panel" style={{ background: '#fdedec', borderLeft: '5px solid #c0392b', padding: '15px 20px', borderRadius: '8px', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <div>
                        <h4 style={{ margin: '0 0 5px 0', color: '#c0392b', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1em' }}>
                            🚨 Alerta Crítico: Fossa de Competências (Skill Gap)
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.95em', color: '#7f8c8d' }}>
                            Detetamos <strong>{alertasSkillGap.length} posto(s)</strong> na matriz sem nenhum operador qualificado disponível na fábrica hoje.
                        </p>
                    </div>
                    <button 
                        onClick={() => abrirModal('Postos a Descoberto', '#c0392b', alertasSkillGap.map((a, i) => ({ id: `gap_${i}`, nome: `Posto: ${a.nomePosto}`, nome_lider: `Produto: ${a.nomeProduto}`, turno: 'Ambos', linhas_vinculadas: ['Todas'], detalhe: 'CRÍTICO', motivoTxt: `Aviso: Todos os ${a.totalAlocados} operadores capacitados para este posto estão ausentes hoje.` })))} 
                        style={{ background: '#c0392b', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Ver Postos Afetados
                    </button>
                </div>
            )}
            
            {alertasRH.length > 0 && (
                <div className="alert-panel" style={{ background: '#fdf2e9', borderLeft: '5px solid #e67e22', padding: '15px 20px', borderRadius: '8px', marginBottom: '25px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <div>
                        <h4 style={{ margin: '0 0 5px 0', color: '#d35400', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1em' }}>
                            ⚠️ Alerta de Frequência (Mês Atual)
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.95em', color: '#7f8c8d' }}>
                            Identificamos <strong>{alertasRH.length} colaborador(es)</strong> com 2 ou mais ocorrências (Faltas/Saídas) neste mês.
                        </p>
                    </div>
                    <button 
                        onClick={() => abrirModal('Alertas de Frequência (Mês)', '#d35400', alertasRH.map(a => ({...a, detalhe: `${a.totalOcorrencias} ocorrências (${a.faltasMes} Faltas, ${a.saidasMes} Saídas)`})))} 
                        style={{ background: '#e67e22', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Ver Detalhes
                    </button>
                </div>
            )}

            <div className="stats-bar">
                <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => abrirModal('Total Labor', '#34495e', laborEfetivoList)}>
                    <div style={{ flex: 1 }}>
                        <h3>Total Labor</h3>
                        <div className="value">{totalLabor}</div>
                    </div>
                    <div style={{ fontSize: '0.8em', marginTop: '10px' }}> T1: {laborT1} | T2: {laborT2} </div>
                </div>

                <div className="stat-card" style={{ background: '#27ae60', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => abrirModal('Alocados', '#27ae60', alocadosList)}>
                    <div style={{ flex: 1 }}>
                        <h3>Alocados</h3>
                        <div className="value" style={{color: 'white'}}>{totalAlocados}</div>
                    </div>
                    <div style={{ fontSize: '0.8em', marginTop: '10px', color: 'white' }}>{percAlocados}% do Total</div>
                </div>
                
                <div className="stat-card" style={{ background: '#c0392b', display: 'flex', flexDirection: 'column' }}>
                    <div onClick={() => abrirModal('Absenteísmo', '#c0392b', absenteismoList)} style={{cursor: 'pointer', flex: 1}}>
                        <h3>Absenteísmo</h3>
                        <div className="value" style={{color: 'white'}}>{absenteismoList.length}</div>
                        <div style={{ fontSize: '0.8em', marginTop: '10px', color: 'white' }}> T1: {absT1} | T2: {absT2} </div>
                        <div style={{ fontSize: '0.8em', marginTop: '2px', color: 'white' }}> {percAbs}% do Total </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); abrirModalDownload('abs'); }} style={{marginTop: '12px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75em', cursor: 'pointer', fontWeight: 'bold'}}>
                        📥 Histórico (Período)
                    </button>
                </div>

                <div className="stat-card" style={{ background: '#e67e22', display: 'flex', flexDirection: 'column' }}>
                    <div onClick={() => abrirModal('Saída Antecipada', '#e67e22', saidaList)} style={{cursor: 'pointer', flex: 1}}>
                        <h3>Saída Antecipada</h3>
                        <div className="value" style={{color: 'white'}}>{saidaList.length}</div>
                        <div style={{ fontSize: '0.8em', marginTop: '10px', color: 'white' }}> T1: {saidaT1} | T2: {saidaT2} </div>
                        <div style={{ fontSize: '0.8em', marginTop: '2px', color: 'white' }}> {percSaida}% do Total </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); abrirModalDownload('saida'); }} style={{marginTop: '12px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75em', cursor: 'pointer', fontWeight: 'bold'}}>
                        📥 Histórico (Período)
                    </button>
                </div>
                
                <div className="stat-card" style={{ background: '#3498db', display: 'flex', flexDirection: 'column' }}>
                    <div onClick={() => abrirModal('Férias', '#3498db', feriasList)} style={{cursor: 'pointer', flex: 1}}>
                        <h3>Férias</h3>
                        <div className="value" style={{color: 'white'}}>{feriasList.length}</div>
                        {proximoRetorno && ( 
                            <div style={{ fontSize: '0.8em', marginTop: '10px', color: 'white' }}> Próximo Retorno: {proximoRetornoFormatado} </div> 
                        )}
                    </div>
                    <button onClick={baixarCronogramaFerias} style={{marginTop: '12px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75em', cursor: 'pointer', fontWeight: 'bold'}}>
                        📥 Extrair Cronograma
                    </button>
                </div>

                <div className="stat-card" style={{ background: '#8e44ad', display: 'flex', flexDirection: 'column' }}>
                    <div onClick={() => abrirModal('Horas Extras Agendadas', '#8e44ad', heList)} style={{cursor: 'pointer', flex: 1}}>
                        <h3>Horas Extras</h3>
                        <div className="value" style={{color: 'white'}}>{heList.length}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '12px' }}>
                        <button onClick={baixarCronogramaHE} style={{ flex: 1, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '6px 0', borderRadius: '4px', fontSize: '0.70em', cursor: 'pointer', fontWeight: 'bold' }}>
                            📥 Cronograma
                        </button>
                        <button onClick={baixarRelatorioLogistica} style={{ flex: 1, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '6px 0', borderRadius: '4px', fontSize: '0.70em', cursor: 'pointer', fontWeight: 'bold' }}>
                            🍱 Logística
                        </button>
                    </div>
                </div>
            </div>

            <div className="charts-container">
                <div className="chart-box">
                    <h4>Distribuição Atual (Clique para Filtrar)</h4>
                    <div className="canvas-wrapper">
                        <Doughnut data={dataStatus} plugins={[percentagePlugin]} options={{ 
                            responsive: true, maintainAspectRatio: false, 
                            onClick: (e, elements) => {
                                if (elements.length > 0) {
                                    const label = dataStatus.labels[elements[0].index];
                                    setActiveStatusFilter(prev => prev === label ? null : label);
                                } else setActiveStatusFilter(null);
                            }
                        }} />
                    </div>
                </div>
                <div className="chart-box">
                    <h4>Vínculo Contratual da Operação</h4>
                    <div className="canvas-wrapper">
                        <Doughnut data={dataVinculo} plugins={[percentagePlugin]} options={{ responsive: true, maintainAspectRatio: false }} />
                    </div>
                </div>
            </div>

            <div className="charts-container" style={{ gridTemplateColumns: '1fr', marginTop: '20px' }}>
                <div className="chart-box">
                    <h4>Operadores por Líder</h4>
                    <div className="canvas-wrapper">
                        <Bar data={dataLideres} plugins={[barValuePlugin]} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }} />
                    </div>
                </div>
            </div>

            <div className="charts-container" style={{ marginTop: '20px' }}>
                <div className="chart-box" style={{ position: 'relative' }}>
                    {absState.level !== 'month' && (
                        <button onClick={() => {
                            if (absState.level === 'day') setAbsState({ ...absState, level: 'week', week: null });
                            else if (absState.level === 'week') setAbsState({ ...absState, level: 'month', month: null });
                        }} style={{position: 'absolute', left: '20px', top: '15px', width: 'auto', padding: '4px 10px', fontSize: '0.8em', background: '#95a5a6', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', zIndex: 10}}>
                            ⬅ Voltar Período
                        </button>
                    )}
                    <h4>Histórico de Absenteísmo (Clique p/ expandir)</h4>
                    <div className="canvas-wrapper">
                        <Bar data={dataAbsHistory} plugins={[barValuePlugin]} options={{ 
                            responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
                            onClick: (e, elements) => {
                                if (elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = dataAbsHistory.labels[index];
                                    if (!label || label.startsWith('Sem F')) return;
                                    if (absState.level === 'month') setAbsState({ level: 'week', month: label, week: null });
                                    else if (absState.level === 'week') setAbsState({ level: 'day', month: absState.month, week: label });
                                }
                            }
                        }} />
                    </div>
                </div>
                <div className="chart-box" style={{ position: 'relative' }}>
                    {exitState.level !== 'month' && (
                        <button onClick={() => {
                            if (exitState.level === 'day') setExitState({ ...exitState, level: 'week', week: null });
                            else if (exitState.level === 'week') setExitState({ ...exitState, level: 'month', month: null });
                        }} style={{position: 'absolute', left: '20px', top: '15px', width: 'auto', padding: '4px 10px', fontSize: '0.8em', background: '#95a5a6', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', zIndex: 10}}>
                            ⬅ Voltar Período
                        </button>
                    )}
                    <h4>Histórico de Saídas (Clique p/ expandir)</h4>
                    <div className="canvas-wrapper">
                        <Bar data={dataExitHistory} plugins={[barValuePlugin]} options={{ 
                            responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
                            onClick: (e, elements) => {
                                if (elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = dataExitHistory.labels[index];
                                    if (!label || label.startsWith('Sem S')) return;
                                    if (exitState.level === 'month') setExitState({ level: 'week', month: label, week: null });
                                    else if (exitState.level === 'week') setExitState({ level: 'day', month: exitState.month, week: label });
                                }
                            }
                        }} />
                    </div>
                </div>
            </div>

            {downloadModal.isOpen && (
                <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => { if(e.target.className.includes('modal-overlay')) setDownloadModal({...downloadModal, isOpen: false}) }}>
                    <div className="modal-box" style={{ width: '450px', padding: '30px' }}>
                        <h3 style={{ color: '#2980b9', marginTop: 0 }}>{downloadModal.type === 'abs' ? 'Baixar Histórico de Absenteísmo' : 'Baixar Histórico de Saídas'}</h3>
                        <p style={{ fontSize: '0.95em', color: '#555', marginBottom: '20px' }}>Selecione o período (De / Até) para extrair os dados em formato Excel.</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                            <div>
                                <label style={{ fontSize: '0.85em', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>De (Início):</label>
                                <input type="date" value={downloadModal.dateStart} onChange={(e) => setDownloadModal({...downloadModal, dateStart: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '6px' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.85em', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Até (Fim):</label>
                                <input type="date" value={downloadModal.dateEnd} onChange={(e) => setDownloadModal({...downloadModal, dateEnd: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '6px' }} />
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setDownloadModal({...downloadModal, isOpen: false})} style={{ background: '#ecf0f1', padding: '12px', borderRadius: '6px', border: 'none', color: '#7f8c8d', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>Cancelar</button>
                            <button onClick={executarDownloadData} disabled={downloading} style={{ background: '#27ae60', padding: '12px', borderRadius: '6px', border: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer', flex: 2, opacity: downloading ? 0.6 : 1 }}>
                                {downloading ? '⏳ Gerando...' : '📥 Baixar Relatório Excel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modalInfo.isOpen && (
                <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => { if(e.target.className.includes('modal-overlay')) setModalInfo({...modalInfo, isOpen: false}) }}>
                    <div className="modal-box" style={{ width: '650px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
                        <div style={{ background: modalInfo.cor, padding: '20px', display: 'flex', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, color: 'white' }}>{modalInfo.titulo} ({modalInfo.lista.length})</h3>
                            <button onClick={() => setModalInfo({...modalInfo, isOpen: false})} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5em', width: 'auto' }} aria-label="Fechar">&times;</button>
                        </div>
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, background: '#f8f9fa' }}>
                            {modalInfo.lista.length === 0 ? (
                                <p style={{textAlign: 'center', color: '#7f8c8d'}}>Nenhum operador nesta lista.</p>
                            ) : (
                                modalInfo.lista.map(op => ( 
                                    <div key={op.id} style={{ background: 'white', padding: '15px', marginBottom:'10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.01)' }}>
                                        <div style={{ flex: 1, paddingRight: '15px' }}>
                                            <strong style={{ fontSize: '1.1em', color: '#2c3e50' }}>{op.nome}</strong><br/>
                                            <span style={{ fontSize: '0.9em', color: '#7f8c8d' }}>
                                                Líder: {op.nome_lider || 'N/A'} | Linhas: {(op.linhas_vinculadas || []).join(', ')} | Turno: {op.turno || 'T1'}
                                                {op.vacation_end && (
                                                    <span> | Retorno: {formatDateString(op.vacation_end)}</span>
                                                )}
                                            </span>
                                            {op.motivoTxt && (
                                                <div style={{ marginTop: '6px', fontSize: '0.85em', color: '#7f8c8d', fontStyle: 'italic', background: '#fcf3cf', padding: '4px 8px', borderRadius: '4px', width: 'fit-content' }}>
                                                    ℹ️ {op.motivoTxt}
                                                </div>
                                            )}
                                        </div>
                                        {op.detalhe && (
                                            <span style={{ background: '#fdf2e9', color: modalInfo.cor, padding: '6px 12px', borderRadius: '20px', fontSize: '0.8em', fontWeight: 'bold', border: `1px solid ${modalInfo.cor}33`, whiteSpace: 'nowrap' }}>
                                                {op.detalhe}
                                            </span>
                                        )}
                                    </div> 
                                ))
                            )}
                        </div>
                        <div style={{ padding: '15px 20px', borderTop: '1px solid #eee', background: 'white', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={baixarListaModal} disabled={downloading} style={{ width: 'auto', background: '#ecf0f1', color: '#2c3e50', border: '1px solid #bdc3c7', cursor: 'pointer', opacity: downloading ? 0.6 : 1 }}>
                                {downloading ? '⏳ Gerando...' : '📥 Baixar Lista em Tela (Excel)'}
                            </button>
                            <button onClick={() => setModalInfo({...modalInfo, isOpen: false})} style={{ width: 'auto', cursor: 'pointer' }}>Fechar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}