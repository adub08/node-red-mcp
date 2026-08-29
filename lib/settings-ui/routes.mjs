/**
 * Mount settings UI routes on an Express router.
 */

import express from 'express';
import { buildSettingsHandlers } from './handlers.mjs';

/**
 * @param {object} configStore
 * @param {number} httpPort
 * @returns {import('express').Router}
 */
export function createSettingsRouter(configStore, httpPort) {
  const router = express.Router();
  const handlers = buildSettingsHandlers(configStore, httpPort);

  router.get('/settings', handlers.settingsPage);
  router.get('/settings.css', handlers.settingsCss);
  router.get('/settings.js', handlers.settingsJs);

  router.get('/api/settings/info', handlers.getInfo);
  router.get('/api/settings/connection', handlers.getConnection);
  router.post('/api/settings/connection', handlers.postConnection);
  router.get('/api/settings/tools', handlers.getTools);
  router.post('/api/settings/tools', handlers.postTools);
  router.get('/api/settings/security', handlers.getSecurity);
  router.post('/api/settings/security', handlers.postSecurity);
  router.post('/api/settings/regenerate-secret', handlers.postRegenerateSecret);
  router.get('/api/settings/advanced', handlers.getAdvanced);
  router.post('/api/settings/advanced', handlers.postAdvanced);
  router.get('/api/settings/diagnostics', handlers.getDiagnostics);

  return router;
}
