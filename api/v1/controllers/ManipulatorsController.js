import { createManipulator, listManipulators } from '../../../lib/manipulators.js';
import { logger } from '../../../lib/logger.js';

export const ManipulatorsController = {
  async list(req, res) {
    try {
      const result = listManipulators();
      res.json(result);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Manipulators could not be loaded', error);
      } else {
        logger.warn('Manipulators could not be loaded', { error: error.message });
      }
      res.status(status).json({ error: error.message || 'Manipulators could not be loaded.' });
    }
  },
  async create(req, res) {
    try {
      const entry = createManipulator(req.body);
      res.status(201).json(entry);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Manipulator could not be created', error, { payload: req.body });
      } else {
        logger.warn('Manipulator could not be created', {
          error: error.message,
          payload: req.body
        });
      }
      res.status(status).json({ error: error.message || 'Manipulator could not be created.' });
    }
  }
};
