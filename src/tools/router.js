import React from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import Login from '../components/Login'
import Signup from '../components/Signup'
import CEODashboard from '../components/CEODashboard'
import AdminDashboard from '../components/AdminDashboard'
import EmployeeDashboard from '../components/EmployeeDashboard'
import ProtectedRoute from '../components/ProtectedRoute'
import '../theme/monochrome.css'

const Router = () => {
  return (
    <HashRouter>
      <Routes>
        {/* Rute publice */}
        <Route path="/" element={<Login />} />
        <Route path="/Signup" element={<Signup />} />
        
        {/* Rute protejate - wrap in .mono-theme so signup/login keep original styles */}
        <Route
          path="/CEODashboard"
          element={
            <div className="mono-theme mono-root">
              <ProtectedRoute allowedRole="ceo">
                <CEODashboard />
              </ProtectedRoute>
            </div>
          }
        />
        <Route
          path="/AdminDashboard"
          element={
            <div className="mono-theme mono-root">
              <ProtectedRoute allowedRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            </div>
          }
        />
        <Route
          path="/EmployeeDashboard"
          element={
            <div className="mono-theme mono-root">
              <ProtectedRoute allowedRole="employee">
                <EmployeeDashboard />
              </ProtectedRoute>
            </div>
          }
        />
      </Routes>
    </HashRouter>
  );
};
export default Router;