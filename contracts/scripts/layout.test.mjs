// Regression fixtures for the storage layout rules (layout.mjs, B-17). Run: node --test scripts/layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { incompatibilities, normalize } from "./layout.mjs";

const member = (label, slot, offset, type) => ({ label, slot: String(slot), offset, type });
const struct = (name, bytes, members) => ({
  encoding: "inplace",
  label: `struct ${name}`,
  numberOfBytes: String(bytes),
  members,
});

/// forge inspect output: Root { uint64 seq; mapping(uint64 => Item) items; Entry[] entries; }
/// Item lives only in a mapping, Entry inline in an array.
function base() {
  return {
    storage: [{ label: "core", slot: "0", offset: 0, type: "t_struct(Root)1_storage" }],
    types: {
      t_uint64: { encoding: "inplace", label: "uint64", numberOfBytes: "8" },
      t_uint128: { encoding: "inplace", label: "uint128", numberOfBytes: "16" },
      "t_mapping(t_uint64,t_struct(Item)2_storage)": {
        encoding: "mapping",
        label: "mapping(uint64 => struct Item)",
        numberOfBytes: "32",
        key: "t_uint64",
        value: "t_struct(Item)2_storage",
      },
      "t_array(t_struct(Entry)3_storage)dyn_storage": {
        encoding: "dynamic_array",
        label: "struct Entry[]",
        numberOfBytes: "32",
        base: "t_struct(Entry)3_storage",
      },
      "t_struct(Root)1_storage": struct("Root", 96, [
        member("seq", 0, 0, "t_uint64"),
        member("items", 1, 0, "t_mapping(t_uint64,t_struct(Item)2_storage)"),
        member("entries", 2, 0, "t_array(t_struct(Entry)3_storage)dyn_storage"),
      ]),
      "t_struct(Item)2_storage": struct("Item", 32, [member("a", 0, 0, "t_uint64")]),
      "t_struct(Entry)3_storage": struct("Entry", 32, [member("x", 0, 0, "t_uint64")]),
    },
  };
}

const check = (edit) => {
  const now = base();
  edit(now);
  return incompatibilities(normalize(base()), normalize(now));
};

test("only AST ids changed: same layout", () => {
  const raw = JSON.parse(JSON.stringify(base()).replaceAll(")2_", ")52_"));
  assert.deepEqual(normalize(raw), normalize(base()));
});

test("appended fields are compatible, in a mapping value and in the root", () => {
  assert.deepEqual(
    check((l) => {
      const item = l.types["t_struct(Item)2_storage"];
      item.members.push(member("b", 1, 0, "t_uint128"));
      item.numberOfBytes = "64";
      const root = l.types["t_struct(Root)1_storage"];
      root.members.push(member("next", 3, 0, "t_uint64"));
      root.numberOfBytes = "128";
    }),
    [],
  );
});

test("a small field appended to an inline struct that keeps its size is compatible", () => {
  assert.deepEqual(
    check((l) => l.types["t_struct(Entry)3_storage"].members.push(member("y", 0, 8, "t_uint64"))),
    [],
  );
});

test("a field inserted in the middle moves the next ones", () => {
  const errors = check((l) => {
    const root = l.types["t_struct(Root)1_storage"];
    root.members.splice(1, 0, member("extra", 1, 0, "t_uint64"));
    root.members[2].slot = "2";
    root.members[3].slot = "3";
    root.numberOfBytes = "128";
  });
  assert.match(errors.join("\n"), /Root\.items .* is now extra/);
});

test("renamed and retyped fields are incompatible", () => {
  assert.match(
    check((l) => (l.types["t_struct(Item)2_storage"].members[0].label = "b")).join(),
    /Item\.a .* is now b/,
  );
  assert.match(
    check((l) => (l.types["t_struct(Item)2_storage"].members[0].type = "t_uint128")).join(),
    /Item\.a .*t_uint64.* is now a .*t_uint128/,
  );
});

test("a removed field is incompatible", () => {
  assert.match(
    check((l) => l.types["t_struct(Root)1_storage"].members.pop()).join(),
    /Root\.entries removed/,
  );
});

test("an inline struct that grows is incompatible", () => {
  const errors = check((l) => {
    const entry = l.types["t_struct(Entry)3_storage"];
    entry.members.push(member("y", 1, 0, "t_uint128"));
    entry.numberOfBytes = "64";
  });
  assert.match(errors.join(), /struct Entry is stored inline and its size went 32 → 64/);
});

test("a mapping value may grow while it gets its first inline use in an appended field", () => {
  assert.deepEqual(
    check((l) => {
      const item = l.types["t_struct(Item)2_storage"];
      item.members.push(member("b", 1, 0, "t_uint128"));
      item.numberOfBytes = "64";
      const root = l.types["t_struct(Root)1_storage"];
      root.members.push(member("last", 3, 0, "t_struct(Item)2_storage"));
      root.numberOfBytes = "160";
    }),
    [],
  );
});

test("a fixed array that changes length is incompatible", () => {
  const withArray = (length) => (l) => {
    l.types[`t_array(t_uint64)${length}_storage`] = {
      encoding: "inplace",
      label: `uint64[${length}]`,
      numberOfBytes: "32",
      base: "t_uint64",
    };
    l.types["t_struct(Item)2_storage"].members.push(
      member("list", 1, 0, `t_array(t_uint64)${length}_storage`),
    );
  };
  const old = base();
  withArray(4)(old);
  const now = base();
  withArray(3)(now);
  assert.match(
    incompatibilities(normalize(old), normalize(now)).join(),
    /Item\.list .*t_array\(t_uint64\)4_storage.* is now list .*t_array\(t_uint64\)3_storage/,
  );
});

test("same-name structs from different files cannot be checked", () => {
  const l = base();
  l.types["t_struct(Item)9_storage"] = struct("Item", 32, [member("a", 0, 0, "t_uint128")]);
  assert.throws(() => normalize(l), /t_struct\(Item\)2_storage and t_struct\(Item\)9_storage/);
});

test("stored enums are rejected", () => {
  const l = base();
  l.types["t_enum(Kind)7"] = { encoding: "inplace", label: "enum Kind", numberOfBytes: "1" };
  assert.throws(() => normalize(l), /enum Kind: enums cannot be stored/);
});
