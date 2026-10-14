# subscriptions-worker

The Subscriptions bounded context: a recurring-expense tracker. Owns the
subscriptions a person is paying for — amount, currency, cadence, anchor date,
category and status — and derives every future renewal from the anchor rather
than storing a date that can drift. Reached only through the api-edge
`subscriptions-facade`; entirely user-scoped, with no public surface.
