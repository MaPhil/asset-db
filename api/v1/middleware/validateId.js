export const validateId = (param = 'id') => (req, res, next) => {
  const value = Number(req.params[param]);
  if (!Number.isInteger(value) || value < 1) {
    return res.status(400).json({ error: 'Ungültige ID.' });
  }
  return next();
};
