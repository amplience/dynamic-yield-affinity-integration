import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";
import addFormats from "ajv-formats";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const SCHEMA_DIRECTORY = path.join(ROOT, "content-type-schemas");

export const CORE_ID = "http://bigcontent.io/cms/schema/v1/core";
export const CORE_CONTENT_REF = `${CORE_ID}#/definitions/content`;
export const CORE_CONTENT_LINK_REF = `${CORE_ID}#/definitions/content-link`;
export const CORE_IMAGE_LINK_REF = `${CORE_ID}#/definitions/image-link`;

const SCHEMA_PREFIX =
  "https://schema-examples.com/dynamic-yield-affinity-integration/";

export const SCHEMA_IDS = Object.freeze({
  affinityGroup: `${SCHEMA_PREFIX}affinity-group`,
  affinityValue: `${SCHEMA_PREFIX}affinity-value`,
  targeting: `${SCHEMA_PREFIX}targeting`,
  contentContainer: `${SCHEMA_PREFIX}content-container`,
  exampleBanner: `${SCHEMA_PREFIX}example-banner`,
});

// A local draft-7 model of the Amplience core definitions used by this starter.
// It mirrors the documented required fields while keeping validation offline.
const AMPLIENCE_CORE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: CORE_ID,
  definitions: {
    meta: {
      type: "object",
      properties: {
        schema: { type: "string", format: "uri" },
        name: { type: "string", minLength: 0, maxLength: 150 },
      },
      required: ["schema"],
    },
    content: {
      type: "object",
      properties: {
        _meta: { $ref: "#/definitions/meta" },
      },
      required: ["_meta"],
    },
    "content-link": {
      type: "object",
      properties: {
        _meta: {
          allOf: [
            { $ref: "#/definitions/meta" },
            {
              properties: {
                schema: { enum: [CORE_CONTENT_LINK_REF] },
              },
            },
          ],
        },
        id: { type: "string" },
        contentType: { type: "string", format: "uri" },
      },
      required: ["_meta", "id", "contentType"],
    },
    "image-link": {
      type: "object",
      properties: {
        _meta: {
          allOf: [
            { $ref: "#/definitions/meta" },
            {
              properties: {
                schema: { enum: [CORE_IMAGE_LINK_REF] },
              },
            },
          ],
        },
        id: { type: "string" },
        name: { type: "string" },
        endpoint: { type: "string" },
        defaultHost: { type: "string" },
        mimeType: { type: "string" },
        altText: { type: "string" },
      },
      required: ["_meta", "id", "name", "endpoint", "defaultHost"],
    },
  },
};

async function listJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export async function loadSchemas() {
  const files = await listJsonFiles(SCHEMA_DIRECTORY);

  return Promise.all(
    files.map(async (file) => ({
      file,
      schema: JSON.parse(await readFile(file, "utf8")),
    })),
  );
}

export async function createSchemaValidator() {
  const schemas = await loadSchemas();
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(AMPLIENCE_CORE_SCHEMA);

  for (const { file, schema } of schemas) {
    if (!ajv.validateSchema(schema)) {
      throw new Error(
        `${path.relative(ROOT, file)} is not a valid draft-7 schema:\n${ajv.errorsText(
          ajv.errors,
          { separator: "\n" },
        )}`,
      );
    }
    ajv.addSchema(schema);
  }

  for (const { file, schema } of schemas) {
    if (!ajv.getSchema(schema.$id)) {
      throw new Error(`Could not compile ${path.relative(ROOT, file)}.`);
    }
  }

  return { ajv, schemas };
}

export function formatValidationErrors(errors) {
  return (errors ?? [])
    .map(
      ({ instancePath, message, params }) =>
        `${instancePath || "/"} ${message} ${JSON.stringify(params)}`,
    )
    .join("\n");
}
