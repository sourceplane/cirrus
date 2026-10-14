import type { Block, Page } from "@saas/db/pages";
import type { PublicBlock, PublicPage } from "@saas/contracts/pages";
import { blockPublicId } from "./ids.js";

export function toPublicPage(p: Page): PublicPage {
  return {
    handle: p.handle,
    title: p.title,
    bio: p.bio,
    theme: p.theme,
    published: p.published,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toPublicBlock(b: Block): PublicBlock {
  return {
    id: blockPublicId(b.id),
    kind: b.kind,
    title: b.title,
    url: b.url,
    description: b.description,
    priceCents: b.priceCents,
    currency: b.currency,
    position: b.position,
    enabled: b.enabled,
  };
}
