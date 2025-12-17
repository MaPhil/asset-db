import { readCoverageReport } from '../../lib/reports.js';

export const redirectToAbdeckungReport = (req, res) => {
  res.redirect('/reports/abdeckung');
};

export const renderAbdeckungReport = (req, res) => {
  const reportState = readCoverageReport();

  res.render('reports', {
    nav: 'reports',
    reportState
  });
};
