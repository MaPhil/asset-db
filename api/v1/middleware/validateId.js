export const validateId = (param = 'id') => (req, res, next) => {
  const value = req.params[param];
  if (typeof value !== 'string' || !value.trim()) {
    return res.status(400).json({ error: 'Ungültige ID.' });
  }

  const trimmed = value.trim();
  const isNumeric = /^[0-9]+$/.test(trimmed);
  const isUuid = /^[0-9a-fA-F-]{8,}$/.test(trimmed);

  if (!isNumeric && !isUuid) {
    return res.status(400).json({ error: 'Ungültige ID.' });
  }

  req.params[param] = trimmed;
  return next();
};
