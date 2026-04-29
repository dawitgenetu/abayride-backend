const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation error",
      errors: parsed.error.flatten().fieldErrors,
    });
  }
  req.validatedBody = parsed.data;
  next();
};

module.exports = { validate };
