import { Usermodel } from '../models/User.js';
import bcryptjs from 'bcryptjs';

// List/search/filter users
export const listUsers = async (req, res) => {
  try {
    const { search, role, isVerified, page = 1, limit = 20 } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';
    const users = await Usermodel.find(query)
      .select('-password')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });
    const total = await Usermodel.countDocuments(query);
    res.json({ success: true, users, total });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get single user details
export const getUser = async (req, res) => {
  try {
    const user = await Usermodel.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update user (role, suspend, etc.)
export const updateUser = async (req, res) => {
  try {
    const { role, isVerified, name, suspend } = req.body;
    const user = await Usermodel.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (role) user.role = role;
    if (isVerified !== undefined) user.isVerified = isVerified;
    if (name) user.name = name;
    if (suspend !== undefined) user.suspend = suspend;
    await user.save();
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const user = await Usermodel.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Admin resets user password
export const adminResetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ success: false, message: 'New password required' });
    const user = await Usermodel.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.password = await bcryptjs.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Basic analytics
export const analytics = async (req, res) => {
  try {
    const totalUsers = await Usermodel.countDocuments();
    const verifiedUsers = await Usermodel.countDocuments({ isVerified: true });
    const admins = await Usermodel.countDocuments({ role: 'admin' });
    const users = await Usermodel.countDocuments({ role: 'user' });
    const recentUsers = await Usermodel.find().sort({ createdAt: -1 }).limit(5).select('email name createdAt');
    res.json({ success: true, totalUsers, verifiedUsers, admins, users, recentUsers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}; 