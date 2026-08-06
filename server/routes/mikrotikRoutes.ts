import { Router } from 'express';
import { 
  listRouters, testConnection, addRouter, editRouter, deleteRouter,
  listProfiles, addProfile, editProfile, deleteProfile, pushProfileToMikrotik, getRouterProfiles, linkPackage, syncProfilesFromMikrotik,
  listIpPools, addIpPool, editIpPool, deleteIpPool, syncIpPoolsFromMikrotik, pushIpPoolToMikrotik,
  getPppActiveUsers, importPppSecrets, importHotspotUsers
} from '../controllers/mikrotikController.js';

const router = Router();

// Routers
router.get('/routers', listRouters);
router.post('/routers/test-connection', testConnection);
router.post('/routers', addRouter);
router.put('/routers/:id', editRouter);
router.delete('/routers/:id', deleteRouter);

// Router Profiles
router.get('/router-profiles', listProfiles);
router.post('/router-profiles', addProfile);
router.put('/router-profiles/:id', editProfile);
router.delete('/router-profiles/:id', deleteProfile);
router.post('/router-profiles/:id/push-to-mikrotik', pushProfileToMikrotik);
router.get('/routers/:id/profiles', getRouterProfiles);
router.put('/router-profiles/:id/link-package', linkPackage);
router.post('/routers/:id/sync', syncProfilesFromMikrotik);

// IP Pools
router.get('/ip-pools', listIpPools);
router.post('/ip-pools', addIpPool);
router.put('/ip-pools/:id', editIpPool);
router.delete('/ip-pools/:id', deleteIpPool);
router.post('/routers/:id/sync-ip-pools', syncIpPoolsFromMikrotik);
router.post('/ip-pools/:id/push-to-mikrotik', pushIpPoolToMikrotik);

// Live Active Sessions & Imports
router.get('/routers/ppp-active-users', getPppActiveUsers);
router.post('/routers/:id/import-ppp-secrets', importPppSecrets);
router.post('/routers/:id/import-hotspot-users', importHotspotUsers);

export default router;
