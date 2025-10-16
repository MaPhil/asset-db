import { Router } from 'express';
import path from 'path';

import formHandler from './middleware/formHandler.js';
import apiV1 from './v1/index.js';

const api = Router();

api.use(
  formHandler({
    uploadDir: path.join(process.cwd(), 'uploads'),
    fileField: 'file'
  })
);

api.use('/v1', apiV1);

export default api;
