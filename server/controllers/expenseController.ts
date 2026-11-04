import { Request, Response } from 'express';
import {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getFinancialProfitLossSummary
} from '../models/expenseModel.js';

export async function listExpenses(req: Request, res: Response) {
  try {
    const { startDate, endDate, category, search, limit, offset } = req.query;
    const expenses = await getExpenses({
      startDate: startDate as string,
      endDate: endDate as string,
      category: category as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined
    });
    res.json({ success: true, expenses });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getSingleExpense(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const expense = await getExpenseById(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
    }
    res.json({ success: true, expense });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createNewExpense(req: Request, res: Response) {
  try {
    const { title, category, amount, expense_date, payment_method, vendor, notes, receipt_url } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Judul atau keperluan pengeluaran wajib diisi.' });
    }

    if (amount === undefined || amount === null || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Nominal pengeluaran harus lebih besar dari 0.' });
    }

    const expense = await createExpense({
      title: title.trim(),
      category: category || 'operasional',
      amount: Number(amount),
      expense_date: expense_date || new Date().toISOString().split('T')[0],
      payment_method: payment_method || 'cash',
      vendor: vendor ? vendor.trim() : '',
      notes: notes ? notes.trim() : '',
      receipt_url: receipt_url || '',
      created_by: (req as any).user?.username || 'owner'
    });

    res.status(201).json({
      success: true,
      message: 'Catatan pengeluaran berhasil disimpan.',
      expense
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateExistingExpense(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { title, category, amount, expense_date, payment_method, vendor, notes, receipt_url } = req.body;

    const existing = await getExpenseById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
    }

    const updated = await updateExpense(id, {
      title,
      category,
      amount: amount !== undefined ? Number(amount) : undefined,
      expense_date,
      payment_method,
      vendor,
      notes,
      receipt_url
    });

    res.json({
      success: true,
      message: 'Catatan pengeluaran berhasil diperbarui.',
      expense: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function removeExpense(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const success = await deleteExpense(id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan atau gagal dihapus.' });
    }
    res.json({ success: true, message: 'Catatan pengeluaran berhasil dihapus.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getProfitLoss(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query;
    const report = await getFinancialProfitLossSummary(startDate as string, endDate as string);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

