import type { Maker, Product, Comment } from "@saas/db/launches";
import type { PublicComment, PublicMaker, PublicProduct } from "@saas/contracts/launches";
import { commentPublicId, productPublicId } from "./ids.js";

export function toPublicMaker(m: Maker): PublicMaker {
  return {
    handle: m.handle,
    displayName: m.displayName,
    bio: m.bio,
    websiteUrl: m.websiteUrl,
    twitter: m.twitter,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toPublicProduct(p: Product, maker: Maker | null, viewerHasUpvoted: boolean): PublicProduct {
  return {
    id: productPublicId(p.id),
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    url: p.url,
    tags: p.tags,
    status: p.status,
    launchedAt: p.launchedAt ? p.launchedAt.toISOString() : null,
    upvoteCount: p.upvoteCount,
    commentCount: p.commentCount,
    maker: maker ? toPublicMaker(maker) : null,
    viewerHasUpvoted,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toPublicComment(c: Comment, author: Maker | null): PublicComment {
  return {
    id: commentPublicId(c.id),
    body: c.body,
    author: author ? toPublicMaker(author) : null,
    createdAt: c.createdAt.toISOString(),
  };
}
