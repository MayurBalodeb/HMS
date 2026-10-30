function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Duplicate entry / conflict with existing record.' });
  }
  if (err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.publicMessage || 'Internal server error. Please try again later.'
  });
}

module.exports = errorHandler;
