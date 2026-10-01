import { createFormsRepository } from "@site/db/forms";
import { testId } from "@site/testing/ids";
import { executorOverFreshDatabase, T0, T1 } from "./helpers";

describe("forms repository (real SQLite)", () => {
  it("stores a submission as new with its fields round-tripped", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createFormsRepository(executor);
    const created = await repo.create({
      id: testId("frm", "1"), form: "contact", fields: { name: "Ada", message: "Hi <b>there</b>" },
      visitor: "fp-1", now: T0,
    });
    expect(created.ok && created.value).toMatchObject({
      form: "contact", status: "new", visitor: "fp-1", fields: { name: "Ada", message: "Hi <b>there</b>" },
    });
    const found = await repo.findById(testId("frm", "1"));
    expect(found.ok && found.value.fields.message).toBe("Hi <b>there</b>");
  });

  it("filters by form and status, pages, and triages", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createFormsRepository(executor);
    await repo.create({ id: testId("frm", "a"), form: "contact", fields: {}, visitor: null, now: T0 });
    await repo.create({ id: testId("frm", "b"), form: "feedback", fields: {}, visitor: null, now: T1 });
    await repo.create({ id: testId("frm", "c"), form: "contact", fields: {}, visitor: null, now: T1 });
    const contact = await repo.list({ form: "contact" });
    expect(contact.ok && contact.value.items.map((s) => s.id)).toEqual([testId("frm", "c"), testId("frm", "a")].sort((x, y) => (x < y ? 1 : -1)));
    const marked = await repo.updateStatus(testId("frm", "b"), "spam", T1);
    expect(marked.ok && marked.value.status).toBe("spam");
    const spam = await repo.list({ status: "spam" });
    expect(spam.ok && spam.value.items.length).toBe(1);
    const counts = await repo.counts();
    expect(counts.ok && counts.value).toEqual({ new: 2, total: 3 });
    expect((await repo.updateStatus(testId("frm", "zz"), "read", T1)).ok).toBe(false);
  });

  it("rejects a status the schema does not know", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createFormsRepository(executor);
    await repo.create({ id: testId("frm", "a"), form: "contact", fields: {}, visitor: null, now: T0 });
    const bad = await repo.updateStatus(testId("frm", "a"), "bogus" as never, T1);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error.kind).toBe("internal");
  });
});
