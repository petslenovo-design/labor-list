import React, { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement } from 'chart.js';
import { Bar, Line, Doughnut, Pie } from 'react-chartjs-2';
import * as XLSX from 'xlsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement);

// ============================================================================
// PLUGINS CUSTOMIZADOS: Inteligência de Posicionamento de Rótulos
// ============================================================================
const percentagePlugin = {
    id: 'percentagePlugin',
    afterDraw: (chart) => {
        if (chart.config.type !== 'doughnut' && chart.config.type !== 'pie') return;
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden) return;
            const total = dataset.data.reduce((a, b) => a + b, 0);
            if (total === 0) return;
            meta.data.forEach((arc, index) => {
                const value = dataset.data[index];
                if (value > 0) {
                    const percent = ((value / total) * 100).toFixed(1) + '%';
                    const { x, y } = arc.tooltipPosition();
                    ctx.save();
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0,0,0,0.6)';
                    ctx.shadowBlur = 4;
                    ctx.fillText(`${value} (${percent})`, x, y);
                    ctx.restore();
                }
            });
        });
    }
};

const barValuePercentPlugin = {
    id: 'barValuePercentPlugin',
    afterDatasetsDraw: (chart) => {
        if (chart.config.type !== 'bar') return;
        const ctx = chart.ctx;
        const isStacked = chart.options.scales?.y?.stacked; 
        
        chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            // IGNORA LINHAS NO GRÁFICO MISTO PARA NÃO POLUIR
            if (meta.hidden || meta.type !== 'bar') return; 
            
            const total = dataset.data.reduce((a, b) => a + b, 0);
            
            meta.data.forEach((bar, index) => {
                const value = dataset.data[index];
                if (value > 0 && total > 0) {
                    const percent = ((value / total) * 100).toFixed(1) + '%';
                    ctx.save();
                    
                    if (chart.options.indexAxis === 'y') {
                        // Gráficos Horizontais
                        ctx.font = 'bold 11px sans-serif';
                        ctx.fillStyle = '#2c3e50';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${value} (${percent})`, bar.x + 5, bar.y);
                    } else {
                        // Gráficos Verticais
                        if (isStacked) {
                            // Barras Empilhadas: Desenha no centro do bloco a branco
                            ctx.font = 'bold 12px sans-serif';
                            ctx.fillStyle = '#ffffff'; 
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            
                            const height = Math.abs(bar.base - bar.y);
                            if (height > 14) {
                                ctx.fillText(value, bar.x, (bar.base + bar.y) / 2);
                            }
                        } else {
                            // Barras Normais: Desenha no topo com a %
                            ctx.font = 'bold 11px sans-serif';
                            ctx.fillStyle = '#2c3e50';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.fillText(`${value} (${percent})`, bar.x, bar.y - 4);
                        }
                    }
                    ctx.restore();
                }
            });
        });
    }
};

const getHojeLocal = () => {
    const spTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    if (spTime.getHours() < 5) spTime.setDate(spTime.getDate() - 1);
    const yyyy = spTime.getFullYear();
    const mm = String(spTime.getMonth() + 1).padStart(2, '0');
    const dd = String(spTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const generateDateRange = (start, end) => {
    const arr = [];
    let dt = new Date(start + 'T12:00:00Z');
    const endDt = new Date(end + 'T12:00:00Z');
    while (dt <= endDt) {
        arr.push(dt.toISOString().substring(0, 10));
        dt.setDate(dt.getDate() + 1);
    }
    return arr;
};

export default function AbsenteismoRH() {
    const hoje = getHojeLocal();
    const [dataInicio, setDataInicio] = useState(() => `${hoje.substring(0, 7)}-01`);
    const [dataFim, setDataFim] = useState(hoje);
    
    const [absState, setAbsState] = useState({ level: 'month', month: null, week: null });
    const [dadosRH, setDadosRH] = useState(null);
    const [loading, setLoading] = useState(true);
    const [buscaTabela, setBuscaTabela] = useState('');
    const [modalDia, setModalDia] = useState({ isOpen: false, data: '', lista: [] });

    const carregarEstatiticas = useCallback(async () => {
        if (dataInicio > dataFim) return toast.error("A data de Início não pode ser maior que o Fim.");
        setLoading(true);
        try {
            const res = await api.get(`/rh/absenteismo?data_inicio=${dataInicio}&data_fim=${dataFim}`);
            setDadosRH(res.data);
            setAbsState({ level: 'month', month: null, week: null });
        } catch (e) { toast.error("Erro ao processar dados de RH."); } 
        finally { setLoading(false); }
    }, [dataInicio, dataFim]);

    useEffect(() => { carregarEstatiticas(); }, []);

    const tabelaFiltrada = useMemo(() => {
        if (!dadosRH?.tabela_detalhada) return [];
        return dadosRH.tabela_detalhada.filter(item => 
            item.nome.toLowerCase().includes(buscaTabela.toLowerCase()) ||
            item.lider.toLowerCase().includes(buscaTabela.toLowerCase()) ||
            item.motivo.toLowerCase().includes(buscaTabela.toLowerCase())
        );
    }, [dadosRH, buscaTabela]);

    const topAusentes = useMemo(() => {
        if (!dadosRH?.tabela_detalhada) return [];
        const contagem = {};
        dadosRH.tabela_detalhada.forEach(item => {
            if (!contagem[item.nome]) contagem[item.nome] = { nome: item.nome, total: 0, turno: item.turno, lider: item.lider };
            contagem[item.nome].total += 1;
        });
        const totalGeral = dadosRH.kpis.total_faltas || 1;
        return Object.values(contagem).sort((a,b) => b.total - a.total).slice(0, 5).map(op => ({
            ...op, porcentagem: ((op.total / totalGeral) * 100).toFixed(1)
        }));
    }, [dadosRH]);

    // ============================================================================
    // GRÁFICOS
    // ============================================================================
    const dataAbsHistory = useMemo(() => {
        let absCounts = {};
        (dadosRH?.tabela_detalhada || []).forEach(f => {
            const t = f.turno || 'T1';
            const dataFalta = f.data;
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
        
        let absLabels, absDataT1, absDataT2, absRates;
        if (absState.level === 'week') {
            absLabels = ["Semana 1 (1-7)", "Semana 2 (8-14)", "Semana 3 (15-21)", "Semana 4 (22-28)", "Semana 5 (29+)"];
            absLabels.forEach(l => { if (!absCounts[l]) absCounts[l] = { T1: 0, T2: 0 }; });
        } else {
            absLabels = Object.keys(absCounts).sort();
        }

        absDataT1 = absLabels.map(l => absCounts[l]?.T1 || 0);
        absDataT2 = absLabels.map(l => absCounts[l]?.T2 || 0);

        // NOVO: Cálculo Dinâmico da Taxa (%) para formar a Linha de Tendência
        const hc = dadosRH?.kpis?.headcount_base || 1;
        let divDias = 1;
        if (absState.level === 'month') divDias = 22; // Estima 22 dias úteis
        else if (absState.level === 'week') divDias = 5; // Estima 5 dias úteis na semana
        
        absRates = absLabels.map(l => {
            const totalFaltasBloco = (absCounts[l]?.T1 || 0) + (absCounts[l]?.T2 || 0);
            return parseFloat(((totalFaltasBloco / (hc * divDias)) * 100).toFixed(2));
        });

        return { 
            labels: absLabels.length > 0 ? absLabels : ['Sem Faltas'], 
            datasets: [ 
                { 
                    type: 'line',
                    label: 'Taxa Média (%)',
                    data: absLabels.length > 0 ? absRates : [0],
                    borderColor: '#f1c40f',
                    backgroundColor: '#f1c40f',
                    borderWidth: 3,
                    tension: 0.3,
                    yAxisID: 'y1', // Liga a linha ao eixo secundário
                    pointRadius: 5,
                    fill: false
                },
                { type: 'bar', label: 'Turno 1', data: absLabels.length > 0 ? absDataT1 : [0], backgroundColor: '#e74c3c', borderRadius: 4, yAxisID: 'y' }, 
                { type: 'bar', label: 'Turno 2', data: absLabels.length > 0 ? absDataT2 : [0], backgroundColor: '#922b21', borderRadius: 4, yAxisID: 'y' } 
            ] 
        };
    }, [dadosRH, absState]);

    const chartVinculo = useMemo(() => {
        if (!dadosRH?.grafico_vinculo) return {};
        const labels = Object.keys(dadosRH.grafico_vinculo);
        return {
            labels: labels,
            datasets: [{ data: labels.map(l => dadosRH.grafico_vinculo[l]), backgroundColor: ['#27ae60', '#f39c12', '#8e44ad', '#7f8c8d'], borderWidth: 1 }]
        };
    }, [dadosRH]);

    const dateRangeArray = useMemo(() => generateDateRange(dataInicio, dataFim), [dataInicio, dataFim]);
    
    const chartDias = useMemo(() => {
        if (!dadosRH?.grafico_taxa_diaria) return {};
        return {
            labels: dateRangeArray.map(d => d.split('-').reverse().join('/')),
            datasets: [{ 
                label: 'Taxa Diária (%)', 
                data: dateRangeArray.map(d => dadosRH.grafico_taxa_diaria[d] || 0), 
                borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.15)', tension: 0.3, fill: true, pointRadius: 5, pointBackgroundColor: '#c0392b' 
            }]
        };
    }, [dadosRH, dateRangeArray]);

    const chartMotivos = useMemo(() => {
        if (!dadosRH?.grafico_motivos) return {};
        const motivos = Object.keys(dadosRH.grafico_motivos);
        return {
            labels: motivos,
            datasets: [{ label: 'Ocorrências por Categoria', data: motivos.map(m => dadosRH.grafico_motivos[m]), backgroundColor: '#34495e', borderRadius: 6 }]
        };
    }, [dadosRH]);

    const chartDiasSemana = useMemo(() => {
        if (!dadosRH?.grafico_dia_semana) return {};
        const labels = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
        return {
            labels,
            datasets: [{ label: 'Total de Faltas', data: labels.map(l => dadosRH.grafico_dia_semana[l]), backgroundColor: '#f1c40f', borderRadius: 4 }]
        };
    }, [dadosRH]);

    const chartLideres = useMemo(() => {
        if (!dadosRH?.grafico_lideres) return {};
        const lideresOrdenados = Object.entries(dadosRH.grafico_lideres).sort((a,b) => b[1] - a[1]).slice(0, 5);
        return {
            labels: lideresOrdenados.map(l => l[0]),
            datasets: [{ label: 'Faltas na Equipa', data: lideresOrdenados.map(l => l[1]), backgroundColor: '#e74c3c', borderRadius: 4 }]
        };
    }, [dadosRH]);

    const paretoOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const valor = context.parsed.y;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const perc = ((valor / total) * 100).toFixed(1);
                        return `Ocorrências: ${valor} (${perc}%)`;
                    }
                }
            }
        }
    };

    const exportarExcelCompletoRH = () => {
        if (!tabelaFiltrada.length) return toast.error("Sem dados para exportar.");
        try {
            const planilha = tabelaFiltrada.map(item => ({
                'Data da Ocorrência': item.data.split('-').reverse().join('/'),
                'Colaborador': item.nome, 'Turno': item.turno, 'Vínculo Contratual': item.vinculo,
                'Registro Original (Sistema)': item.vinculo_original,
                'Líder Responsável': item.lider, 'Justificativa Lançada': item.motivo
            }));
            const ws = XLSX.utils.json_to_sheet(planilha);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Absenteísmo");
            ws['!cols'] = [{wch:18}, {wch:30}, {wch:10}, {wch:18}, {wch:25}, {wch:25}, {wch:50}];
            XLSX.writeFile(wb, `Relatorio_RH_${dataInicio}_a_${dataFim}.xlsx`);
            toast.success("Dados exportados!");
        } catch (e) { toast.error("Erro na exportação."); }
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Processando indicadores de Recursos Humanos...</div>;

    return (
        <div className="page">
            <h2 style={{ margin: '0 0 5px 0', fontSize: '2em', fontWeight: 800, color: '#1e2b3c' }}>📋 Painel de Absenteísmo (RH)</h2>
            <p style={{ margin: '0 0 20px 0', color: '#7f8c8d' }}>Análise com base no <strong>Intervalo Personalizado</strong> selecionado abaixo.</p>

            <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', borderLeft: '5px solid #2980b9' }}>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#34495e', marginBottom: '8px', textTransform: 'uppercase' }}>📅 Data Inicial (De):</label>
                        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #dcdde1', fontWeight: 'bold', background: '#f8f9fa', color: '#2c3e50', cursor: 'pointer', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#34495e', marginBottom: '8px', textTransform: 'uppercase' }}>📅 Data Final (Até):</label>
                        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #dcdde1', fontWeight: 'bold', background: '#f8f9fa', color: '#2c3e50', cursor: 'pointer', outline: 'none' }} />
                    </div>
                    <button onClick={carregarEstatiticas} style={{ background: '#34495e', color: 'white', fontWeight: 'bold', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', transition: '0.2s' }}>
                        🔍 Aplicar Filtro
                    </button>
                </div>
                <button onClick={exportarExcelCompletoRH} style={{ background: '#27ae60', color: 'white', fontWeight: 'bold', border: 'none', padding: '14px 24px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.2)' }}>
                    <span style={{ fontSize: '1.2em' }}>📥</span> Extrair Relatório (Excel)
                </button>
            </div>

            <div className="stats-bar" style={{ marginBottom: '25px' }}>
                <div className="stat-card" style={{ background: '#1e2b3c' }}>
                    <h3>Total de Faltas no Período</h3>
                    <div className="value" style={{ color: 'white' }}>{dadosRH?.kpis.total_faltas}</div>
                    <div style={{ fontSize: '0.8em', marginTop: '5px', color: '#bdc3c7' }}>Base: {dadosRH?.kpis.headcount_base} ativos ({dadosRH?.filtros.dias_analisados} dias úteis)</div>
                </div>
                
                <div className="stat-card" style={{ background: '#c0392b', position: 'relative' }}>
                    <h3>Taxa Média do Período (%)</h3>
                    <div className="value" style={{ color: 'white' }}>{dadosRH?.kpis.taxa_media_periodo}%</div>
                    <div style={{ fontSize: '0.80em', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {dadosRH?.kpis.diferenca_taxa > 0 ? (
                            <span style={{ background: 'rgba(255,255,255,0.25)', padding: '3px 8px', borderRadius: '4px', color: '#fff', fontWeight: 'bold' }}>
                                ⬆ +{dadosRH.kpis.diferenca_taxa}% vs Anterior
                            </span>
                        ) : dadosRH?.kpis.diferenca_taxa < 0 ? (
                            <span style={{ background: 'rgba(46, 204, 113, 0.4)', padding: '3px 8px', borderRadius: '4px', color: '#fff', fontWeight: 'bold' }}>
                                ⬇ {dadosRH.kpis.diferenca_taxa}% vs Anterior
                            </span>
                        ) : (
                            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 8px', borderRadius: '4px', color: '#f2d7d5', fontWeight: 'bold' }}>
                                ⏸ Média Mantida
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="stat-card" style={{ background: '#2980b9' }}>
                    <h3>Faltas no Turno 1</h3>
                    <div className="value" style={{ color: 'white' }}>{dadosRH?.turnos.t1_total}</div>
                    <div style={{ fontSize: '0.8em', marginTop: '5px', color: 'white' }}>Equivale a {dadosRH?.turnos.t1_porcentagem}% das faltas</div>
                </div>
                <div className="stat-card" style={{ background: '#e67e22' }}>
                    <h3>Faltas no Turno 2</h3>
                    <div className="value" style={{ color: 'white' }}>{dadosRH?.turnos.t2_total}</div>
                    <div style={{ fontSize: '0.8em', marginTop: '5px', color: 'white' }}>Equivale a {dadosRH?.turnos.t2_porcentagem}% das faltas</div>
                </div>
            </div>

            <div className="charts-container" style={{ marginBottom: '25px', gridTemplateColumns: '2fr 1fr' }}>
                <div className="chart-box" style={{ position: 'relative' }}>
                    {absState.level !== 'month' && (
                        <button onClick={() => {
                            if (absState.level === 'day') setAbsState({ ...absState, level: 'week', week: null });
                            else setAbsState({ level: 'month', month: null, week: null });
                        }} style={{ position: 'absolute', top: '15px', right: '15px', background: '#ecf0f1', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            🔙 Voltar
                        </button>
                    )}
                    <h4>Histórico de Absenteísmo (Clique na Barra p/ expandir)</h4>
                    <div className="canvas-wrapper" style={{ height: '280px' }}>
                        <Bar data={dataAbsHistory} plugins={[barValuePercentPlugin]} options={{ 
                            responsive: true, 
                            maintainAspectRatio: false, 
                            scales: { 
                                x: { stacked: true }, 
                                y: { 
                                    stacked: true, 
                                    beginAtZero: true, 
                                    ticks: { stepSize: 1 },
                                    position: 'left',
                                    title: { display: true, text: 'Qtd Faltas (Barras)' }
                                },
                                y1: { // Eixo Secundário para a Linha de Taxa
                                    beginAtZero: true,
                                    position: 'right',
                                    grid: { drawOnChartArea: false },
                                    title: { display: true, text: 'Taxa Média % (Linha)' }
                                }
                            },
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
                
                <div className="chart-box" style={{ background: '#fff5f5', border: '1px solid #fadbd8' }}>
                    <h4 style={{ color: '#c0392b' }}>⚠️ Top Reincidentes</h4>
                    <div style={{ marginTop: '15px' }}>
                        {topAusentes.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#7f8c8d', paddingTop: '40px' }}>Nenhum reincidente.</p>
                        ) : (
                            topAusentes.map((op, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px', borderBottom: '1px solid #fadbd8', background: 'white', borderRadius: '6px', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.95em' }}>{idx + 1}º {op.nome}</span>
                                        <span style={{ fontSize: '0.8em', color: '#7f8c8d' }}>Líder: {op.lider} | {op.turno}</span>
                                    </div>
                                    <div style={{ background: '#e74c3c', color: 'white', fontWeight: 'bold', padding: '4px 10px', borderRadius: '20px', fontSize: '0.85em' }}>
                                        {op.total} ({op.porcentagem}%)
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="charts-container" style={{ marginBottom: '25px', gridTemplateColumns: '2fr 1fr' }}>
                <div className="chart-box">
                    <h4>Evolução da Taxa Diária % (Clique num ponto para abrir a lista do dia)</h4>
                    <div className="canvas-wrapper" style={{ height: '240px', cursor: 'pointer' }}>
                        {dadosRH?.is_diario ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#7f8c8d', background: '#f8f9fa', borderRadius: '8px' }}>
                                Gráfico indisponível para um dia único.
                            </div>
                        ) : (
                            <Line 
                                data={chartDias} 
                                options={{ 
                                    responsive: true, maintainAspectRatio: false, 
                                    scales: { y: { beginAtZero: true } },
                                    onClick: (e, elements) => {
                                        if (elements.length > 0) {
                                            const index = elements[0].index;
                                            const clickedDate = dateRangeArray[index];
                                            const filtered = dadosRH.tabela_detalhada.filter(item => item.data === clickedDate);
                                            setModalDia({ isOpen: true, data: clickedDate, lista: filtered });
                                        }
                                    }
                                }} 
                            />
                        )}
                    </div>
                </div>
                <div className="chart-box">
                    <h4>Distribuição por Dia da Semana</h4>
                    <div className="canvas-wrapper" style={{ height: '240px' }}>
                        <Bar data={chartDiasSemana} plugins={[barValuePercentPlugin]} options={{ responsive: true, maintainAspectRatio: false }} />
                    </div>
                </div>
            </div>

            <div className="charts-container" style={{ marginBottom: '35px', gridTemplateColumns: '1fr 1fr 2fr' }}>
                <div className="chart-box">
                    <h4>Vínculo Contratual</h4>
                    <div className="canvas-wrapper" style={{ height: '240px', maxWidth: '300px', margin: '0 auto' }}>
                        {dadosRH?.kpis.total_faltas > 0 ? (
                            <Pie data={chartVinculo} plugins={[percentagePlugin]} options={{ responsive: true, maintainAspectRatio: false }} />
                        ) : <p style={{ textAlign: 'center', color: '#7f8c8d', paddingTop: '80px' }}>Sem dados.</p>}
                    </div>
                </div>
                <div className="chart-box">
                    <h4>Impacto por Líder</h4>
                    <div className="canvas-wrapper" style={{ height: '240px' }}>
                        <Bar data={chartLideres} plugins={[barValuePercentPlugin]} options={{ responsive: true, maintainAspectRatio: false, indexAxis: 'y' }} />
                    </div>
                </div>
                <div className="chart-box">
                    <h4>Pareto de Justificativas Oficiais</h4>
                    <div className="canvas-wrapper" style={{ height: '240px' }}>
                        <Bar data={chartMotivos} plugins={[barValuePercentPlugin]} options={paretoOptions} />
                    </div>
                </div>
            </div>

            <div className="leader-card" style={{ display: 'block', padding: '25px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#2c3e50' }}>Filtragem Analítica de Ocorrências ({tabelaFiltrada.length})</span>
                    <input 
                        type="text" placeholder="🔍 Filtrar por funcionário, líder ou motivo..." 
                        value={buscaTabela} onChange={(e) => setBuscaTabela(e.target.value)} 
                        style={{ padding: '10px 15px', width: '350px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.95em' }} 
                    />
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="matrix-table" style={{ marginTop: 0 }}>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Colaborador</th>
                                <th style={{ textAlign: 'center' }}>Turno</th>
                                <th>Vínculo Contratual</th>
                                <th>Líder Responsável</th>
                                <th>Justificativa Lançada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tabelaFiltrada.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d', fontSize: '1.1em' }}>Nenhum registro encontrado.</td></tr>
                            ) : (
                                tabelaFiltrada.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f2f6' }}>
                                        <td style={{ fontWeight: 'bold', color: '#34495e' }}>{item.data.split('-').reverse().join('/')}</td>
                                        <td><strong>{item.nome}</strong></td>
                                        <td style={{ textAlign: 'center' }}><span className={`badge-turno ${item.turno === 'T2' ? 't2' : 't1'}`} style={{ background: item.turno === 'T2' ? '#e67e22' : '#2980b9', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '0.8em', fontWeight: 'bold' }}>{item.turno}</span></td>
                                        <td><span title={`Registro Original: ${item.vinculo_original}`} style={{ fontWeight: 'bold', color: item.vinculo.includes('Efetivo') ? '#27ae60' : '#8e44ad', fontSize: '0.9em', cursor: 'help', borderBottom: '1px dashed #bdc3c7' }}>{item.vinculo}</span></td>
                                        <td style={{ color: '#7f8c8d' }}>{item.lider}</td>
                                        <td><span style={{ fontStyle: 'italic', background: '#fcf3cf', border: '1px solid #f1c40f', padding: '4px 10px', borderRadius: '4px', fontSize: '0.9em', color: '#d35400' }}>📄 {item.motivo}</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL DIÁRIO AO CLICAR NO GRÁFICO */}
            {modalDia.isOpen && (
                <div className="modal-overlay" style={{ display: 'flex', zIndex: 9999 }} onClick={(e) => { if (e.target.className.includes('modal-overlay')) setModalDia({ ...modalDia, isOpen: false }); }}>
                    <div className="modal-box" style={{ width: '650px', maxHeight: '85vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ background: '#e74c3c', padding: '20px', display: 'flex', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, color: 'white' }}>Faltas do dia {modalDia.data.split('-').reverse().join('/')} ({modalDia.lista.length})</h3>
                            <button onClick={() => setModalDia({ ...modalDia, isOpen: false })} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5em' }}>&times;</button>
                        </div>
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, background: '#f8f9fa' }}>
                            {modalDia.lista.length === 0 ? <p style={{textAlign: 'center', color: '#7f8c8d'}}>Sem faltas registadas neste dia.</p> : (
                                modalDia.lista.map((op, idx) => (
                                    <div key={idx} style={{ background: 'white', padding: '15px', marginBottom:'10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <strong style={{ fontSize: '1.1em', color: '#2c3e50' }}>{op.nome}</strong>
                                            <span style={{ fontWeight: 'bold', color: op.vinculo.includes('Efetivo') ? '#27ae60' : '#8e44ad', fontSize: '0.9em' }}>{op.vinculo}</span>
                                        </div>
                                        <div style={{ fontSize: '0.9em', color: '#7f8c8d', marginTop: '5px' }}>Líder: {op.lider} | Turno: {op.turno}</div>
                                        <div style={{ marginTop: '8px', fontSize: '0.85em', color: '#d35400', fontStyle: 'italic', background: '#fcf3cf', padding: '4px 8px', borderRadius: '4px', width: 'fit-content' }}>
                                            📄 {op.motivo}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}