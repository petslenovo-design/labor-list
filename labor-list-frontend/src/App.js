import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import './App.css';

import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import GestaoEquipe from './pages/GestaoEquipe';
import SkillMatrix from './pages/SkillMatrix';
import GestaoTreinamentos from './pages/GestaoTreinamentos';
import Heatmap from './pages/Heatmap';
import PlanejamentoHE from './pages/PlanejamentoHE';
import Configuracoes from './pages/Configuracoes';
import LogsAuditoria from './pages/LogsAuditoria';

// (Importe as outras páginas que criar...)

const PrivateRoute = ({ children }) => {
    const { user } = useContext(AuthContext);
    if (!user) return <Navigate to="/" />;

    // ESTRUTURA EXATA DO V129 HTML:
    return (
        <>
            <Sidebar />
            <div className="main-content">
                {children}
            </div>
        </>
    );
};

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster position="bottom-right" />
                <Routes>
                    <Route path="/" element={<Login />} />
                    <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                    <Route path="/equipe" element={<PrivateRoute><GestaoEquipe /></PrivateRoute>} />
                    <Route path="/matrix" element={<PrivateRoute><SkillMatrix /></PrivateRoute>} />
                    <Route path="/treinamentos" element={<PrivateRoute><GestaoTreinamentos /></PrivateRoute>} />
                    <Route path="/heatmap" element={<PrivateRoute><Heatmap /></PrivateRoute>} />
                    <Route path="/planejamento-he" element={<PrivateRoute><PlanejamentoHE /></PrivateRoute>} />
                    <Route path="/configuracoes" element={<PrivateRoute><Configuracoes /></PrivateRoute>} />
                    <Route path="/logs" element={<PrivateRoute><LogsAuditoria /></PrivateRoute>} />
                    {/* Adicione as outras aqui */}
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}