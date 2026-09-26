import assert from "node:assert/strict";
import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.QUAL_STORAGE_TEST_PASSWORD;
assert.ok(url?.includes("nisipxbuvndobyxqqglf"), "isolated branch URL required");
assert.ok(key, "branch publishable key required");
assert.ok(password, "QUAL_STORAGE_TEST_PASSWORD required");

const client = () => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const owner = client();
const member = client();
const groupId = "22222222-2222-4222-8222-22222222b501";
const recordId = "c5bc344b-c374-4a9f-a2fe-a6f5211375f1";
const objectKey = `minutes/${groupId}/${recordId}/${crypto.randomUUID()}-qualification.txt`;
const request = () => crypto.randomUUID();

const ownerLogin = await owner.auth.signInWithPassword({
  email: "qualification-lock-owner@example.test",
  password,
});
assert.equal(ownerLogin.error, null, ownerLogin.error?.message);

const upload = await owner.storage
  .from("group-documents")
  .upload(objectKey, Buffer.from("fictional qualification attachment\n"), {
    contentType: "text/plain",
    upsert: false,
  });
assert.equal(upload.error, null, upload.error?.message);

const attach = await owner.rpc("execute_minutes_command", {
  p_request_id: request(),
  p_command: {
    group_id: groupId,
    action: "attach",
    record_id: recordId,
    expected_revision: 1,
    attachment_bucket: "group-documents",
    attachment_object_key: objectKey,
  },
});
assert.equal(attach.error, null, attach.error?.message);

const ownerSignedDraft = await owner.storage
  .from("group-documents")
  .createSignedUrl(objectKey, 60);
assert.equal(ownerSignedDraft.error, null, ownerSignedDraft.error?.message);

const replace = await owner.storage
  .from("group-documents")
  .update(objectKey, Buffer.from("replacement must be denied\n"), {
    contentType: "text/plain",
  });
assert.ok(replace.error, "official object replacement must be denied");

const remove = await owner.storage.from("group-documents").remove([objectKey]);
assert.ok(remove.error, "official object deletion must be denied");

const publish = await owner.rpc("execute_minutes_command", {
  p_request_id: request(),
  p_command: {
    group_id: groupId,
    action: "publish",
    record_id: recordId,
    expected_revision: 1,
  },
});
assert.equal(publish.error, null, publish.error?.message);

const memberLogin = await member.auth.signInWithPassword({
  email: "qualification-storage-member@example.test",
  password,
});
assert.equal(memberLogin.error, null, memberLogin.error?.message);

const memberSignedPublished = await member.storage
  .from("group-documents")
  .createSignedUrl(objectKey, 60);
assert.equal(memberSignedPublished.error, null, memberSignedPublished.error?.message);

const lateObject = `minutes/${groupId}/${recordId}/${crypto.randomUUID()}-late.txt`;
const memberUpload = await member.storage
  .from("group-documents")
  .upload(lateObject, Buffer.from("must be denied\n"), {
    contentType: "text/plain",
    upsert: false,
  });
assert.ok(memberUpload.error, "ordinary member upload must be denied");

const withdraw = await owner.rpc("execute_minutes_command", {
  p_request_id: request(),
  p_command: {
    group_id: groupId,
    action: "withdraw",
    record_id: recordId,
    expected_revision: 1,
  },
});
assert.equal(withdraw.error, null, withdraw.error?.message);

const memberSignedWithdrawn = await member.storage
  .from("group-documents")
  .createSignedUrl(objectKey, 60);
assert.ok(memberSignedWithdrawn.error, "member read after withdrawal must be denied");

const ownerSignedWithdrawn = await owner.storage
  .from("group-documents")
  .createSignedUrl(objectKey, 60);
assert.equal(ownerSignedWithdrawn.error, null, ownerSignedWithdrawn.error?.message);

console.log(JSON.stringify({
  result: "OFFICIAL_ATTACHMENT_STORAGE_API_PASS",
  backend: "nisipxbuvndobyxqqglf",
  replacementDenied: true,
  deletionDenied: true,
  memberPublishedRead: true,
  memberWithdrawnReadDenied: true,
  managerRetainedRead: true,
}));
