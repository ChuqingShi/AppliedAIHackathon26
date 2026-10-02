import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card">
      <div className="empty">
        That page isn&rsquo;t part of your dashboard. <Link href="/overview" className="link">Back to the overview</Link>
      </div>
    </div>
  );
}
