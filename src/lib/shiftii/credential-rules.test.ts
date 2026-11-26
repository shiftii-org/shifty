import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCredentialName, validateWarningDays, validateCredentialDates,
  validateIdentifierLast4, credentialCoversShift,
} from "./credential-rules.ts";

test("certificate names normalized and invalid names rejected", () => {
  assert.equal(normalizeCredentialName("  First  Aid  & CPR "), "First Aid & CPR");
  for(const value of ["", " ", "a", "x".repeat(101)]) {
    assert.throws(() => normalizeCredentialName(value));
  }
});

test("expiry warning days must be whole numbers in the valid range", () => {
  assert.equal(validateWarningDays(0), 0);
  assert.equal(validateWarningDays(365), 365);
  for(const value of [-1,366,1.5,Infinity,NaN]) {
    assert.throws(() => validateWarningDays(value));
  }
});

test("reject impossible dates and expiry before issue date", () => {
  assert.deepEqual(validateCredentialDates("2026-06-01", "2028-06-01"),
    {issuedAt:"2026-06-01",expiresAt:"2028-06-01"});
  assert.deepEqual(validateCredentialDates(),{issuedAt:null,expiresAt:null});
  for(const a of [["2026-02-30","2027-01-01"],["2026-01-01","2025-12-31"],["not a date",null],["2026-12-01","2026-13-01"]] as const) {
    assert.throws(() => validateCredentialDates(a[0],a[1]));
  }
});

test("only four trailing characters, no full licence number", () => {
  assert.equal(validateIdentifierLast4("a93Z"),"a93Z");
  assert.equal(validateIdentifierLast4(null),null);
  for(const value of ["12345","123","ab-c","1 23","123456789"]) {
    assert.throws(() => validateIdentifierLast4(value));
  }
});

test("shift eligibility requires verified effective unexpired credential", () => {
  const certificate={issuedAt:"2026-01-01",expiresAt:"2026-12-31",verified:true};
  assert.equal(credentialCoversShift(certificate,"2026-11-25"),true);
  assert.equal(credentialCoversShift(certificate,"2026-12-31"),true);
  assert.equal(credentialCoversShift(certificate,"2027-01-01"),false);
  assert.equal(credentialCoversShift(certificate,"2025-12-31"),false);
  assert.equal(credentialCoversShift({...certificate,verified:false},"2026-11-25"),false);
  assert.equal(credentialCoversShift({issuedAt:null,expiresAt:null,verified:true},"2026-11-25"),true);
  assert.equal(credentialCoversShift(certificate,"2026-02-30"),false);
});
