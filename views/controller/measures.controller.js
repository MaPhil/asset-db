import { MEASURE_HEADERS } from '../../lib/measuresHeaders.js';

export const renderMeasures = (req, res) => {
  res.render('measures', {
    nav: 'measures',
    expectedHeaders: MEASURE_HEADERS
  });
};
