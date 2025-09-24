import { Router } from 'express';
import routes from './routes/index.js';

const v1 = Router();
v1.use('/', routes);

export default v1;
