import { Request, Response } from 'express';
import { getFtthMapTopology, saveFtthMapTopology, getSplitterTypes, addSplitterType, deleteSplitterType } from '../models/ftthMapModel.js';

export async function getFtthMap(req: Request, res: Response) {
  try {
    const topology = await getFtthMapTopology();
    res.json({ success: true, data: topology });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function saveFtthMap(req: Request, res: Response) {
  try {
    const { nodes, lines } = req.body;
    if (!Array.isArray(nodes) || !Array.isArray(lines)) {
      return res.status(400).json({ success: false, message: 'Format data nodes dan lines tidak valid!' });
    }

    const result = await saveFtthMapTopology(nodes, lines);
    res.json({ success: true, message: 'Data Peta Topologi FTTH Berhasil Disimpan ke Database!', ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getSplitterTypesHandler(req: Request, res: Response) {
  try {
    const types = await getSplitterTypes();
    res.json({ success: true, data: types });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function addSplitterTypeHandler(req: Request, res: Response) {
  try {
    const type = await addSplitterType(req.body);
    res.json({ success: true, message: 'Tipe Splitter Berhasil Disimpan ke Master Catalog!', data: type });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteSplitterTypeHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await deleteSplitterType(id);
    res.json({ success: true, message: 'Tipe Splitter Berhasil Dihapus dari Master Catalog!' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function syncToFirebaseHandler(req: Request, res: Response) {
  try {
    const { migrateAllPgDataToFirestore } = await import('../migratePgToFirestore.js');
    const result = await migrateAllPgDataToFirestore();
    res.json({ success: true, message: 'Seluruh data PostgreSQL berhasil disalin ke Firebase Cloud Firestore!', ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal sinkronisasi data ke Firebase: ${err.message}` });
  }
}
