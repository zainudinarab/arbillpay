import { Router } from 'express';
import { getFtthMap, saveFtthMap, getSplitterTypesHandler, addSplitterTypeHandler, deleteSplitterTypeHandler, syncToFirebaseHandler } from '../controllers/ftthMapController.js';

const router = Router();

router.get('/map', getFtthMap);
router.post('/map/save', saveFtthMap);
router.post('/map/sync-to-firebase', syncToFirebaseHandler);

router.get('/splitter-types', getSplitterTypesHandler);
router.post('/splitter-types', addSplitterTypeHandler);
router.delete('/splitter-types/:id', deleteSplitterTypeHandler);

export default router;
