import { Router } from 'express';
import { 
  getFtthMap, 
  saveFtthMap, 
  getSplitterTypesHandler, 
  addSplitterTypeHandler, 
  deleteSplitterTypeHandler, 
  syncToFirebaseHandler,
  getFtthTrafficHistory,
  triggerTrafficRollupManual
} from '../controllers/ftthMapController.js';

const router = Router();

router.get('/map', getFtthMap);
router.post('/map/save', saveFtthMap);
router.post('/map/sync-to-firebase', syncToFirebaseHandler);

router.get('/splitter-types', getSplitterTypesHandler);
router.post('/splitter-types', addSplitterTypeHandler);
router.delete('/splitter-types/:id', deleteSplitterTypeHandler);

// FTTH Traffic History (30-day Rollup & Live stats)
router.get('/traffic/history', getFtthTrafficHistory);
router.post('/traffic/trigger-rollup', triggerTrafficRollupManual);

export default router;
