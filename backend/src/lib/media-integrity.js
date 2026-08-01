function normalizedPath(value) {
  return String(value || '')
    .replace(/\.\$\[[^\]]+\]/g, '')
    .replace(/\.\$\[]/g, '')
    .replace(/\.\d+(?=\.|$)/g, '');
}

function isProtectedPath(candidate, protectedPaths) {
  const normalized = normalizedPath(candidate);
  return protectedPaths.some((path) => normalized === path || normalized.startsWith(`${path}.`));
}

/**
 * Media-bearing models use this guard to make PATCH semantics explicit:
 * omitted/nullish media is preserved; an empty string/array or $unset is an
 * intentional removal. Whole-document replacement is forbidden because it
 * cannot distinguish an omitted media field from a deletion.
 */
export function mediaIntegrityPlugin(schema, options = {}) {
  const protectedPaths = [...new Set(options.paths || [])].filter(Boolean);
  if (!protectedPaths.length) return;

  for (const operation of ['findOneAndUpdate', 'updateOne', 'updateMany']) {
    schema.pre(operation, function protectMediaUpdate() {
      const update = this.getUpdate();
      if (!update || Array.isArray(update)) return;
      const containers = [update, update.$set].filter(Boolean);
      for (const container of containers) {
        for (const [key, value] of Object.entries(container)) {
          if (isProtectedPath(key, protectedPaths) && (value === undefined || value === null)) {
            delete container[key];
          }
        }
      }
    });
  }

  for (const operation of ['replaceOne', 'findOneAndReplace']) {
    schema.pre(operation, function rejectUnsafeReplacement() {
      const error = new Error(`Whole-document replacement is disabled for media-bearing ${options.entity || 'records'}; use an explicit $set/$unset patch`);
      error.code = 'UNSAFE_MEDIA_REPLACEMENT';
      error.statusCode = 409;
      throw error;
    });
  }
}

export function ownDefinedFields(input, fields) {
  return Object.fromEntries(fields
    .filter((field) => Object.prototype.hasOwnProperty.call(input || {}, field))
    .filter((field) => input[field] !== undefined && input[field] !== null)
    .map((field) => [field, input[field]]));
}
