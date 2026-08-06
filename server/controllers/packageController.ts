import { Request, Response } from 'express';
import { getAllPackages, createPackage, updatePackage, deletePackage } from '../models/packageModel.js';

export async function listPackages(req: Request, res: Response) {
  try {
    const packages = await getAllPackages();
    res.json({ success: true, packages });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function addPackage(req: Request, res: Response) {
  const { name, price, type } = req.body;
  if (!name || !price || !type) {
    return res.status(400).json({ success: false, message: 'Nama paket, tipe, dan harga wajib diisi.' });
  }

  try {
    const pkg = await createPackage(req.body);
    res.json({
      success: true,
      message: `Paket Internet "${name}" berhasil dibuat!`,
      package: pkg
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editPackage(req: Request, res: Response) {
  const { id } = req.params;
  const { name, price, type } = req.body;

  if (!name || !price || !type) {
    return res.status(400).json({ success: false, message: 'Nama paket, tipe, dan harga wajib diisi.' });
  }

  try {
    const pkg = await updatePackage(id, req.body);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Paket Internet tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Paket Internet "${name}" berhasil diperbarui!`,
      package: pkg
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function removePackage(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const pkg = await deletePackage(id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Paket Internet tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Paket "${pkg.name}" berhasil dihapus!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
