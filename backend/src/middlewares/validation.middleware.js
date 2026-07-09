export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          error: 'Please check your input details',
          details: error.issues,
        });
      }
      next(error);
    }
  };
}
