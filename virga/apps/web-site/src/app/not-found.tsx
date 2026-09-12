import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-3 text-muted">There's nothing at this address.</p>
      <p className="mt-6"><Link href="/" className="text-accent underline">Back to the site</Link></p>
    </div>
  );
}
