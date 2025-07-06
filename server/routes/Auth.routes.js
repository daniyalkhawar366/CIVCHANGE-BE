import express from 'express'
import { Reigster, VerfiyEmail, forgotPassword, verifyResetOTP, resetPassword, login, resendVerificationEmail, getProfile, updateProfile } from '../controllers/auth.js'
import { authenticateToken } from '../middlewares/auth.js'

const AuthRoutes=express.Router()

AuthRoutes.post('/register',Reigster)
AuthRoutes.post('/verifyEmail',VerfiyEmail)
AuthRoutes.post('/forgot-password', forgotPassword)
AuthRoutes.post('/verify-reset-otp', verifyResetOTP)
AuthRoutes.post('/reset-password', resetPassword)
AuthRoutes.post('/login', login)
AuthRoutes.post('/resend-verification', resendVerificationEmail)
AuthRoutes.get('/profile', authenticateToken, getProfile)
AuthRoutes.put('/profile', authenticateToken, updateProfile)
export default AuthRoutes 