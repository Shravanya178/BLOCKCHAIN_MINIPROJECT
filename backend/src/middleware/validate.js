'use strict';

const AppError = require('../utils/AppError');

/**
 * Validates req[source] with a Zod schema and replaces it with the parsed value.
 * Usage: validate(schema) or validate(schema, 'query').
 */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.') || source, message: i.message }));
    return next(AppError.validation('Request validation failed', details));
  }
  if (source === 'query') {
    // req.query is a getter in some Express versions; store parsed copy separately.
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }
  return next();
};

module.exports = validate;
