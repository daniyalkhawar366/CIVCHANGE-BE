import express from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.js';
import { listUsers, getUser, updateUser, deleteUser, adminResetPassword, analytics, getSettings, updateSettings } from '../controllers/admin.js';

const AdminRoutes = express.Router();

AdminRoutes.use(authenticateToken, requireAdmin);

AdminRoutes.get('/users', listUsers);
AdminRoutes.get('/users/:id', getUser);
AdminRoutes.put('/users/:id', updateUser);
AdminRoutes.delete('/users/:id', deleteUser);
AdminRoutes.post('/users/:id/reset-password', adminResetPassword);
AdminRoutes.get('/analytics', analytics);
AdminRoutes.get('/settings', getSettings);
AdminRoutes.put('/settings', updateSettings);

export default AdminRoutes; 