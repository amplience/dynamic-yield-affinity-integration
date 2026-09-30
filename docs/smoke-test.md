# Non-production Amplience smoke test

Complete this checklist in a non-production Amplience hub before publishing a
release. Record the outcome on the release pull request without including
credentials, personal data, or sensitive tenant details.

## Test record

- Release candidate:
- Tester:
- Date:
- Non-production hub identifier:
- Result: pending

## Checklist

- [ ] Register the hierarchy chooser as a Content Field extension named
      `hierarchy-chooser` with read access and same-origin sandbox permission.
- [ ] Add the affinity value and affinity group schemas and register their
      content types.
- [ ] Add the targeting partial, then add and register the example banner and
      content container schemas.
- [ ] Create brand, gender, and lifecycle-stage roots with the delivery keys
      documented in the README.
- [ ] Create and publish at least one affinity value below each root, with
      distinct `label` and `value` fields.
- [ ] Open an example banner and confirm each chooser loads values from its
      configured root.
- [ ] Select targeting values, save the banner, and publish it.
- [ ] Create a content container with the banner, then save and publish it.
- [ ] Retrieve the container through Content Delivery v2 with `depth=all` and
      `format=inlined`.
- [ ] Confirm the response includes the candidate banner and the selected
      affinity items with both `label` and `value`.
- [ ] Record evidence and any deviations on the release pull request.

## Release gate

Do not publish the GitHub prerelease until this smoke test passes, both CI jobs
pass, and the release pull request has the required reviews.
