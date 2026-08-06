import { Request, Response } from 'express';
import { getAllUsers, createUser, updateUser, updateOwnerProfile } from '../models/userModel.js';

export async function listUsers(req: Request, res: Response) {
  try {
    const users = await getAllUsers();
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function addUser(req: Request, res: Response) {
  const { username, name, email, phone_number, role, password } = req.body;

  if (!username || !name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Harap lengkapi username, name, email, dan password.' });
  }

  try {
    const user = await createUser({ username, name, email, phone_number, role, password });
    res.json({
      success: true,
      message: 'User berhasil dibuat dan tersinkronisasi ke PostgreSQL VPS!',
      user
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editUser(req: Request, res: Response) {
  const { id } = req.params;
  const { name, username, email, phone_number, role, password } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Nama dan Email wajib diisi.' });
  }

  try {
    const user = await updateUser(id, { name, username, email, phone_number, role, password });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `User "${user.name}" berhasil diperbarui! Role: ${user.role.toUpperCase()}`,
      user
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editProfile(req: Request, res: Response) {
  const { userId, name, email, phone_number } = req.body;

  try {
    const user = await updateOwnerProfile(userId, { name, email, phone_number });
    return res.json({
      success: true,
      message: 'Profil Owner di database VPS berhasil diperbarui!',
      user
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
