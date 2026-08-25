import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ROOT,
  SCHEMA_IDS,
  createSchemaValidator,
  formatValidationErrors,
} from "../scripts/schema-validation.mjs";

const { ajv, schemas } = await createSchemaValidator();

const cases = [
  {
    name: "affinity group",
    schema: SCHEMA_IDS.affinityGroup,
    valid: "valid/affinity-group.json",
    invalid: "invalid/affinity-group-empty-label.json",
    invalidKeyword: "minLength",
  },
  {
    name: "affinity value",
    schema: SCHEMA_IDS.affinityValue,
    valid: "valid/affinity-value.json",
    invalid: "invalid/affinity-value-missing-value.json",
    invalidKeyword: "required",
  },
  {
    name: "targeting definition",
    schema: `${SCHEMA_IDS.targeting}#/definitions/targeting`,
    valid: "valid/targeting.json",
    invalid: "invalid/targeting-wrong-content-type.json",
    invalidKeyword: "enum",
  },
  {
    name: "example banner",
    schema: SCHEMA_IDS.exampleBanner,
    valid: "valid/example-banner.json",
    invalid: "invalid/example-banner-missing-headline.json",
    invalidKeyword: "required",
  },
  {
    name: "content container",
    schema: SCHEMA_IDS.contentContainer,
    valid: "valid/content-container.json",
    invalid: "invalid/content-container-empty.json",
    invalidKeyword: "minItems",
  },
];

async function loadFixture(relativePath) {
  const fixturePath = path.join(ROOT, "test", "fixtures", relativePath);
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

test("all five repository schemas compile", () => {
  assert.equal(schemas.length, 5);
  for (const { schema } of schemas) {
    assert.equal(typeof ajv.getSchema(schema.$id), "function");
  }
});

for (const fixtureCase of cases) {
  test(`${fixtureCase.name} accepts valid content`, async () => {
    const validate = ajv.getSchema(fixtureCase.schema);
    assert.equal(typeof validate, "function");

    const fixture = await loadFixture(fixtureCase.valid);
    assert.equal(
      validate(fixture),
      true,
      formatValidationErrors(validate.errors),
    );
  });

  test(`${fixtureCase.name} rejects invalid content`, async () => {
    const validate = ajv.getSchema(fixtureCase.schema);
    assert.equal(typeof validate, "function");

    const fixture = await loadFixture(fixtureCase.invalid);
    assert.equal(validate(fixture), false, "Expected fixture to be rejected.");
    assert.ok(
      validate.errors?.some(
        ({ keyword }) => keyword === fixtureCase.invalidKeyword,
      ),
      formatValidationErrors(validate.errors),
    );
  });
}
