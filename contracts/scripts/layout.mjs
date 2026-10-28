// Storage layout compatibility for upgrades (B-17), on `forge inspect … storageLayout --json` output.
// Used by storage-layout.mjs; tested by layout.test.mjs.

// solc type ids carry AST ids (t_struct(Player)253_storage) that change with any edit.
const norm = (id) => id?.replace(/(t_(?:struct|enum|contract)\([^)]*\))\d+/g, "$1");

/// The layout without AST ids. Throws when it cannot be checked: two types that only differ by
/// AST id (same-name structs from different files) or a stored enum (solc does not report its
/// variants, so a reordering would go unseen; stored codes are uint8 constants, B-17).
export function normalize(raw) {
  const types = {};
  const from = {};
  for (const [id, t] of Object.entries(raw.types).sort(([a], [b]) => a.localeCompare(b))) {
    if (id.startsWith("t_enum(")) throw new Error(`${t.label}: enums cannot be stored (B-17)`);
    const key = norm(id);
    if (from[key]) throw new Error(`${from[key]} and ${id} share a name: rename one`);
    from[key] = id;
    types[key] = {
      label: t.label,
      encoding: t.encoding,
      numberOfBytes: t.numberOfBytes,
      ...(t.base && { base: norm(t.base) }),
      ...(t.key && { key: norm(t.key) }),
      ...(t.value && { value: norm(t.value) }),
      ...(t.members && {
        members: t.members.map((m) => ({
          label: m.label,
          slot: m.slot,
          offset: m.offset,
          type: norm(m.type),
        })),
      }),
    };
  }
  return { root: norm(raw.storage[0].type), types };
}

/// Why `now` cannot replace `old` in place: every field `old` had keeps its position, name and
/// type, and a struct `old` stored inline (array element, field of another struct) keeps its size.
/// Mapping values and the root may grow: their new fields take fresh slots.
export function incompatibilities(old, now) {
  const errors = [];
  if (old.root !== now.root) errors.push(`root type ${old.root} became ${now.root}`);
  const inline = new Set();
  for (const t of Object.values(old.types)) {
    if (t.base) inline.add(t.base);
    for (const m of t.members ?? []) inline.add(m.type);
  }
  for (const [id, was] of Object.entries(old.types)) {
    const is = now.types[id];
    if (!is) continue; // no longer used: the reference that pointed to it changed and is reported
    if (!was.members) {
      if (JSON.stringify(was) !== JSON.stringify(is)) errors.push(`${id} changed`);
      continue;
    }
    was.members.forEach((m, i) => {
      const n = is.members?.[i];
      if (!n) errors.push(`${was.label}.${m.label} removed`);
      else if (JSON.stringify(m) !== JSON.stringify(n))
        errors.push(
          `${was.label}.${m.label} (slot ${m.slot}, offset ${m.offset}, ${m.type}) is now ` +
            `${n.label} (slot ${n.slot}, offset ${n.offset}, ${n.type})`,
        );
    });
    if (inline.has(id) && is.numberOfBytes !== was.numberOfBytes)
      errors.push(
        `${was.label} is stored inline and its size went ${was.numberOfBytes} → ${is.numberOfBytes}`,
      );
  }
  return errors;
}
