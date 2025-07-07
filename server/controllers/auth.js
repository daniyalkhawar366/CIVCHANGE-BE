import { sendVerificationEamil } from "../middlewares/Email.js"
import { Password_Reset_Email_Template } from "../middlewares/EmailTemplate.js"
import { generateTokenAndSetCookies } from "../middlewares/GenerateToken.js"
import { Usermodel } from "../models/User.js"
import bcryptjs from 'bcryptjs'
import { generateToken } from '../middlewares/auth.js'

const Reigster=async(req,res)=>{
    try {
        const {email,password,name}=req.body
        if (!email || !password || !name) {
            return res.status(400).json({success:false,message:"All fields are required"})
        }
        const ExistsUser= await Usermodel.findOne({email})
        if (ExistsUser) {
            return res.status(400).json({success:false,message:"User Already Exists Please Login"})
            
        }
        const hasePassowrd= await bcryptjs.hashSync(password,10)
        const verficationToken= Math.floor(100000 + Math.random() * 900000).toString()
        const user= new Usermodel({
            email,
            password:hasePassowrd,
            name,
            verficationToken,
            verficationTokenExpiresAt:Date.now() + 24 * 60 * 60 * 1000
        })
        await user.save()
       generateTokenAndSetCookies(res,user._id)
       await sendVerificationEamil(user.email,verficationToken)
        return res.status(200).json({success:true,message:"User Register Successfully",user})

    } catch (error) {
        console.log(error)
        return res.status(400).json({success:false,message:"internal server error"})
        
    }
}

const VerfiyEmail=async(req,res)=>{
    try {
        const {code}=req.body 
        const user= await Usermodel.findOne({
            verficationToken:code,
            verficationTokenExpiresAt:{$gt:Date.now()}
        })
        if (!user) {
            return res.status(400).json({success:false,message:"Inavlid or Expired Code"})
                
            }
          
     user.isVerified=true;
     user.verficationToken=undefined;
     user.verficationTokenExpiresAt=undefined;
     await user.save()
     return res.status(200).json({success:true,message:"Email Verifed Successfully"})
           
    } catch (error) {
        console.log(error)
        return res.status(400).json({success:false,message:"internal server error"})
    }
}

// Forgot Password: send reset OTP
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email is required" });
        const user = await Usermodel.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        const resetPasswordToken = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordToken = resetPasswordToken;
        user.resetPasswordExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();
        // Send password reset email
        const { transporter } = await import("../middlewares/Email.config.js");
        await transporter.sendMail({
            from: '"CIVCHANGE" <' + process.env.EMAIL_USER + '>',
            to: user.email,
            subject: "Reset Your Password",
            text: "Reset your password",
            html: Password_Reset_Email_Template.replace("{resetCode}", resetPasswordToken)
        });
        return res.status(200).json({ success: true, message: "Reset OTP sent to email" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Verify reset OTP
const verifyResetOTP = async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await Usermodel.findOne({
            email,
            resetPasswordToken: code,
            resetPasswordExpiresAt: { $gt: Date.now() }
        });
        if (!user) return res.status(400).json({ success: false, message: "Invalid or expired code" });
        return res.status(200).json({ success: true, message: "OTP verified. You can now reset your password." });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Reset password
const resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) return res.status(400).json({ success: false, message: "All fields are required" });
        const user = await Usermodel.findOne({
            email,
            resetPasswordToken: code,
            resetPasswordExpiresAt: { $gt: Date.now() }
        });
        if (!user) return res.status(400).json({ success: false, message: "Invalid or expired code" });
        user.password = await bcryptjs.hash(newPassword, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpiresAt = undefined;
        await user.save();
        return res.status(200).json({ success: true, message: "Password reset successfully" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }
        const user = await Usermodel.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }
        if (!user.isVerified) {
            return res.status(401).json({ success: false, message: "Email not verified" });
        }
        const isPasswordValid = await bcryptjs.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }
        user.lastLogin = new Date();
        await user.save();
        const token = generateToken(user._id);
        res.json({ success: true, message: "Login successful", token, user: { email: user.email, name: user.name, role: user.role, isVerified: user.isVerified } });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const resendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email is required" });
        const user = await Usermodel.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        if (user.isVerified) return res.status(400).json({ success: false, message: "Email already verified" });
        const verficationToken = Math.floor(100000 + Math.random() * 900000).toString();
        user.verficationToken = verficationToken;
        user.verficationTokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
        await user.save();
        await sendVerificationEamil(user.email, verficationToken);
        return res.status(200).json({ success: true, message: "Verification email resent" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = req.user;
        res.json({
            success: true,
            user: {
                email: user.email,
                name: user.name,
                role: user.role,
                isVerified: user.isVerified,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        const { name } = req.body;
        if (name) user.name = name;
        await user.save();
        res.json({
            success: true,
            message: "Profile updated successfully",
            user: {
                email: user.email,
                name: user.name,
                role: user.role,
                isVerified: user.isVerified,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Both current and new password are required." });
        }
        const user = await Usermodel.findById(req.user._id);
        const isMatch = await bcryptjs.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Current password is incorrect." });
        }
        user.password = await bcryptjs.hash(newPassword, 10);
        await user.save();
        res.json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export { Reigster, VerfiyEmail, forgotPassword, verifyResetOTP, resetPassword, login, resendVerificationEmail, getProfile, updateProfile, changePassword } 