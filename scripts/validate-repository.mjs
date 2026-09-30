import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CORE_CONTENT_LINK_REF,
  CORE_CONTENT_REF,
  CORE_ID,
  CORE_IMAGE_LINK_REF,
  ROOT,
  SCHEMA_IDS,
  createSchemaValidator,
} from "./schema-validation.mjs";

const EXPECTED_SCHEMA_FILES = new Set([
  "content-type-schemas/affinity-group.json",
  "content-type-schemas/affinity-value.json",
  "content-type-schemas/content-container.json",
  "content-type-schemas/example-banner.json",
  "content-type-schemas/partials/targeting.json",
]);

const EXPECTED_DELIVERY_KEYS = Object.freeze({
  affinityBrand: "dynamic-yield/affinities/brand",
  affinityGender: "dynamic-yield/affinities/gender",
  targetingLifecycleStage: "dynamic-yield/targeting/lifecycle-stage",
});

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectValues(node, key, values = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectValues(item, key, values);
  } else if (node && typeof node === "object") {
    for (const [entryKey, value] of Object.entries(node)) {
      if (entryKey === key) values.push(value);
      collectValues(value, key, values);
    }
  }
  return values;
}

function assertSchemaContracts(schemas, ajv) {
  const actualFiles = new Set(
    schemas.map(({ file }) =>
      path.relative(ROOT, file).split(path.sep).join("/"),
    ),
  );
  ensure(
    actualFiles.size === EXPECTED_SCHEMA_FILES.size &&
      [...actualFiles].every((file) => EXPECTED_SCHEMA_FILES.has(file)),
    `Expected exactly these schema files: ${[...EXPECTED_SCHEMA_FILES].join(", ")}`,
  );

  const schemaById = new Map(schemas.map(({ schema }) => [schema.$id, schema]));
  ensure(schemaById.size === schemas.length, "Schema IDs must be unique.");

  for (const expectedId of Object.values(SCHEMA_IDS)) {
    ensure(schemaById.has(expectedId), `Missing schema ID: ${expectedId}`);
  }

  const knownIds = new Set([CORE_ID, ...schemaById.keys()]);
  for (const { file, schema } of schemas) {
    for (const reference of collectValues(schema, "$ref")) {
      const [base] = reference.split("#");
      ensure(
        base === "" || knownIds.has(base),
        `${path.relative(ROOT, file)} has an unapproved reference: ${reference}`,
      );
      ensure(
        ajv.getSchema(reference) || ajv.compile({ $ref: reference }),
        `${path.relative(ROOT, file)} has an unresolved reference: ${reference}`,
      );
    }
  }

  const fullContentIds = [
    SCHEMA_IDS.affinityGroup,
    SCHEMA_IDS.affinityValue,
    SCHEMA_IDS.contentContainer,
    SCHEMA_IDS.exampleBanner,
  ];
  for (const id of fullContentIds) {
    const schema = schemaById.get(id);
    ensure(
      schema.allOf?.some((entry) => entry.$ref === CORE_CONTENT_REF),
      `${id} must include the Amplience core content definition.`,
    );
  }

  const partial = schemaById.get(SCHEMA_IDS.targeting);
  ensure(
    Object.keys(partial).sort().join(",") ===
      ["$id", "$schema", "definitions"].sort().join(","),
    "The targeting partial must be definitions-only.",
  );
  ensure(
    Object.keys(partial.definitions).join(",") === "targeting",
    "The targeting partial must expose only the targeting definition.",
  );

  const targetingFields = partial.definitions.targeting.properties;
  ensure(
    Object.keys(targetingFields).sort().join(",") ===
      Object.keys(EXPECTED_DELIVERY_KEYS).sort().join(","),
    "The targeting definition has an unexpected field set.",
  );
  for (const [fieldName, deliveryKey] of Object.entries(
    EXPECTED_DELIVERY_KEYS,
  )) {
    const field = targetingFields[fieldName];
    ensure(field.type === "array", `${fieldName} must be an array.`);
    ensure(
      field["ui:extension"]?.name === "hierarchy-chooser",
      `${fieldName} must use the hierarchy-chooser extension.`,
    );
    ensure(
      field["ui:extension"].params?.deliveryKey === deliveryKey,
      `${fieldName} must use delivery key ${deliveryKey}.`,
    );
    ensure(
      field["ui:extension"].params?.type === "chip",
      `${fieldName} must use the chip display.`,
    );
    ensure(
      collectValues(field.items, "$ref").includes(CORE_CONTENT_LINK_REF),
      `${fieldName} must contain Amplience content links.`,
    );
    ensure(
      collectValues(field.items, "enum").some(
        (values) =>
          Array.isArray(values) && values.includes(SCHEMA_IDS.affinityValue),
      ),
      `${fieldName} must restrict links to affinity values.`,
    );
  }

  const group = schemaById.get(SCHEMA_IDS.affinityGroup);
  ensure(
    group["trait:hierarchy"]?.childContentTypes?.length === 1 &&
      group["trait:hierarchy"].childContentTypes[0] ===
        SCHEMA_IDS.affinityValue,
    "The affinity group must allow affinity values as children.",
  );
  ensure(
    group.required?.includes("label") && group.properties.label.minLength === 1,
    "The affinity group must require a non-empty label.",
  );

  const value = schemaById.get(SCHEMA_IDS.affinityValue);
  ensure(
    value["trait:hierarchy"]?.childContentTypes?.length === 0,
    "The affinity value must be a hierarchy leaf.",
  );
  ensure(
    value.required?.includes("label") &&
      value.required?.includes("value") &&
      value.properties.label.minLength === 1 &&
      value.properties.value.minLength === 1,
    "The affinity value must require non-empty label and value fields.",
  );

  const banner = schemaById.get(SCHEMA_IDS.exampleBanner);
  ensure(
    collectValues(banner.properties.image, "$ref").includes(
      CORE_IMAGE_LINK_REF,
    ),
    "The example banner must use the Amplience core image link.",
  );
  ensure(
    collectValues(banner.properties.targeting, "$ref").includes(
      `${SCHEMA_IDS.targeting}#/definitions/targeting`,
    ),
    "The example banner must reference the targeting partial.",
  );

  const container = schemaById.get(SCHEMA_IDS.contentContainer);
  ensure(
    container.required?.includes("content") &&
      container.properties.content.minItems === 1,
    "The content container must require at least one candidate.",
  );
  ensure(
    collectValues(container.properties.content.items, "enum").some(
      (values) =>
        Array.isArray(values) && values.includes(SCHEMA_IDS.exampleBanner),
    ),
    "The content container must accept the example banner.",
  );
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function assertLocalMarkdownLinks(files) {
  const markdownFiles = files.filter((file) => file.endsWith(".md"));
  let checkedLinks = 0;

  for (const file of markdownFiles) {
    const contents = await readFile(file, "utf8");
    const links = contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g);

    for (const match of links) {
      let target = match[1].trim().split(/\s+["']/)[0];
      if (target.startsWith("<") && target.endsWith(">")) {
        target = target.slice(1, -1);
      }
      if (target.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(target)) {
        continue;
      }

      const withoutFragment = target.split("#")[0];
      if (!withoutFragment) continue;
      const resolved = path.resolve(
        path.dirname(file),
        decodeURIComponent(withoutFragment),
      );
      try {
        await stat(resolved);
      } catch {
        throw new Error(
          `${path.relative(ROOT, file)} has a broken local link: ${target}`,
        );
      }
      checkedLinks += 1;
    }
  }

  return checkedLinks;
}

async function assertRepositoryHygiene(files) {
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    const lower = relative.toLowerCase();
    ensure(
      !lower.endsWith(".zip"),
      `Archive must not be committed: ${relative}`,
    );
    ensure(
      !lower.includes("__macosx") && !lower.endsWith(".ds_store"),
      `macOS metadata must not be committed: ${relative}`,
    );
  }

  const textExtensions = new Set([
    "",
    ".editorconfig",
    ".gitignore",
    ".json",
    ".jsonc",
    ".js",
    ".md",
    ".mjs",
    ".txt",
    ".yaml",
    ".yml",
  ]);
  const residuePatterns = [
    {
      name: "tenant-specific sample domain",
      pattern: new RegExp(["quadratic", "amplience", "com"].join("\\."), "i"),
    },
    {
      name: "non-portable short schema domain",
      pattern: new RegExp(
        "https?://" + ["dy", "com"].join("\\.") + "(?:/|\\b)",
        "i",
      ),
    },
    {
      name: "unfinished task marker",
      pattern: new RegExp("\\b" + "TO" + "(?:DO|FIXME)\\b", "i"),
    },
    {
      name: "unresolved insertion marker",
      pattern: new RegExp("\\[" + "INSERT\\b", "i"),
    },
    {
      name: "example owner placeholder",
      pattern: new RegExp("@" + "org/maintainers", "i"),
    },
    {
      name: "UUID",
      pattern:
        /\b[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\b/i,
    },
    {
      name: "private key",
      pattern: new RegExp(
        "-".repeat(5) +
          "BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY" +
          "-".repeat(5),
      ),
    },
    {
      name: "AWS access key",
      pattern: /\bAKIA[A-Z\d]{16}\b/,
    },
    {
      name: "GitHub token",
      pattern: /\bgh[pousr]_[A-Za-z\d_]{36,}\b/,
    },
  ];

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    const basename = path.basename(file);
    if (!textExtensions.has(extension) && basename !== "CODEOWNERS") continue;

    const contents = await readFile(file, "utf8");
    for (const { name, pattern } of residuePatterns) {
      ensure(
        !pattern.test(contents),
        `${path.relative(ROOT, file)} contains ${name}.`,
      );
    }
  }
}

export async function validateRepository() {
  const { ajv, schemas } = await createSchemaValidator();
  assertSchemaContracts(schemas, ajv);

  const files = await walk(ROOT);
  const checkedLinks = await assertLocalMarkdownLinks(files);
  await assertRepositoryHygiene(files);

  return {
    checkedFiles: files.length,
    checkedLinks,
    schemas: schemas.length,
  };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  try {
    const result = await validateRepository();
    console.log(`Validated ${result.schemas} schemas.`);
    console.log(`Resolved ${result.checkedLinks} local Markdown links.`);
    console.log(`Checked ${result.checkedFiles} repository files for residue.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
