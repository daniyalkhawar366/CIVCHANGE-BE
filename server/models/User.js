import mongoose from "mongoose";

const userShcema= new mongoose.Schema({
    email:{
        type:String,
        required:true,
        unique:true
    },
    name:{
        type:String,
        required:true,
       
    },
    password:{
        type:String,
        required:true,
       
    },
    lastLogin:{
        type:Date,
        default:Date.now
    },
    isVerified:{
        type:Boolean,
        default:false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'premium', 'enterprise'],
        default: 'free'
    },
    conversionsLeft: {
        type: Number,
        default: 1
    },
    stripeCustomerId: {
        type: String
    },
    stripeSubscriptionId: {
        type: String
    },
    subscriptionStatus: {
        type: String,
        enum: ['active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid', 'paused', 'free'],
        default: 'free'
    },
    subscriptionEndDate: {
        type: Date
    },
    pendingPlan: {
        type: String
    },
    resetPasswordToken:String,
    resetPasswordExpiresAt:Date,
    verficationToken:String,
    verficationTokenExpiresAt:Date,
    
},{timestamps:true})

export const Usermodel=mongoose.model('User',userShcema) 